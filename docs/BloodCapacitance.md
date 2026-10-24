# BloodCapacitance

A BloodCapacitance is an elastic compartment that holds blood and tracks what is in it: oxygen and carbon dioxide content, solutes, drugs and temperature. It is a [`Capacitance`](./Capacitance.md) plus composition mixing. It is the parent class of every blood vessel in the model.

## Physiology

Think of a BloodCapacitance as a balloon filled with blood. The more blood is in it, the higher the pressure inside. How quickly the pressure rises with volume depends on how stiff the wall is, the *elastance*. Below a certain volume, the *unstressed volume*, the wall is slack and the pressure is zero.

When blood flows in from a neighbouring compartment, it mixes completely with the blood already there. If oxygen-rich blood enters a compartment that holds venous blood, the oxygen content inside rises in proportion to how much new blood came in. Solutes, drugs and temperature mix the same way. This is how oxygen, CO2, drugs and warmth travel around the simulated circulation: they ride along with the flow, one compartment at a time.

A BloodCapacitance has no resistance of its own. Blood enters and leaves through separate connectors (`Resistor` models), or the compartment is a [`BloodVessel`](./BloodVessel.md), which adds its own resistance.

In the shipped scenarios a plain BloodCapacitance is used only for compartments outside the main circulation: the urine in the bladder, the maternal blood pool of the placenta, and the inlet tubing of the ECLS circuit (see [Usage](#usage-in-the-scenarios)). Every vessel of the circulation is a `BloodVessel`, which inherits everything on this page.

## Inheritance

```
BaseModelClass
  └── Capacitance              (volume, elastance, pressure)
        └── BloodCapacitance   (blood composition mixing)
              ├── BloodVessel  (adds resistance, flow, ANS coupling)
              └── BloodPump    (adds a pump head; standby, no scenario uses it)
```

`BloodTimeVaryingElastance` and `HeartChamber` carry the same blood properties but descend from `TimeVaryingElastance`. All four share the mixing code in [`helpers/BloodMixing.js`](../helpers/BloodMixing.js).

## Properties

Volume, elastance and pressure props (`vol`, `u_vol`, `el_base`, `el_k`, `pres`, `pres_in`, `pres_ext`, `fixed_composition` and the factor layers) are inherited. See [Capacitance → Properties](./Capacitance.md#properties).

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `temp` | °C | 37.0 | Blood temperature. Mixed on inflow, and relaxed toward `body_temp` by `Blood` every step. |
| `viscosity` | cP | 6.0 | Blood viscosity. Not mixed: `Blood` derives it from this compartment's haemoglobin every step, so a definition value is overwritten. |
| `solutes` | object | `{}` | Solute concentrations keyed by name (e.g. `hemoglobin`, `na`, `glucose`, `lact`), in each solute's own unit. Seeded from `Blood.solutes` at build when empty. |
| `drugs` | object | `{}` | Drug concentrations keyed by drug name. Filled by `Drugs`. |
| `blood_pool` | boolean | `true` | `false` marks a non-circulating sink (URINE). `Blood`, `Lactate`, `Glucose` and `Drugs` then skip the compartment. |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `to2` | mmol/L | 0.0 | Total oxygen content (bound + dissolved). Mixed on inflow; seeded from `Blood.to2` at build. |
| `tco2` | mmol/L | 0.0 | Total CO2 content. Mixed on inflow; seeded from `Blood.tco2` at build. |
| `ph` | – | -1 | pH. `-1` = not calculated. |
| `pco2` | mmHg | -1 | CO2 partial pressure. `-1` = not calculated. |
| `po2` | mmHg | -1 | O2 partial pressure. `-1` = not calculated. |
| `so2` | fraction | -1 | O2 saturation (0–1). `-1` = not calculated. |
| `hco3` | mmol/L | -1 | Bicarbonate. `-1` = not calculated. |
| `be` | mmol/L | -1 | Base excess. `-1` = not calculated. |

The blood-gas outputs (`ph` … `be`) are **not** computed by this class. They are solved from `to2`, `tco2` and the solutes by [`BloodComposition.calc_blood_composition`](./BloodComposition.md), and only for the compartments that some model asks for:

- `Blood`, once per second: `AA`, `AD`, `IVCI`, `SVC`, `RAIVCI`, `PA`;
- `Ans`, at its update interval: its chemoreceptor sites;
- `Ecls`: `ECLS_TUBING_IN` and the oxygenator.

Everywhere else these fields stay at `-1`, or hold the last solved value.

### Set by other models

These props are not declared in the constructor. Other models write them onto the blood compartments at build or when solving:

| Property | Unit | Written by | Description |
|---|---|---|---|
| `haldane_coeff` | – | `Blood.init_model` | Haldane-effect strength, used by `BloodComposition`. |
| `P50_0` | mmHg | `Blood.init_model` (only if absent) | O2–Hb affinity baseline. A per-compartment value is kept, e.g. adult 26.7 on `PL_MAT`. |
| `viscosity_ref` | cP | `Blood.init_model` | Viscosity at which the vessel resistances were calibrated. |
| `body_temp` | °C | `Blood.init_model`, then `Thermoregulation` via `Blood.set_perfusion_target` | Perfusion target that `temp` relaxes toward. |
| `blood_temp_tc` | s | `Blood.init_model` | Time constant of that relaxation. |
| `temp_ext_override` | boolean | `Blood.init_model`, devices | `true` when a device (e.g. the ECLS heater) owns `body_temp`. |
| `prev_ph`, `prev_po2` | –, mmHg | `BloodComposition` (on each solve) | Solver warm start: the last solved pH and pO2, which bound the next solve. Only on compartments that have been solved; saved with the state. |

## Calculation

BloodCapacitance does not override `calc_model()`. Each step runs the inherited [Capacitance cycle](./Capacitance.md#calculation): `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

The class adds one thing, an override of **`volume_in(dvol, comp_from)`**. A `Resistor` (or the compartment's own outflow) calls it when blood arrives:

1. `Capacitance.volume_in` adds `dvol` to `vol` (skipped when `fixed_composition`).
2. `mix_blood_in(this, dvol, comp_from)` mixes the composition. With `V` the volume *after* the inflow:

   ```
   c += (c_from − c) · dvol / V
   ```

   This is exact mass balance: `c_new·V = c_old·(V − dvol) + c_from·dvol`. It is applied to `to2`, `tco2`, every key in `solutes` and `drugs` that the receiving compartment carries (a key missing on the source counts as 0), and `temp`.

The mixing is skipped when:
- `fixed_composition` is `true`, so the compartment acts as an infinite reservoir whose composition never changes;
- `vol ≤ 0`, which guards against NaN on an empty compartment.

Outflow (`volume_out`) changes only the volume; concentrations don't change when blood leaves.

## Factor system

Inherited unchanged from `Capacitance`: `u_vol`, `el_base` and `el_k` each carry the three layers (`_factor`, `_factor_ps`, `_factor_scaling_ps`), composed **additively**. See [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern). (`BloodVessel` overrides this and composes multiplicatively.)

## Inputs and outputs

- **Reads:** the upstream compartment (`comp_from`) on inflow: its `to2`, `tco2`, `solutes`, `drugs`, `temp`.
- **Written by:**
  - `Resistor`: volume moves;
  - `Blood`: seed composition, temperature relaxation, viscosity, the props in [Set by other models](#set-by-other-models);
  - `BloodComposition`: the blood-gas outputs;
  - `Drugs`, `Lactate`, `Glucose`: their `drugs`/`solutes` entries;
  - owner models of specific instances (`Kidneys` on URINE, `Placenta`/`Uterus` on PL_MAT, `Ecls` on ECLS_TUBING_IN).
- **Read by:** `Resistor` (`pres`), `Monitor` and `DataCollector` watchers, `Blood` (Hb-weighted viscosity reference, thermal state).

## Assumptions and limitations

- **Instant, complete mixing.** Every compartment is well stirred. Streaming inside a compartment isn't modelled. Where it matters (the two halves of the right atrium), it is approximated by splitting the compartment and joining the halves with a `Resistor` with `mix_flow` (see [`Resistor`](./Resistor.md)).
- **No concentration change on outflow.** Concentration changes only on inflow, and through the models that add or remove substances.
- **Composition is carried, not computed.** Blood gases are solved on demand for a handful of sites only, so `po2`/`so2` on an arbitrary compartment can be stale or `-1`.
- **Fixed-composition reservoirs** freeze both volume and composition: `volume_in`/`volume_out` leave `vol` unchanged and nothing is mixed. Blood flowing in or out is created or destroyed at the boundary, which is the intent for an infinite reservoir. `Blood` also skips them for temperature relaxation, viscosity and the thermal balance.

## Example definition (JSON)

From `term_neonate.json`, `models.Kidneys.components.URINE` (trimmed to the config props). The `Kidneys` model builds it through the `components` mechanism:

```json
{
  "name": "URINE",
  "description": "bladder / urine sink",
  "model_type": "BloodCapacitance",
  "is_enabled": true,
  "u_vol": 0,
  "el_base": 1000,
  "el_k": 0,
  "fixed_composition": false,
  "blood_pool": false,
  "vol": 0.0046
}
```

## Usage in the scenarios

All shipped scenarios have the same three instances, each owned by a composite model:

| Instance | Owner | Role |
|---|---|---|
| `URINE` | `Kidneys` | Bladder / urine sink, `blood_pool: false`. `Kidneys._transfer` moves water and each solute into it by its own mass balance, **not** through `volume_in` (which would carry albumin and Hb into the urine). |
| `PL_MAT` | `Placenta` | Maternal blood pool of the placenta: `fixed_composition: true`, adult `P50_0` 26.7. Its gases are written by `Placenta`, or by `Uterus` when coupled. Disabled after birth. |
| `ECLS_TUBING_IN` | `Ecls` | Inlet tubing of the ECLS circuit. `Ecls` sets its volume and solves its blood gas. Disabled unless ECLS runs. |

Through inheritance, the class also carries every `BloodVessel` instance (all of the circulation).

## References

This class introduces no literature-derived values: the mixing rule is exact mass balance. For the pressure–volume relation see [Capacitance](./Capacitance.md). For viscosity, temperature and the blood-gas chemistry see [Blood](./Blood.md) and [BloodComposition](./BloodComposition.md).
