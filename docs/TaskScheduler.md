# TaskScheduler

`TaskScheduler` (`explain/helpers/TaskScheduler.js`) is **engine infrastructure, not a physiological model**. It is the engine's deferred-mutation helper: it coordinates changes to model properties that should happen later, gradually, or via a method call — gradual numeric tweens, instant boolean/string swaps, and scheduled function executions, all tied to the modeling timestep. It is instantiated once per build in the Web Worker — `ModelEngine.build()` does `model["TaskScheduler"] = new TaskScheduler(model)` — and lives on the engine `model` object alongside `DataCollector` and `ModelScaler`. See [ARCHITECTURE](./ARCHITECTURE.md) for the two-thread picture and [DataCollector](./DataCollector.md) for the read-side sibling.

## Role in the engine

The scheduler is the write side of the per-step loop. After data collection, `_model_step()` calls:

```js
_get_task_scheduler()?.run_tasks();
```

`run_tasks()` runs on **every** model step, but only evaluates queued tasks when its internal interval counter exceeds `_task_interval` (0.015 s). Tasks are enqueued from the worker's message router:

| Caller (in `ModelEngine.js`) | Maps to | Public API surface |
|---|---|---|
| `set_property(new_prop_value)` | `add_task(new_task)` | `setPropValue(prop, value, it, at)` |
| `call_function(new_function_call)` | `add_function_call(new_function_call)` | `callModelFunction(...)` |
| `_model_step()` | `run_tasks()` | — (internal step loop) |

So the lifecycle is: a client (user panel, scenario event, or bot command) posts a `setPropValue` / `callModelFunction` message → the worker enqueues a task → `run_tasks()` later fires it against the live model.

## Key state

| Field | Default | Meaning |
|---|---|---|
| `_model_engine` | ctor arg | reference to the engine `model` (exposes `models`, `modeling_stepsize`) |
| `_t` | `modeling_stepsize` | per-step time increment driving the interval counter |
| `_is_initialized` | `false` | init flag (carried for contract symmetry) |
| `is_enabled` | `true` | when `false`, the interval counter stops advancing (tasks freeze) |
| `_tasks` | `{}` | dictionary of pending tasks keyed by `"task_<rand>"` |
| `_task_interval` | `0.015` s | period at which the queue is evaluated |
| `_task_interval_counter` | `0.0` | accumulator, advanced by `_t` each call while enabled |

### Task types

Each task carries a numeric `type` that decides how it is applied:

| `type` | Trigger | Behavior |
|---|---|---|
| `0` | numeric target, `it > 0` | **tween** — `current_value` is stepped by `stepsize` each interval until it reaches `t`, then completes |
| `1` | boolean/string target, **or** numeric with `it <= 0` | **instant swap** — `current_value` set to `t` and written once, then completes |
| `2` | function call | **invoke** — `func.apply(model, args)` once, then completes |

`stepsize` for a type-0 tween is `(t - current_value) / (it / _task_interval)`; a tween whose computed `stepsize` is exactly `0` is **not** enqueued.

## Key methods

| Signature | What it does |
|---|---|
| `add_task(new_task)` | Resolves `new_task.model` (a name) to a live instance, reads the current value of `prop1`(`.prop2`), infers `type` (0 numeric / 1 boolean-string), computes the tween `stepsize` from `it`, and enqueues under a random `task_<id>` key. `it <= 0` forces an instant (type-1) write. |
| `add_function_call(new_function_call)` | Splits `func` (`"Model.method"`), resolves the model and the method reference, marks the task `type = 2`, and enqueues it to fire after `at` seconds. |
| `run_tasks()` | When `_task_interval_counter > _task_interval`: resets the counter, iterates `_tasks`, decrements each task's `at` delay; once `at` elapses it starts type-0 tweens, performs type-1 swaps and type-2 calls immediately, and steps running tweens toward `t`. Completed tasks are deleted. Advances the counter by `_t` only while `is_enabled`. |
| `remove_task(task_id)` | Deletes `"task_<task_id>"` if present; returns whether something was removed. |
| `remove_all_tasks()` | Empties `_tasks`. |
| `_set_value(task)` *(private)* | Writes `current_value` into `task.model[prop1]` or `task.model[prop1][prop2]`. |

### `setPropValue(prop, value, it, at)` semantics

- `prop` — the target dot-path (`Model.prop` or `Model.prop.subprop`); split into `model` / `prop1` / `prop2`.
- `value` (`t` on the task) — the destination value.
- `it` — interpolation time in seconds. `it > 0` on a numeric target tweens over that span (one increment per `_task_interval`); `it <= 0` writes instantly (type 1). Booleans/strings always write instantly.
- `at` — delay in seconds before the task begins; decremented by `_task_interval` each evaluation until it elapses.

## Interaction with models

The scheduler mutates live model instances **directly** by property assignment via `_set_value`. In practice the `prop1`/`prop2` target is typically a persistent factor (`*_factor_ps`) or a base parameter — writing the persistent layer is how a deferred adjustment composes with the factor/effective-value system (transient `*_factor` reset each step, persistent `*_factor_ps`, scaling `*_factor_scaling_ps`) described in [ARCHITECTURE](./ARCHITECTURE.md). Type-2 tasks instead call a model method (`func.apply(task.model, task.args)`), e.g. an intervention like `administer_surfactant` or `trigger_pvc`.

The complementary read-only telemetry helper is [DataCollector](./DataCollector.md); the two run back-to-back inside `_model_step()` (collect, then run tasks).

## Notes / caveats

- **Task ids are random and collidable.** `add_task` / `add_function_call` mint `"task_" + Math.floor(Math.random() * 10000)` with no uniqueness check, so two near-simultaneous tasks can in principle overwrite each other in `_tasks`. `remove_task` takes the numeric suffix.
- **Zero-delta tweens are silently dropped.** A type-0 task whose computed `stepsize` is `0.0` is never enqueued by `add_task` — if the current value already equals the target there is nothing to do.
- **`is_enabled = false` freezes time, not the queue.** When disabled, `_task_interval_counter` stops advancing, so pending tasks neither tick nor fire; they resume from where they were when re-enabled. Tasks already in `_tasks` are not cleared.
- **Completion is one-shot.** Type-1 and type-2 tasks complete on their first eligible evaluation; type-0 completes when the remaining distance to `t` is smaller than `|stepsize|` (the final write snaps exactly to `t`). Completed tasks `delete` themselves from `_tasks`.
- **`run_tasks()` is excluded from the model state clone.** `get_model_props` deletes `TaskScheduler` (and `DataCollector`) from the posted model copy, so its internal queue is not serialized across the worker boundary.
