# GasCapacitance

A `GasCapacitance` is a volume compartment that holds **gas** instead of blood. It extends the base
[`Capacitance`](./Capacitance.md) with gas-specific state: a five-species composition
(O₂, CO₂, N₂, water vapour, "other") tracked as concentrations, partial pressures and fractions,
plus temperature/humidity dynamics and the atmospheric/external pressures relevant to a gas space.
It models airways, alveoli and the gas side of devices (ventilator circuit, ECLS sweep gas).

## Inheritance

```
BaseModelClass
  └── Capacitance          (volume, elastance, pressure)
        └── GasCapacitance (gas composition, heat, water vapour, atmospheric/external pressures)
```

Gas flow into and out of a `GasCapacitance` is handled by separate `Resistor` models that reference
it (e.g. `MOUTH_DS` connecting `MOUTH` → `DS`). Diffusion of individual species is handled by
[`GasExchanger`](./GasExchanger.md) (gas ↔ blood) and [`GasDiffusor`](./GasDiffusor.md) (gas ↔ gas).

## What it models

A passive gas-containing compartment. It holds a volume of gas at a pressure determined by its
elastance plus the surrounding pressures (atmospheric, chest-compression, muscle), and tracks the
composition of that gas. Each step it relaxes its temperature toward a target, exchanges water
vapour with its wall (evaporating toward `humidity · P_sat(T)`, condensing out anything above
saturation), recomputes pressure, and re-derives the partial pressures and fractions from the
current concentrations. Like its parent it has no built-in resistance or flow.

## Properties

### Inherited from Capacitance

See [`Capacitance`](./Capacitance.md) for the full list and the factor system. Key ones:

| Property | Unit | Description |
|---|---|---|
| `u_vol` | L | Unstressed volume (config) |
| `el_base` | mmHg/L | Baseline elastance (config) |
| `el_k` | unitless | Non-linear elastance coefficient (config) |
| `pres_ext` | mmHg | External pressure, non-persistent — cleared each step (config) |
| `fixed_composition` | bool | Freeze volume and composition (infinite reservoir) (config) |
| `vol` | L | Current volume (computed) |
| `pres` | mmHg | Total pressure (computed) |
| `pres_in` | mmHg | Recoil pressure (computed) |
| `pres_tm` | mmHg | Transmural pressure (computed) |

`GasCapacitance` also re-initializes `fixed_composition` to `false` in its own constructor.

### Config (unique to GasCapacitance)

| Property | Unit | Description |
|---|---|---|
| `pres_atm` | mmHg | Atmospheric pressure (default 760); set by the [`Gas`](./Gas.md) manager at build |
| `pres_cc` | mmHg | Chest-compression external pressure, non-persistent — cleared each step |
| `pres_mus` | mmHg | Muscle external pressure, non-persistent — cleared each step |
| `target_temp` | °C | Temperature the gas relaxes toward (set per-site by `Gas`) |
| `temp` | °C | Current gas temperature (also runtime state; seeded by `Gas`) |
| `humidity` | fraction | **Wall wetness**: the relative humidity this compartment can sustain by evaporation, 0–1. Read every step by `add_watervapour` — it is a target, not a state variable. Airway mucosa is `1.0`; a dry medical gas line is `0.0`. Default `1.0` |
| `temp_tc` | s | Thermal equilibration time constant (default `1.0`) |
| `h2o_tc` | s | Water-vapour equilibration time constant (default `0.2`) |

### Computed (gas state)

Concentrations are in mmol/L; partial pressures in mmHg; fractions are unitless 0–1.

| Property | Unit | Description |
|---|---|---|
| `ctotal` | mmol/L | Total gas molecule concentration (`ch2o + co2 + cco2 + cn2 + cother`) |
| `co2` | mmol/L | Oxygen concentration (note: the name is "concentration of O₂", not CO₂) |
| `cco2` | mmol/L | Carbon dioxide concentration |
| `cn2` | mmol/L | Nitrogen concentration |
| `ch2o` | mmol/L | Water vapour concentration |
| `cother` | mmol/L | Other-gases concentration |
| `po2` | mmHg | Partial pressure of O₂ |
| `pco2` | mmHg | Partial pressure of CO₂ |
| `pn2` | mmHg | Partial pressure of N₂ |
| `ph2o` | mmHg | Partial pressure of water vapour |
| `pother` | mmHg | Partial pressure of other gases |
| `pres_rel` | mmHg | Pressure relative to atmospheric (`pres − pres_atm`) |
| `fo2` | fraction | Fraction of O₂ |
| `fco2` | fraction | Fraction of CO₂ |
| `fn2` | fraction | Fraction of N₂ |
| `fh2o` | fraction | Fraction of water vapour |
| `fother` | fraction | Fraction of other gases |

`_gas_constant = 62.36367` (L·mmHg/(mol·K)) is a local constant used by `add_heat` / `add_watervapour`.

## Factor system

`GasCapacitance` inherits the full three-tier factor system from [`Capacitance`](./Capacitance.md)
acting on `el_base`, `u_vol` and `el_k`:

| Tier | Factors | Purpose |
|---|---|---|
| Non-persistent | `el_base_factor`, `u_vol_factor`, `el_k_factor` | Transient effects, reset to 1.0 each step |
| Persistent (`_ps`) | `el_base_factor_ps`, `u_vol_factor_ps`, `el_k_factor_ps` | Ongoing modulation (e.g. lung recruitment) |
| Scaling (`_scaling_ps`) | `el_base_factor_scaling_ps`, `u_vol_factor_scaling_ps`, `el_k_factor_scaling_ps` | `ModelScaler` weight/manual scaling |

The gas composition itself is **not** factor-driven (no `*_factor` on the concentrations).

`temp_tc` and `h2o_tc` are deliberately plain scalars rather than factor triplets. The factor
convention is for core physics parameters that interventions and `ModelScaler` modulate; these are
equilibration kinetics that nothing currently sweeps, so they sit in the same category as
`target_temp`, `pres_atm` and `fixed_composition` — configuration, not modulated physics. The
additive-factor form composes onto a scalar cleanly if a consumer ever needs it.

## Calculation cycle (`calc_model`)

`GasCapacitance` overrides `calc_model` (it does not simply inherit the Capacitance cycle):

1. **`add_heat`** — relax `temp` toward `target_temp` with a first-order lag whose time constant is
   in **seconds**: `dT = (target_temp − temp) · min(1, Δt / temp_tc)`, then `temp += dT`. Adjust
   volume for the temperature change via the ideal gas law `dV = (ctotal · vol · R · dT) / pres`
   (added as `dV / 1000`). Skipped entirely when `fixed_composition` — an infinite reservoir holds
   its temperature, just as `volume_in` holds its composition. Volume is floored at 0.
2. **`add_watervapour`** — exchange water with the compartment wall. Two distinct mechanisms give
   an **asymmetric** target:
   - *Evaporation* raises `ph2o` up to `humidity · pH2Ot`.
   - *Condensation* lowers `ph2o`, but only out of genuine supersaturation (`ph2o > pH2Ot`), and
     only down to `pH2Ot`.

   Between the two the wall is neither source nor sink and nothing happens. That dead band is what
   stops a dry gas line (`humidity = 0`) from acting as a dehumidifier on wet gas flowing into it;
   for a saturated wall (`humidity = 1`) it has zero width and the rule reduces to "track
   saturation". Having picked a target pressure `p_target`, the water concentration that achieves it
   against the current **dry** gas load is solved directly rather than iterated:

   ```
   c_dry       = co2 + cco2 + cn2 + cother
   ch2o_target = c_dry · p_target / (pres − p_target)
   ch2o       += (ch2o_target − ch2o) · min(1, Δt / h2o_tc)
   ```

   The volume the added (or removed) water occupies follows from the ideal gas law. Skipped when
   `fixed_composition`.

   Because the step is a *fraction of the remaining gap* toward a concentration — rather than an
   absolute mmol amount — the time constant is independent of compartment size. Because that
   fraction is `Δt / tc`, it is also independent of `modeling_stepsize`. Both `min(1, …)` clamps
   mean a step longer than the time constant lands exactly on target instead of overshooting into
   oscillation.
3. **`calc_elastances` / `calc_volumes`** (inherited) compute `el_eff`, `u_vol_eff`, `el_k_eff`.
4. **`calc_pressure`** — calls `super.calc_pressure()` (recoil + `pres_ext`, then clears `pres_ext`),
   then adds the gas-space external pressures:
   ```
   pres     = pres_in + pres_ext + pres_cc + pres_mus + pres_atm
   pres_rel = pres − pres_atm
   pres_cc := 0;  pres_mus := 0          (both non-persistent, cleared each step)
   ```
5. **`calc_gas_composition`** (the method, see below) — recompute `ctotal` and derive partial
   pressures and fractions from the current concentrations.

### `calc_watervapour_pressure`

Saturated water-vapour pressure as a function of temperature (Kelvin via `+273.15`):

```
pH2Ot = exp(20.386 − 5132 / (temp + 273.15))
```

An Antoine-type form returning mmHg: 46.49 at 37 °C, 35.45 at 32 °C, 17.81 at 20 °C.

### Modelling assumptions for heat and water

- **The water source is unlimited.** There is no liquid reservoir behind the wall, so a compartment
  with `humidity > 0` can evaporate indefinitely. Respiratory water loss is therefore not conserved
  anywhere — [`Thermoregulation`](./Thermoregulation.md) keeps its own independent `rel_humidity`
  for evaporative heat loss and is not coupled to these compartments.
- **Condensate is discarded.** Water that condenses out of supersaturated gas simply leaves the
  system; it does not pool, drain, or re-evaporate.
- **Brief supersaturation during expiration is expected, not a defect.** Condensation is a
  first-order lag, so a compartment can sit a little above 100 % RH while advection supplies water
  faster than `h2o_tc` removes it. In `term_neonate` the dead space swings between roughly 68 % and
  102 % RH over a breath as its temperature moves between about 22 °C and 35 °C — expiration pushes
  saturated 36 °C alveolar gas (≈44.7 mmHg) into a cooler space that can only hold ≈42 mmHg. That
  is exhaled breath condensate. Sample a full cycle before concluding a compartment is wrong; an
  instantaneous reading lands at an arbitrary breath phase.
- **`fixed_composition` compartments are inert to both heat and water.** They are infinite
  reservoirs, so `add_heat` and `add_watervapour` both skip them, matching how `volume_in` already
  holds their composition and temperature against advective mixing.
- **No water or heat crosses the blood–gas barrier.** [`GasExchanger`](./GasExchanger.md) and
  [`GasDiffusor`](./GasDiffusor.md) transfer only O₂ and CO₂. An alveolus is humidified from its own
  `target_temp`, not from pulmonary capillary blood.
- **Both routines conserve molar mass.** Heating and humidification change the volume, so each
  rescales every concentration by `V₀/V₁` afterwards. Heating moves no molecules at all;
  humidification moves only water. Without that rescale the compartment would keep its
  concentrations while growing, inventing gas out of nothing — measured at +5.8 % dry moles for a
  20 → 37 °C warm-up and +6.7 % for a dry → saturated humidification. The error was invisible in
  every clinical output, because those are all ratios (`fo2 = co2/ctotal`, `po2 = fo2 · pres`) in
  which a uniform inflation cancels exactly.

- **Gas expands across a pressure gradient on transfer.** `volume_in` scales the incoming molar
  density by `P_here / P_there` (see below). With that and the mass conservation above, `ctotal`
  agrees with the ideal gas law to within ~2 % everywhere, including under mechanical ventilation.

### `calc_gas_composition` (method)

Recomputes the total concentration and derives partials/fractions from the **current** species
concentrations (returns early if `ctotal === 0` to avoid division by zero):

```
ctotal = ch2o + co2 + cco2 + cn2 + cother
p_s    = (c_s / ctotal) · pres        for s ∈ {h2o, o2, co2, n2, other}
f_s    =  c_s / ctotal
```

This is distinct from the standalone [`calc_gas_composition`](./GasComposition.md) *initializer*,
which instead sets the concentrations from a target FiO₂/temperature/humidity mix.

## Composition mixing (`volume_in`)

`GasCapacitance` overrides `volume_in(dvol, comp_from)`. It calls `super.volume_in` to update the
volume, then mixes the incoming concentrations and temperature by volume fraction (the same
algebraically-correct dilution as [`BloodCapacitance`](./BloodCapacitance.md)) — but first corrects
the incoming molar density for the pressure difference between the two compartments:

```
k    = pres / comp_from.pres                                (1.0 at equal pressure)
co2  = (co2·vol  + (comp_from.co2·k − co2)·dvol) / vol      (and cco2, cn2, ch2o, cother)
temp = (temp·vol + (comp_from.temp  − temp)·dvol) / vol
```

**Why `k` is needed.** Gas is compressible, so a parcel crossing a pressure gradient expands or is
compressed — the same molecules occupy a different volume here than they did in `comp_from`. Mixing
raw concentrations is only valid between compartments at equal pressure. Without the correction a
pressurised supply injects its own molar density downstream: `VENT_GASIN` sits at 1160 mmHg with
`ctotal ≈ 63.5` (correct *for its own pressure*), and gas leaving it for a 770 mmHg circuit used to
arrive still at 63.5, driving the alveoli to ~65 mmol/L where 760 mmHg at 37 °C allows only ~40.

Every species scales by the same `k`, so the **gas fractions delivered are unchanged** — this
corrects molar density only, never composition. `k` is 1.0 between compartments at equal pressure,
which in practice is every pairing in the model (measured 0.999–1.009) except the pressurised
supplies: `VENT_GASIN` (k ≈ 1.51) and `ECLS_GAS_SOURCE` (k ≈ 1.26). Those are all
`fixed_composition` reservoirs whose `volume_out` is a no-op, so nothing is actually drawn down on
the donor side for the rescale to contradict.

Temperature is deliberately **not** folded into `k`. The parcel arrives at `comp_from`'s temperature
and `add_heat` performs the thermal expansion, and its matching dilution, as the compartment relaxes
toward `target_temp`. Including temperature here would double-count it.

Mixing is **skipped for `fixed_composition`** compartments (an infinite reservoir holds its
composition and temperature constant) and **guarded against an empty compartment** (`vol <= 0`
returns early — no division by zero).

## Example definition (JSON)

A lung alveolar compartment (left lung) — non-fixed composition, warmed and humidified by the
[`Gas`](./Gas.md) manager:

```json
{
  "name": "ALL",
  "description": "gas capacitance model of the alveolar space of the left lung",
  "model_type": "GasCapacitance",
  "is_enabled": true,
  "u_vol": 0.04,
  "el_base": 186,
  "el_k": 0,
  "pres_ext": 0,
  "fixed_composition": false
}
```

A fixed-composition reservoir (ventilator gas source) keeps its composition and volume constant:

```json
{
  "name": "VENT_GASIN",
  "description": "gas reservoir of the mechanical ventilator",
  "model_type": "GasCapacitance",
  "is_enabled": false,
  "u_vol": 5,
  "el_base": 1000,
  "el_k": 0,
  "fixed_composition": true
}
```

(`temp`, `humidity`, `target_temp` and `pres_atm` are normally seeded by the [`Gas`](./Gas.md)
manager from its `temp_settings` / `humidity_settings` / `pres_atm`, rather than per-compartment.)

## Usage in the model

- Airway/alveolar chain: `MOUTH` (fixed-composition outside air) → `DS` (dead space) → `ALL`/`ALR`
  (left/right alveoli), wired by `Resistor`s; `GASEX_LL`/`GASEX_RL` exchange O₂/CO₂ between the
  alveoli and the lung-capillary blood.
- Device gas spaces: ventilator (`VENT_GASIN`/`VENT_GASCIRCUIT`/`VENT_GASOUT`) and ECLS
  (`ECLS_GAS_SOURCE`/`ECLS_GAS_OXY`/`ECLS_GAS_OUT`); the gas sources are `fixed_composition: true`.
- The [`Gas`](./Gas.md) manager discovers every `GasCapacitance` at build, seeds its pressure,
  temperature and humidity, and bootstraps the initial composition via the standalone
  [`calc_gas_composition`](./GasComposition.md).
