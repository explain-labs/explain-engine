# Thermoregulation

The `Thermoregulation` model is the **body-temperature process controller** for the neonate — a slow
counterpart to [`Hormones`](./Hormones.md) (RAAS/ADH) and the [`Kidneys`](./Kidneys.md)
autoregulation loop. It holds no compartment of its own, resolves references to other models lazily,
runs on an `_update_interval` accumulator, and **owns its effector channels while enabled** (releasing
them once on disable). It models a **single well-mixed core node** whose temperature is the running
balance of heat produced against heat lost. Default config is **neutral**: thanks to the `_loss_trim`
auto-seed the core sits exactly at `setpoint_temp` (37 °C) at rest, every owned factor is `1.0`, and
baseline vitals/ABG are unchanged. The model only diverges when the thermal environment is perturbed
(cold incubator, radiant warmer, evaporative loss) or when heat production changes.

## Sensors → tissue node ⇄ blood pool → effectors

```
SENSORS (lazy refs)              TISSUE NODE (heat balance)                   EFFECTORS (owned, default-neutral)
Metabolism.vo2 · vo2_factor ──┐
env_temp / radiant_temp ──────┼─► Q_prod (metabolic + brown fat)            Metabolism.vo2_temp_factor    (Q10 metabolic coupling)
rel_humidity ─────────────────┼─► Q_loss (radiative+convective+evap +trim)  Heart.hr_temp_factor          (temperature → heart rate)
weight (Meeh SA) ─────────────┘    − Q_perf (exchange with blood pool)       Blood.set_perfusion_target(core) (blood warms toward core)
                                   dCore = (Q_prod − Q_loss − Q_perf)/C_t·dt  Gas.set_body_temperature(core)   (airway gas warms toward core)
                                        ⇅ Q_perf = G_perf·(core − blood_mean)
                                   BLOOD POOL (distributed; warms toward core via Blood's relaxation)
```

## Heat balance (two-node: tissue + blood pool)

The body thermal mass is split into a **tissue node** (this model's integrated `core_temp`) and the
**distributed blood pool** (every blood compartment's `temp`, warmed toward `core` by
[`Blood`](./Blood.md)'s per-step relaxation and advected around the circuit). They exchange heat by
perfusion. Every `_update_interval` (default **1 s** — temperature is slow), `_update_temperature(u)`
runs, with `u` the exact elapsed time since the last update:

```
Q_prod  = metabolic + brown_fat                                                  [W]
  metabolic = (vo2_eff · weight / 60) · caloric_equiv_o2
    vo2_eff = Metabolism.vo2 · Metabolism.vo2_factor · vo2_temp_factor           (mL O2/kg/min)
  brown_fat = min( bat_gain · max(0, setpoint − core), bat_max_per_kg · weight ) [W]
Q_loss_eff = SA·[ h_radiative·(core − radiant_eff) + h_convective·(core − env_temp) ]
             + SA·evap_coeff·(1 − rel_humidity) + Q_resp + _loss_trim            [W]
  SA = surface_area_k · weight^(2/3)              (Meeh surface area, m^2)
  radiant_eff = radiant_temp if set, else env_temp
  Q_resp = Gas.drain_respiratory_heat() / u       (airway gas conditioning, W)
Q_perf  = G_perf · (core − blood_mean)                                           [W]  (NEW)
  blood_mean = heat-capacity-weighted mean temperature over ALL blood compartments (Blood.get_thermal_state)
  C_blood  = blood_volume_per_kg · weight · blood_density · cp_blood   (coupling mass = circulating volume)
  G_perf   = C_blood / blood_temp_tc                  (perfusion conductance, W/K)
C_tissue = weight · heat_capacity − C_blood
dCore = (Q_prod − Q_loss_eff − Q_perf) / C_tissue · u                            [degC]
```

**The coupling is the point:** the blood pool absorbs exactly `Q_perf` via its relaxation (same
`G_perf`), so energy is conserved. Cooling the blood — e.g. an [`Ecls`](./Ecls.md) heater-cooler on
one compartment — lowers `blood_mean`, drives `Q_perf > 0`, and pulls the core down; rewarming
reverses it. **Neutral at rest by construction:** with no blood sink, the blood pool relaxes to
`core`, `blood_mean == core`, `Q_perf == 0`, and the balance reduces exactly to the former
single-node form — so the `_loss_trim` seed keeps `dCore = 0` and baseline vitals/ABG are unchanged.

> **Coupling mass = physiological circulating blood volume.** `blood_mean` is measured over *all*
> blood compartments, but the sum of their volumes (~193 mL/kg) is ~2.4× real blood volume because it
> includes organ vascular beds. Using that inflated mass for the perfusion coupling created an
> oversized thermal buffer that damped the cold/warm response and would have forced unphysical
> heat-transfer coefficients to compensate. So the coupling `C_blood` uses `blood_volume_per_kg`
> (0.08 L/kg, real circulating volume); `h_radiative`/`h_convective` were then recalibrated (×1.75, to
> 9.6/7.0 W/m²·K — still physical) so the cold response and brown-fat engagement match the former
> single-node model. The small price is that the relaxation warms the full temperature field while the
> core balance debits only the circulating mass — a bounded *transient* energy inexactness, zero at
> rest. `blood_temp_tc` (shared with `Blood`) tunes both the pool relaxation and, via `G_perf`, how
> fast the core follows the blood.

Neonates **cannot shiver**: below set-point they defend temperature by **non-shivering (brown-fat)
thermogenesis** (`brown_fat_heat`), a linear deficit term capped at `bat_max_per_kg · weight`. The
high neonatal surface-to-mass ratio (the Meeh `weight^(2/3)` term) is what makes them lose heat so
fast. A read-out-only `skin_temp = core_temp − skin_gradient` is also exposed.

## The auto-seed neutrality idiom

A neonate at rest is not in raw radiative/convective balance with a 32 °C incubator — clothing,
posture, nesting and insulation supply an offset the single-node geometry doesn't capture. Rather
than tune coefficients per scenario, the model **auto-seeds** it: at the first update after
`_warmup_delay` (5 s, to let the circuit settle), it sets

```
_loss_trim = Q_prod − q_loss_raw      (evaluated at core == setpoint)
```

so `Q_loss_eff == Q_prod` exactly and `dCore = 0`. The body is therefore **neutral at any baseline
weight, VO2, or env_temp the scenario ships with**, and only the *subsequent* change of
`env_temp` / `radiant_temp` / `rel_humidity` / VO2 moves the core. This is the same idiom as the
Hormones setpoint anchoring and the Kidneys TGF seed.

## Effectors (owned channels)

On each update `_apply_effectors()` maps core temperature to four channels, all default-neutral and
independent of `Ans` / `Drugs`:

| Channel | Mapping | Notes |
|---|---|---|
| `Metabolism.vo2_temp_factor` | `q10 ^ ((core − 37)/10)`, clamped `[vo2_temp_factor_min, vo2_temp_factor_max]` | Q10 metabolic coupling; folds into `vo2_eff` |
| `Heart.hr_temp_factor` | `1 + hr_temp_gain·(core − setpoint)`, clamped `[hr_temp_factor_min, hr_temp_factor_max]` | drives a previously-dormant Heart channel (already summed into HR in `Heart.calc`) |
| `Blood.set_perfusion_target(core)` | sets the target every blood compartment warms toward (via `Blood`'s relaxation), skipping device-controlled ones (`temp_ext_override`) | blood temperature feeds the (dT) term of the Stewart acid-base / O2-dissociation solver (`BloodComposition`), and the heat this exchange carries returns to the core balance via `Q_perf` |
| `Gas.set_body_temperature(core)` | propagates core temp to the body-warmed airway gas compartments (`DS`/`ALL`/`ALR`) | alveoli target core directly, dead space holds its build-time offset (≈5 °C) below it; sets each `GasCapacitance.target_temp` — see [`GasCapacitance`](./GasCapacitance.md). `MOUTH` (inspired-air source) is excluded |

The master gate `thermoregulation_running` (default `true`), when set `false`, calls
`_release_channels()` **once** — resetting `vo2_temp_factor`/`hr_temp_factor` to `1.0`,
`Blood.set_perfusion_target(37.0)` and `Gas.set_body_temperature(setpoint)` (restoring the build-time gas
targets) — then idles. This is the clean "off" switch; while enabled, manual edits to those channels
are overwritten each tick.

All four channels are **neutral at rest by construction**: at `core == setpoint` the factors are
`1.0`, blood is at set-point, and the gas targets equal their build values — so a scenario that ships
thermoregulation has unchanged baseline vitals/ABG until the thermal environment is perturbed.

## Respiratory heat loss (`Q_resp`)

Conditioning inspired gas — warming it to body temperature and saturating it with water vapour —
costs the body real heat. Rather than deriving that from minute ventilation, each
[`GasCapacitance`](./GasCapacitance.md) **meters the energy it actually drew from its wall**:
`add_heat` accumulates `n_gas · cp_molar · dT` into `_q_wall_sensible`, and `add_watervapour`
accumulates `n_h2o · latent_h2o` into `_q_wall_latent`. `Gas.drain_respiratory_heat()` sums and
clears both across the body-warmed compartments (`DS`, `ALL`, `ALR` — the keys of
`Gas._body_temp_delta`) and returns joules since the last call; this class divides by `u` to get
watts.

Reading the gas physics instead of computing `MV · (T_alv − T_insp)` matters for three reasons:

- It needs no spontaneous-vs-ventilated discrimination. `Breathing.minute_volume` is a per-breath
  latch that reads `0` under mechanical ventilation and can be up to 60 s stale during apnea, and
  `Breathing.exp_tidal_volume` is polluted by `VENT_ETTUBE.flow` during CPAP/PS — none of which can
  mislead a term driven by the gas actually moved.
- The drained total is **signed**, so heat and water recovered when expired gas cools and condenses
  in the dead space are credited back. That is real countercurrent airway recovery, and it is why
  the measured term (~0.87 W in `term_neonate`) sits below the ~1.24 W a bulk formula gives.
- `fixed_composition` compartments skip both routines, and only body-warmed compartments are
  drained, so the inspired-air source (`MOUTH`) and the device-heated `Ventilator`/`Ecls` gas lines
  contribute nothing without being special-cased.

**`Q_resp` is averaged over `resp_window` (30 s), not reported per update**, because
`_update_interval` (1 s) is shorter than a breath. An adult at 13 breaths/min swings between −0.8 W
and +19.4 W across the cycle about a true mean of 7.3 W. The running balance would be right on
average either way, but `_loss_trim` is seeded from a **single snapshot** — landing that on an
unlucky breath phase would bias resting core permanently (≈1 °C for an adult, since the trim error
divides by only `SA·(h_radiative + h_convective)` ≈ 12.7 W/K). The seed therefore also waits on
`_resp_ready`, set when the first full window closes, so it is always fed a breath-spanning mean.
The cost is that the seed happens at ~30 s instead of 5 s; the extra unseeded drift is < 0.02 °C.

`Q_resp` is folded into `q_loss_raw` **before** the `_loss_trim` auto-seed, so it is absorbed at
warm-up and the model stays exactly neutral at rest — no scenario's baseline moves. The term shows
up only when inspired conditions *change*. Measured on room air (20 °C / 50 % RH): **0.87 W of
9.62 W heat production in `term_neonate` (9 %)**, **0.21 W of 2.71 W in `preterm_28wk` (8 %)**, ~83 %
of it latent. A heated humidifier (37 °C / 100 % RH) drives it to ≈ 0 and the core rises accordingly
— which is the thermal reason NICU ventilators heat and humidify, and it previously scored as no
effect at all.

**Expect a small core response.** Measured whole-model thermal gain is ≈ **0.043 °C per watt**, so
abolishing the neonate's 0.94 W moves core only ≈ +0.04 °C, approached with a ~430 s time constant.
That is far below the ≈ 0.5 °C/W a naive `1 / (SA·(h_radiative + h_convective))` estimate suggests,
because most of the retained heat goes into `Q_perf` rather than into the tissue node. This is a
property of the pre-existing two-node coupling, not of `Q_resp`: an environmental perturbation of
the same size (`env_temp` +1.15 °C, which moves radiative *and* convective since `radiant_temp` is
`null`) gives 0.043 °C/W as well, matching within 2 %.

> Noted while verifying, **pre-existing and not changed here**: after either perturbation `Q_perf`
> settles at a *sustained* non-zero value (≈1.17 W for the humidifier case) once the residual has
> converged to ~0. The bullet below describes the coupling-mass inexactness as a *transient* that is
> zero at rest; at a perturbed steady state it appears not to vanish. Worth a look before relying on
> absolute core-temperature excursions, independently of respiratory heat.

> **Calibration note.** `evap_coeff` was documented as the "evaporative/**respiratory**" coefficient
> — respiratory loss used to be lumped into that skin surface term. It is now double-counted there.
> Because `_loss_trim` auto-seeds, this does **not** move the resting core, but it does leave
> sensitivity to ambient `rel_humidity` overstated. The `6.0` default is deliberately left unchanged
> so resting behaviour and today's humidity response are untouched; reducing it to a skin-only value
> is a physiological judgement left to the modeller.

## Key parameters (defaults / units)

| Parameter | Default | Meaning |
|---|---|---|
| `env_temp` | `32.0 °C` | ambient air temperature (neutral-thermal incubator) |
| `radiant_temp` | `null` | radiant-warmer effective temp; `null` → use `env_temp` |
| `rel_humidity` | `0.5` | ambient relative humidity (fraction) — modulates evaporative loss |
| `setpoint_temp` | `37.0 °C` | hypothalamic set-point |
| `heat_capacity` | `3470 J/kg/K` | specific heat of body tissue |
| `surface_area_k` | `0.05` | Meeh constant in `SA = k·weight^(2/3)` |
| `h_radiative` / `h_convective` | `9.6` / `7.0 W/m²/K` | radiative / convective transfer coefficients (recalibrated ×1.75 for the two-node coupling) |
| `evap_coeff` | `6.0 W/m²` per `(1−humidity)` | **skin** (transepidermal) evaporative loss coefficient — see the calibration note under *Respiratory heat loss* |
| `respiratory_heat_loss` | `true` | count `Q_resp` in the balance; set `false` to compare against a body that conditions gas for free |
| `resp_window` | `30.0 s` | averaging window for `Q_resp`; must span several breaths (see above) |
| `caloric_equiv_o2` | `20.1 J/mL` | heat released per mL O2 consumed |
| `blood_density` / `cp_blood` | `1.06 kg/L` / `3800 J/kg/K` | blood pool density and specific heat |
| `blood_temp_tc` | `10.0 s` | perfusion equilibration time constant (`G_perf = C_blood / tc`); shared with `Blood` |
| `blood_volume_per_kg` | `0.08 L/kg` | circulating blood volume used for the core-coupling mass |
| `bat_gain` / `bat_max_per_kg` | `6.0 W/°C` / `4.5 W/kg` | brown-fat gain and ceiling |
| `q10` | `2.3` | Q10 of metabolic rate (per 10 °C) |
| `hr_temp_gain` | `0.1` | HR factor rise per °C above set-point (~10%/°C) |
| `vo2_temp_factor_min/max` | `0.5` / `2.5` | Q10 clamp |
| `hr_temp_factor_min/max` | `0.6` / `1.6` | HR-factor clamp |

Read-outs: `core_temp`, `skin_temp`, `heat_production`, `heat_loss`, `brown_fat_heat`,
`blood_temp_mean`, `q_perfusion`, `vo2_temp_factor`, `hr_temp_factor`.

## Risk note

The path **core → VO2 (Q10) → metabolic heat → core** is **positive feedback**: a warmer core raises
VO2 which raises heat production which warms the core further. It is bounded by the dominant heat-loss
limb (which grows ∝ `core − env_temp` and so always overtakes) plus the `vo2_temp_factor` clamp
`[0.5, 2.5]`. Keep the clamp in place when re-tuning `q10` or `caloric_equiv_o2`.

## Thermal model — scope & known limitations

The temperature model spans this class plus [`GasCapacitance`](./GasCapacitance.md) (airway gas warms
toward core) and [`Blood`](./Blood.md) (blood pool warms toward core, two-node coupled). It is
neutral at rest and reproduces environmental cold/warm defence, brown-fat thermogenesis, and
device-driven blood cooling/rewarming. The following are **deliberate open items**, not bugs — recorded
so they are not rediscovered as defects:

- **Respiratory *water* loss is still not conserved.** `Q_resp` charges the body the *heat* of
  conditioning inspired gas, but `add_watervapour` still draws the water itself from an implicit
  infinite source and discards condensate. Insensible fluid loss through the airway is therefore
  still unmodelled and does not reach fluid balance — only its thermal cost does.
- **`MOUTH` and `env_temp` are independent ambients.** The inspired-air source (`MOUTH`, seeded ~20 °C)
  and the thermal environment (`env_temp`, 32 °C incubator default) are not unified, so a cold/warm
  environment does not consistently drive inspired-gas temperature.
- **Blood core-coupling uses circulating volume, not the compartment sum.** `blood_mean` is measured
  over all blood compartments, but the coupling mass is `blood_volume_per_kg` (real circulating volume)
  because the compartments sum to ~2.4× that (they include vascular beds). This keeps the loss
  coefficients physical at the cost of a small, bounded *transient* energy inexactness — zero at rest.
- **`ctotal` is not gas-law-consistent in a sealed static gas pocket.** Pressure comes from elastance
  while `ctotal` sums species, and the two are not hard-coupled. For flowing gas this stays within ~2 %
  (see [`GasCapacitance`](./GasCapacitance.md)); a never-ventilated compartment (`term_fetus` lungs)
  drifts to ~8.6 %.
- **Warm-environment core response is more defended** than the former single-node model (rise ~0.57 vs
  ~0.82 °C in the probe's hot step) — a consequence of the blood/core thermal buffer, considered more
  physiological.

## See also
[`Metabolism`](./Metabolism.md) (VO2 source + the Q10 effector target) ·
[`Heart`](./Heart.md) (`hr_temp_factor` channel) ·
[`Blood`](./Blood.md) (`set_perfusion_target` → blood warming, acid-base / O2-dissociation) ·
[`Gas`](./Gas.md) / [`GasCapacitance`](./GasCapacitance.md) (`set_body_temperature` → airway gas targets) ·
[`Ecls`](./Ecls.md) (blood-side heater-cooler) ·
[`Hormones`](./Hormones.md) (sibling controller / neutrality idiom).
