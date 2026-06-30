# DataCollector

`DataCollector` (class `Datacollector`, `explain/helpers/DataCollector.js`) is **engine infrastructure, not a physiological model**. It is the engine's sampling/telemetry helper: it watches named model properties at two fixed rates and buffers their values so the main thread can pull time-series rows for charts and numeric read-outs. It is instantiated once per build in the Web Worker — `ModelEngine.build()` does `model["DataCollector"] = new DataCollector(model)` — and lives on the engine `model` object alongside `TaskScheduler` and `ModelScaler`. See [ARCHITECTURE](./ARCHITECTURE.md) for the two-thread picture and [TaskScheduler](./TaskScheduler.md) for the sibling mutation helper.

## Role in the engine

The collector sits inside the per-step loop. After every model has stepped, `_model_step()` calls:

```js
_get_data_collector()?.collect_data(model.model_time_total);
```

`collect_data(model_clock)` is therefore invoked on **every** model step, but it only actually samples when its internal interval counters have elapsed (see below). It does not advance the clock itself — it is handed `model.model_time_total`.

Who calls what, and when:

| Caller (in `ModelEngine.js`) | Method | When |
|---|---|---|
| `_model_step()` | `collect_data(model_clock)` | every step |
| `get_model_data()` / `_get_model_data_rt()` | `get_model_data()` | when the fast buffer is drained to the main thread |
| `get_model_data_slow()` / `_get_model_data_rt_slow()` | `get_model_data_slow()` | when the slow buffer is drained |
| `watch_props(args)` | `add_to_watchlist(prop)` | client subscribes a fast property |
| `watch_props_slow(args)` | `add_to_watchlist_slow(prop)` | client subscribes a slow property |
| `clear_watchlist()` / `clear_watchlist_slow()` | `clear_watchlist()` / `clear_watchlist_slow()` | client resets a watchlist |
| `stop()` / model rebuild path | `clean_up()` / `clean_up_slow()` | drop entries for disabled models |
| `build()` | `set_channels(writer, on_registry)` | wire the realtime typed transport |

The realtime loop flips `model.DataCollector.rt_active = true` on `start()` and back to `false` on `stop()`.

## Key state

| Field | Default | Meaning |
|---|---|---|
| `model` | — | back-reference to the engine `model` object |
| `watch_list` | `[ncc_atrial, ncc_ventricular]` | **fast** watch entries (resolved descriptors) |
| `watch_list_labels` | Set | dot-path labels already on the fast list (dedupe) |
| `watch_list_slow` | `[]` | **slow** watch entries |
| `watch_list_slow_labels` | Set | dedupe set for the slow list |
| `sample_interval` | `0.005` s | fast sampling period |
| `sample_interval_slow` | `1.0` s | slow sampling period |
| `_interval_counter` / `_interval_counter_slow` | `0` | accumulators, advanced by `modeling_stepsize` each call |
| `modeling_stepsize` | from `model` | step increment used to drive the counters |
| `collected_data` | `[]` | fast buffer (array of `{time, label: value, …}`) |
| `collected_data_slow` | `[]` | slow buffer |
| `legacy_mode` | `true` | when `true`, fast stream goes to `collected_data`; `set_channels()` sets it `false` to use the typed ring |
| `rt_active` | `false` | the typed ring is only written while the realtime loop runs |
| `_channels` / `_on_chart_registry` | `null` | non-enumerable (must not be structure-cloned with the model graph) |
| `registry_version`, `chart_slots`, `_chart_row` | — | typed-transport slot map / reusable Float64 scratch row |

The two ECG entries (`ncc_atrial`, `ncc_ventricular`) are constructed in the constructor and pushed onto `watch_list` immediately — see [Notes](#notes--caveats).

## Key methods

| Signature | What it does |
|---|---|
| `collect_data(model_clock)` | Samples each watchlist when its interval counter has reached the sample interval, resets that counter, appends one row (or writes one Float64 ring row), then advances both counters by `modeling_stepsize`. Disabled models contribute `0` (typed path) or are skipped (legacy path). |
| `add_to_watchlist(properties)` | Clears `collected_data`, resolves each string dot-path via `_find_model_prop`, appends new (non-duplicate) entries to `watch_list`. Returns `false` if any path failed to resolve. Rebuilds the chart index when not in legacy mode. |
| `add_to_watchlist_slow(properties)` | Same as above for `watch_list_slow` / `collected_data_slow`. |
| `get_model_data()` | Returns `collected_data` and **replaces it with `[]`** (drain-and-clear). |
| `get_model_data_slow()` | Drain-and-clear for the slow buffer. |
| `clear_data()` / `clear_data_slow()` | Empty a buffer without touching watchlists. |
| `clear_watchlist()` | Empties the fast watchlist, then re-adds the two always-present ECG entries; rebuilds the chart index. |
| `clear_watchlist_slow()` | Empties the slow watchlist (no always-present entries). |
| `clean_up()` | Filters `watch_list` down to entries whose `model.is_enabled` is truthy, rebuilds the labels set and chart index. |
| `clean_up_slow()` | Same for the slow watchlist. |
| `set_sample_interval(v=0.005)` / `set_sample_interval_slow(v=0.005)` | Change a sampling period. |
| `set_channels(writer, on_registry)` | Attach the realtime typed transport, set `legacy_mode = false`, build the initial chart slot index. |
| `_find_model_prop(prop)` *(private)* | Resolves a dot-path against `model.models` (see below). Returns a descriptor or `null`. |
| `_rebuild_chart_index()` *(private)* | Re-derives `chart_slots`, bumps `registry_version`, reallocates the ring, re-fires the registry callback. No-op without an attached writer. |

### How dot-paths resolve

Watched properties are strings of the form `"Model.prop"` or `"Model.prop.subprop"`, resolved against `model.models` by `_find_model_prop`:

- **Two segments** (`"Heart.ncc_ventricular"`): requires `t[0] in model.models` and `t[1] in model.models[t[0]]`. Returns `{label, model, prop1, prop2: null, ref}`.
- **Three segments** (`"AA.solutes.lactate"`): requires the model and `prop1` to exist; `prop2` is **not** verified at resolve time. Returns `{label, model, prop1, prop2}`. At sample time the value is read as `model[prop1][prop2] || 0`.
- Anything that fails these checks returns `null`, and the corresponding `add_to_watchlist*` call reports failure.

## Interaction with models

The collector reaches into live model instances purely by property read — it never mutates them. Each watch entry stores a direct `model` reference (the resolved component) plus `prop1`/`prop2`; at sample time it reads `parameter.model[parameter.prop1]` (optionally `[parameter.prop2]`). Disabled components are not sampled on the legacy path; on the typed path their slot is written as `0` so column alignment is preserved across the fixed-stride ring row.

This is the read side of the model contract; the write side (deferred mutation of `*_factor_ps` / base params) belongs to [TaskScheduler](./TaskScheduler.md).

## Notes / caveats

- **ECG counters are always watched.** The constructor pushes `Heart.ncc_atrial` and `Heart.ncc_ventricular` onto `watch_list` regardless of any user watchlist, and `clear_watchlist()` re-adds them. ECG reconstruction therefore always has its source data even when the client subscribed to nothing. These two entries resolve `model.models["Heart"]` at construction time, so the build must have a `Heart` component.
- **`get_model_data*` is destructive.** It returns the buffer and immediately resets it to `[]`. Call it once per drain; a second call returns nothing until more is collected.
- **`clean_up()` drops disabled-model entries.** After a model is disabled, its watch entries are filtered out so `collect_data` does not dereference a dead component; this also re-fires the chart-index rebuild in typed mode.
- **Two divergent collection paths.** With a `ChannelWriter` attached and `rt_active` true, the fast stream is packed into a Float64 ring (no per-sample object allocation). Offline `calculate()` and legacy mode keep using `collected_data`, so `get_model_data()` still returns rows. Slow data always uses the object buffer.
- **`_channels` / `_on_chart_registry` are non-enumerable** on purpose: `get_model_state` posts the whole model graph (which reaches the collector through every component's `_model_engine` back-reference), and these function-bearing fields must not be structure-cloned.
- **Time is rounded** to 4 decimals (`Math.round(model_clock * 10000) / 10000`) before being stored.
