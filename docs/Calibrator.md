# Calibrator

`Calibrator` (`explain/helpers/Calibrator.js`) is **engine infrastructure**, not a physiological model. It is a shared closed-loop calibrator: it drives measured physiological quantities (MAP, cardiac output, heart rate, PaO2/SpO2, PaCO2, base excess/pH, blood volume) toward target values by iterating one lever per target — apply lever → advance the model → measure → nudge → repeat. The nudge uses a proportional seed for the first move, then switches to the **secant method** once two samples exist.

The module is environment-agnostic on purpose. It is used by **two callers, both with direct `model` access**:

- `scripts/build_patient.mjs` (Node) — closed-loop builder that calibrates a fresh patient from a baseline definition (imports `makeController`, `runCalibration`).
- `explain/ModelEngine.js` (Web Worker) — `tune_model` tunes the **running** model in place (imports `buildLiveControllers`, `runCalibration`, `measureWindow`).

Each caller injects a `step(seconds)` callback (advance the model) and a `measureAll()` callback (read averaged vitals); the loop itself knows nothing about how the model runs. See [ARCHITECTURE](./ARCHITECTURE.md) for the worker message protocol and the factor/`_eff` pattern the live levers rely on.

## Role in the engine

In the worker, `ModelEngine.tune_model(payload)` performs a live, in-place calibration: it pauses the realtime loop, builds a `stepFn` that calls `_model_step()` synchronously, builds controllers from the requested `targets`, runs `runCalibration`, emits a `tuned` message with the result, then resumes realtime from the new operating point. No reload and no `ModelScaler` reset are involved — the levers compose with the patient's already-baked scaling. Outside the engine, `build_patient.mjs` uses the same `runCalibration` loop with its own controllers to converge a new patient before saving the definition.

## Key state / configuration it reads

- **`SLICE`** (`0.02` s) — module-private sub-cardiac-cycle sample step used by `measureWindow` for windowed averaging.
- **`DEFAULT_TOL`** (exported) — per-target convergence tolerances on the measured value:
  `map: 3`, `cvp: 1.5`, `pap_m: 3`, `hr: 6`, `co: 0.03`, `spo2: 2`, `po2: 6`, `pco2: 4`, `ph: 0.03`, `be: 1.5`, `blood_volume: 0.02`. Callers may override per target via `tolOverrides`.
- **`LIVE_TARGETS`** (exported) — the canonical list of live-tunable target names, for validation / UI / docs: `["map", "co", "hr", "po2", "spo2", "pco2", "be", "ph", "blood_volume"]`.
- **`LIVE_READ`** (module-private) — a map from measure key to a reader that pulls the value off the running `model` (e.g. `map` ← `Monitor.minmax.abp_pre_pres_mean`, `lvo` ← `Monitor.flows.lvo`, `po2`/`pco2`/`ph`/`be` ← the `AA` compartment, `total_blood_volume` ← `Circulation`). Used by `measureWindow`.
- **`READ_KEY`** (module-private) — maps a canonical target name to the measure-dict key it reads when they differ: `co → lvo`, `spo2 → spo2_pre`, `blood_volume → total_blood_volume`.

## Key methods / exports

- **`makeController(spec)`** — wraps a lever spec into a stateful controller. Spec fields: `key` (canonical target, e.g. `"co"`), `readKey` (key into the measured dict, defaults to `key`), `lo`/`hi` (clamp bounds), `sign` (+1 if raising the lever raises the measured value), `gain` (proportional seed gain), `value` (current lever value), `set(v)` (apply lever to the model), `target`, `tol`. Its `step(measured)` method returns `false` (no move) when the measurement is within `tol` or non-numeric; otherwise it computes the next lever value — secant (`value + (target-measured)/slope`) once `prevL`/`prevM` exist and the slope is well-defined, else proportional (`value + sign*gain*(target-measured)`) — clamps to `[lo, hi]`, records the previous sample, applies via `set`, and returns `true`.
- **`runCalibration(controllers, opts)`** — the generic loop, shared by build + live tune. `opts`: `measureAll()`, `step(seconds)`, `settle` (default 90 s; one settle step before iterating), `warm` (45 s between iterations), `maxIters` (12), `final` (0; optional extra settle at the end), `log`. Each iteration measures all read keys, calls `step(v[readKey])` on every controller, and breaks early when no controller moved (converged). Returns `{ iters, converged, residuals: [{key, target, value, within}], measured }`.
- **`measureWindow(model, step, keys, window = 12)`** — advances the model in `SLICE`-sized increments over `window` seconds, averaging each requested key via `LIVE_READ`. This is the `measureAll` implementation the worker passes to `runCalibration`. (The `Monitor` model already beat-averages; this adds a short window on top for robustness.)
- **`buildLiveControllers(model, targets, tolOverrides = {})`** — builds the live-tune controller set from a `{name: value}` targets map. Returns `{ controllers, keys }`, where `keys` is the de-duplicated list of measure-dict keys to sample. Only creates a controller for targets present in `targets` (and whose required model exists). See levers below.

## Closed-loop control

Each controller couples one **lever** (a model property it writes via `set`) to one **measured quantity** (read by `readKey`). `runCalibration` settles, then repeatedly measures and lets every controller nudge its lever; convergence is "no controller moved this iteration," and per-target success is `|target − measured| ≤ tol`. The first nudge is proportional (seeded by `gain`/`sign`); thereafter each controller estimates local slope from its last two (lever, measurement) samples and takes a secant step, clamped to `[lo, hi]`.

The live levers built by `buildLiveControllers` deliberately use the persistent **`*_factor_ps`** layer or direct setters — **not `ModelScaler` groups** — so they compose with whatever scaling a loaded patient already baked in (e.g. a preterm's SVR/PVR scaling), instead of overwriting the `*_factor_scaling_ps` layer absolutely the way `ModelScaler` does (see [ModelScaler](./ModelScaler.md) and the factor/`_eff` pattern in [ARCHITECTURE](./ARCHITECTURE.md)):

| Target | Lever | Notes |
|---|---|---|
| `map` | `r_factor_ps` on every resistor in `scaler_config.blood_systemic.resistance` (delta-accumulating), plus `BR_MAP.set_value` = target | systemic resistance; ↑ raises MAP. Deliberately **not** `Circulation.svr_factor_art`: the Hormones model (RAAS) overwrites that knob every step, so a write to it does not stick. The baroreflex set-point is moved to the target so the ANS defends the new operating point. |
| `co` | `LV.el_max_factor_ps` and `RV.el_max_factor_ps` | ventricular contractility; reads `lvo` |
| `hr` | `Heart.heart_rate_ref` | HR reference setpoint |
| `po2` / `spo2` | `GASEX_LL.dif_o2_factor_ps` and `GASEX_RL.dif_o2_factor_ps` | alveolar O2 diffusion factor; one controller, reads `po2` or `spo2_pre` |
| `pco2` | `Breathing.minute_volume_ref` (× multiplier) | spontaneous ventilatory drive; `sign: -1` (↓ drive raises pCO2) |
| `be` / `ph` | `Blood.set_solute("uma", …)` | Stewart unmeasured anions; `sign: -1` (↑ uma lowers BE/pH) |
| `blood_volume` | proportional rescale of every blood compartment's `vol`/`u_vol` | custom `step` (not a secant lever): scales by `target/measured` each iteration; converges in 1–2 iters because the body redistributes volume |

## The offline builder (`scripts/build_patient.mjs`)

The builder shares `makeController`/`runCalibration` but has its **own** controllers, because it
starts from a freshly built baseline rather than a running patient. Two differ from the live table:
`map` scales the `systemic_resistances` `ModelScaler` group (and `pap_m` the `pulmonary_resistances`
group), and it adds `cvp` ← venous unstressed volume (`VLB`/`VUB` `u_vol`). On a fetal baseline the
oxygen and CO2 levers are the placental maternal pool instead (see [fetal_circulation](./fetal_circulation.md)).

Before calibrating it applies the **structural** targets: `weight`, `gestational_age` (a seed bundle),
`height`, `age`, `hb`/`hb_gdl`, `temp`, `pda` and **`fio2`**.

**`targets.fio2`** (fraction, 0.21–1.0) sets the inspired oxygen the patient breathes, via
`Gas.set_fio2`, before the loop runs. This matters for what the oxygen lever means: alveolar diffusion
is fitted to the measured SpO2/PO2 *at that FiO2*. A saturation of 91 % on 40 % oxygen needs much
worse gas exchange than 91 % in room air; without `fio2` the builder assumes room air and gives a
baby on oxygen far healthier lungs than it has. Rejected on a fetal baseline and outside 0.21–1.0.

**`build_report`** — the emitted scenario carries a top-level, machine-readable report (stderr keeps
the human-readable one):

| Field | Meaning |
|---|---|
| `converged`, `iters`, `max_iters` | outcome of the loop |
| `targets[]` | per calibrated target: `target`, `value`, `delta`, `tolerance`, `within`, `lever`, `lever_value`, `lever_bounds`, `lever_at_bound` |
| `measured` | every measured vital: `{ value, flag }`, flag from the profile's `RANGES` (`ok`/`LOW`/`HIGH`) |
| `structural` | the structural targets that were applied |
| `ignored_targets` | `targets` keys the builder does not know. They are **ignored**, so they are listed |
| `superseded_targets` | `spo2` when `po2` is also given, `ph` when `be` is: one lever each, the first wins |
| `notes` | e.g. `pco2` targeted while spontaneous breathing is off (its lever cannot move it) |

`lever_at_bound: true` means the lever ran into its limit: the target is out of that lever's reach,
which is different from "needs more iterations". The scenario's `provenance` is set to
`"calibrator-fitted"` (it used to inherit the baseline's).

## Notes / caveats

- **`blood_volume` is special.** Its controller overrides `step` to proportionally rescale `vol`/`u_vol` on every blood-bearing compartment (those with a numeric `vol` and a non-empty `solutes` map), excluding `ECLS*` and `URINE`. It has `gain: 0` and a no-op `set` because it does not move a single lever.
- **Live tune is synchronous and pauses realtime.** `tune_model` clears the realtime interval and disables `DataCollector.rt_active` while calibrating, then resumes (`start()`) in a `finally` block. It uses shorter defaults than the builder (`settle: 20`, `warm: 15`, `window: 10`) supplied via `opts`.
- **Convergence is not guaranteed.** `runCalibration` stops at `maxIters` (default 12) or when no controller moves; the returned `converged` flag and `residuals[].within` tell the caller which targets landed inside tolerance. The worker emits `"converged"` or `"incomplete"` accordingly.
- **Coupled targets interact.** Several levers affect each other's measured values (e.g. blood volume ↔ MAP/CVP, ventilation ↔ pH). The shared loop nudges all controllers each iteration and relies on re-measurement + the secant slope to settle the coupled system; tight or conflicting targets may not all converge.
- **`measureAll` keys must match `readKey`.** `buildLiveControllers` returns exactly the `keys` to sample; passing a different key set to `measureWindow` would leave controllers reading `undefined` and refusing to move.
