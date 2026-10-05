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

**`maxStepFrac`** (opt-in, off for the live tuner, `0.5` in the offline builder): no step may move a lever by more than this fraction of its current value. A secant slope measured where the response is flat overshoots where it is steep — pCO2 against ventilatory drive is the typical case, one step from 0.67 to the 0.2 floor — and once the vital lands inside its tolerance the lever stays at that extreme, where it distorts other vitals (a baby breathing at minimum drive has a low alveolar pO2 that no diffusion lever can compensate).

**`signGuard`** (opt-in, off for the live tuner, on in the offline builder): a secant slope whose sign contradicts the controller's `sign` is rejected in favour of the proportional step. All controllers move at once, so part of a vital's change between two samples comes from its neighbours' levers; the secant then attributes it to its own lever and can read a physically impossible slope. Seen in a 7-target preterm build: with the new respiratory-rate lever moving pCO2, the oxygen controller walked alveolar diffusion to its *maximum* while SpO2 sat above target (with the guard it ends at its minimum, as expected on FiO2 0.4).

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

Two builder-only targets:

- **`sys` + `dia`** (a pair; one alone is ignored with a note): the builder derives the pulse pressure `pp = sys − dia` and, if `map` is absent, `map = dia + pp/3` (both listed under `build_report.derived_targets`). MAP keeps its resistance lever; `pp` gets **large-artery stiffness** — `el_base_factor_ps` on `AA`, `AAR`, `AD`, bounds 0.3–1.8. Stiffening raises systolic and lowers diastolic around a nearly unchanged mean, so the two levers barely interact. The upper bound is numerical, not physiological: the integrator goes unstable at about ×2 total arterial elastance (term; a calibrated 1.08 kg / 28 wk preterm: stable at ×1.99, unstable at ×2.17).

**Arterial stiffness follows size (builder only).** `weight_scale` shrinks arterial volumes but leaves their elastance, so a small baby's arteries would be as compliant as a term baby's: a 1.08 kg / 28 wk build had a pulse pressure of 11 mmHg against a reference of about 15–27. Measured aortic pulse-wave velocity falls far less with size than vessel volume does (term ~4.2–4.6 m/s, preterm at 32 wk corrected ~3.2 m/s), and preterm arteries are intrinsically stiffer than term ones ([Tauzin et al., Pediatr Res 2006](https://www.nature.com/articles/pr2006354)). By Bramwell-Hill (PWV² = V·E/ρ) a roughly constant PWV with V ∝ W needs E to rise as W falls. The builder sets `el_base_factor_scaling_ps` on the systemic arteries (`AA`, `AAR`, `AD`, `RLB`, `RUB`, `*_ART`) to **(W/W0)^-0.5**, where W0 is the baseline's weight. On the 1.08 kg case that is ×1.81: implied PWV 0.74 of term, matching the measured preterm/term ratio of 0.70–0.76. Without a pressure-pair target the pulse pressure then lands at about 16–18 mmHg, up from 11. It depends on heart rate: about 16 at the ~170/min an untargeted build settles at, about 18 with HR 158 targeted.

The exponent is also the ceiling of what the model can integrate. Exponents 0.75 and 1 (×2.44, ×3.28 at 1.08 kg) go unstable, so the factor is capped at ×1.9, which binds below about 0.98 kg (a 0.64 kg / 24 wk baby would need ×2.35; the build notes say so). The pulse-pressure lever multiplies on top (`BloodVessel` composes elastance factors multiplicatively), so its upper bound is `min(1.8, 2.0 / size factor)`. A 28 wk patient therefore starts at a pulse pressure of about 16–18, and a sys/dia target lifts it to about 20 at most: a 48/24 target ends with the lever at its bound (×1.10) at 20.2. The upper half of the preterm reference range needs a smaller `modeling_stepsize`. Term builds (no weight change), fetal mode and the live `ModelScaler.scale_to_weight` are unchanged. As a backstop, a build whose final pressures are non-finite, negative diastolic, systolic above 250 or output above 10 L/min is refused (exit 1) instead of emitted.
- **`rr`** — spontaneous respiratory rate via `Breathing.vt_rr_ratio_factor`. Breathing sets `rate = √(target minute volume / (ratio × weight))`, so the controller steps in closed form, `f ← f × (measured / target)²`, bounds 0.2–5. Minute volume stays with the pCO2 lever; the two interact only through dead space. Refused (exit 1) when spontaneous breathing is off.

**Plasma solutes** — `na`, `k`, `cl`, `lactate`, `glucose` (mmol/L) and `albumin` (g/L) are structural: written to every blood compartment with `Blood.set_solute` before the loop. They feed the Stewart solver (`sid = na + k + 2ca + 2mg − cl − lact`, albumin as a weak acid), so with them a `be`/`ph` target is fitted by the unmeasured anions (`uma`) *left over* after the measured ions, rather than `uma` absorbing the whole acidosis. Two have their own controllers, which are moved with them: `Lactate.lact_baseline` (clearance target, t½ ≈ 6 min) and `Glucose.glucose_setpoint`. Kidney filtration moves the others only slightly over a build; the final arterial values are read back into `build_report.solutes`. If the measured ions already explain more than the measured acidosis, `uma` hits its floor of 0 and the BE target is reported missed with its lever at bound.

**Echo inputs:**

- **`pda_mm`** (structural): the duct's measured diameter at its narrowest, pulmonary end, in mm (0 = closed). The model sizes the duct as `diameter_relative × diameter_pa_max` (and `× diameter_ao_max` at the aortic end), so this sets `diameter_relative = pda_mm / diameter_pa_max`, first widening both maxima when the measured duct is larger. Takes precedence over the 0–1 `pda` fraction. Shunt direction and size are then outcomes of the pressures on either side (`build_report.measured.q_da`, L/s, + = left-to-right).
- **`pap_s`** (iterated): systolic pulmonary artery pressure, the value an echo gives from the tricuspid regurgitation jet (4v² + right atrial pressure). Same lever as `pap_m` (pulmonary resistance scale); `pap_m` wins when both are given.
- **`fo_mm`** (structural): the measured opening of the foramen ovale / atrial septum, in mm (0 = closed). Sets `Shunts.diameter_fo`, which sizes the FO resistors (`LA_RAIVCI`, `LA_RASVC`) by Poiseuille; `diameter_fo_max` is widened when the opening is larger (accepted up to 15 mm). The baseline's flap-valve asymmetry is kept: left-to-right flow meets `fo_lr_factor` × the right-to-left resistance (25 in `term_neonate`), so a 3 mm PFO in a term baby carries about 50 mL/min left-to-right; with no asymmetry it would be about 190. Direction and size are outcomes (`build_report.measured.q_fo`, L/s, + = left-to-right). Refused on a fetal baseline, where the gestational-age seed sizes the foramen.
- **`ef`** (iterated): LV ejection fraction in %, as `Heart.lv_ef` (stroke volume / end-diastolic volume of the last beat). Lever: `LV.el_max_factor_ps` (LV contractility only, since an echo EF is left-ventricular), bounds 0.3–3, tolerance 5 %-points. This is the lever `co` uses on both ventricles, and `co` keeps it when both are given (`ef` is then listed under `superseded_targets` and only reported): output is the input that separates flow from resistance. Contractility moves EF far more than output (on `term_neonate`, ×0.6–1.6 gives EF 47–70 % but LVO only 179–207 mL/kg/min), so a CO fitted on this lever can leave EF well away from the echo value. The normal-range tables have no EF row, so it is reported without a flag.

**The pulmonary-resistance lever moves the intrapulmonary shunt with the bed (builder only).** `pulmonary_resistances` scales the `blood_pulmonary.resistance` group, which does not include the intrapulmonary shunt resistors (`IPSL`/`IPSR`). On its own, raising pulmonary pressure therefore also raised the fraction of pulmonary flow bypassing ventilated alveoli: on a 1.08 kg / 28 wk case, from 33 % to 46 % at systolic PAP 36, SpO2 92.6 → 85.7. That is not the physiology. Pulmonary hypertension desaturates through the duct and foramen, and the shunt vessels constrict with the rest of the bed (see [Shunts](./Shunts.md#what-the-intrapulmonary-shunt-stands-for)). So the builder's PAP lever also sets `r_factor_scaling_ps` on `IPSL`/`IPSR`, **relative to its starting value** (`f / f0`, with `f0` the seed's or `pathophysiology.pvr_scale`'s PVR). The seed's `ips_res` was calibrated with the seed PVR on the bed only, so that operating point does not move. On the same case at systolic PAP 36 the shunt fraction now stays at 33.4 %, SpO2 drops only to 91.7, and the ductal left-to-right flow falls from 55 to 27 mL/min. Builds without a PAP target, and the structural-only seed PVR, are unchanged. The live scaler's `pulmonary_resistances` group is unchanged too.

Before calibrating it applies the **structural** targets: `weight`, `gestational_age` (a seed bundle),
`height`, `age`, `hb`/`hb_gdl`, `temp`, `pda`/`pda_mm`, `fo_mm` and **`fio2`**. A spec with only structural targets (or none) is still built: there is nothing to iterate, so the patient is settled for `settle_seconds + final_seconds`, measured and emitted with an empty `targets` list and a note saying nothing was calibrated.

The gestational-age seed is for a term baseline. A baseline that is already preterm (`preterm_*wk`, `bischoff_cohort`: its `gestational_age` is below 37) carries the seed's multiplicative adjustments, so a spec that adds `gestational_age` below 37 to it is refused (exit 1) instead of applying prematurity twice. Use `term_neonate` + `gestational_age`, or the preterm baseline without it. Fetal baselines use their own seed table and are exempt.

**`targets.fio2`** (fraction, 0.21–1.0) sets the inspired oxygen the patient breathes, via
`Gas.set_fio2`, before the loop runs. This matters for what the oxygen lever means: alveolar diffusion
is fitted to the measured SpO2/PO2 *at that FiO2*. A saturation of 91 % on 40 % oxygen needs much
worse gas exchange than 91 % in room air; without `fio2` the builder assumes room air and gives a
baby on oxygen far healthier lungs than it has. Rejected on a fetal baseline and outside 0.21–1.0.

**Oxygen lever below the diffusion floor (builder only).** On high FiO2 the diffusion factor can reach its floor (×0.1) with the baby still saturating above target: a 1.08 kg / 28 wk preterm on 40 % oxygen stopped at SpO2 92.8. The builder's oxygen controller therefore runs on one continuous scale, bounds 0.01–8. Above 0.1 it is the diffusion factor, exactly as before. Below it, diffusion stays at 0.1 and the intrapulmonary shunt opens: `Shunts.ips_res` falls in proportion to the lever, down to a tenth of the patient's starting value (the gestational-age seed's, e.g. 1900 at 28 wk). That is also the clinical picture: a sick preterm's hypoxaemia on oxygen is mostly shunt. On that case, ips_res 1900 → 800 → 300 takes SpO2 from 92.8 to 82.6 and 56, with MAP, PAP and output nearly unchanged and pCO2 a few mmHg higher (the pCO2 lever compensates). A build that opened the shunt says so under `build_report.notes`. Builds whose oxygen lever stays above 0.1 are unchanged. The live tuner (`buildLiveControllers`) still uses diffusion alone.

**`build_report`** — the emitted scenario carries a top-level, machine-readable report (stderr keeps
the human-readable one):

| Field | Meaning |
|---|---|
| `converged`, `iters`, `max_iters` | outcome of the loop |
| `targets[]` | per calibrated target: `target`, `value`, `delta`, `tolerance`, `within`, `lever`, `lever_value`, `lever_bounds`, `lever_at_bound` |
| `measured` | every measured vital: `{ value, flag }`, flag from the profile's `RANGES` (`ok`/`LOW`/`HIGH`) |
| `structural` | the structural targets that were applied |
| `derived_targets` | `pp` (and `map`) computed from `sys`/`dia` |
| `solutes` | per solute set: `{ set, value }`, the arterial (AA) value after calibration |
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
