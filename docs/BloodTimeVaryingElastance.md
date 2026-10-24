# BloodTimeVaryingElastance

A `BloodTimeVaryingElastance` is a [`TimeVaryingElastance`](./TimeVaryingElastance.md) that holds blood: a compartment whose stiffness follows the heartbeat and whose blood composition is tracked and mixed like a [`BloodCapacitance`](./BloodCapacitance.md). In the shipped scenarios it is the coronary bed.

## Physiology

The coronary vessels run through the heart muscle. When the ventricles contract, the muscle squeezes the vessels inside it (*intramyocardial compression*). Coronary inflow to the left ventricle is therefore impeded in systole and occurs mostly in diastole, and blood is pushed out of the coronary veins during systole. A tachycardia that shortens diastole, or a high diastolic ventricular pressure, reduces the time and the pressure available for coronary filling.

Explain models this with one compartment whose stiffness rises with ventricular activation. Contraction raises the pressure in the coronary bed, which slows inflow from the aorta and speeds outflow to the right atrium. The same compartment is where the heart muscle takes up its oxygen: `Mob` removes the myocardial O2 consumption from the coronary blood and adds the CO2 it produces, so coronary venous blood is the most desaturated blood in the body.

## Inheritance

```
BaseModelClass
  └── TimeVaryingElastance          (el_min/el_max, act_factor, pressure)
        └── BloodTimeVaryingElastance   (blood composition mixing)
```

All of the calculation (elastances, unstressed volume, pressure) is inherited unchanged from `TimeVaryingElastance`, with the additive factor layers. Unlike its sibling [`HeartChamber`](./HeartChamber.md), it has no ANS, drug or load terms.

## Properties

Volume, elastance, activation and factor props are inherited: see [TimeVaryingElastance → Properties](./TimeVaryingElastance.md#properties).

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `temp` | °C | 37.0 | Blood temperature; mixed on inflow, relaxed toward `body_temp` by `Blood`. |
| `viscosity` | cP | 6.0 | Overwritten by `Blood` from the compartment's haemoglobin every step; not mixed. |
| `solutes` | object | `{}` | Solute concentrations, seeded from `Blood` when empty. |
| `drugs` | object | `{}` | Drug concentrations (`Drugs`). |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `to2`, `tco2` | mmol/L | 0.0 | Total O2 and CO2 content; mixed on inflow. |
| `ph`, `pco2`, `po2`, `so2`, `hco3`, `be` | as in [BloodCapacitance](./BloodCapacitance.md#outputs) | -1 | Blood gases, `-1` = not calculated. No model solves them for `COR`, so they stay `-1`. |

### Set by other models

The same props `Blood` and `BloodComposition` write onto every blood compartment (`haldane_coeff`, `P50_0`, `viscosity_ref`, `body_temp`, `blood_temp_tc`, `temp_ext_override`, `prev_ph`, `prev_po2`): see [BloodCapacitance → Set by other models](./BloodCapacitance.md#set-by-other-models).

The class has no `blood_pool` or `fixed_composition` prop. Both read as "not set", so the compartment counts as circulating blood and its composition is never frozen.

## Calculation

`calc_model()` is inherited: `calc_elastances()` → `calc_volumes()` → `calc_pressure()`, with

```
pres_in = p_ed + (p_es − p_ed) · act_factor
```

(see [TimeVaryingElastance → Calculation](./TimeVaryingElastance.md#calculation)).

The class adds one override, **`volume_in(dvol, comp_from)`**. It adds the volume, then mixes the incoming blood with `mix_blood_in` ([`helpers/BloodMixing.js`](../helpers/BloodMixing.js)), exactly as in [BloodCapacitance](./BloodCapacitance.md#calculation): `to2`, `tco2`, every solute and drug, and `temp`, by the inflow's share of the new volume.

## Factor system

Inherited unchanged: `u_vol`, `el_min`, `el_max` and `el_k` carry the three layers, composed **additively** (see [TimeVaryingElastance → Factor system](./TimeVaryingElastance.md#factor-system)). No model writes them for `COR` in the shipped scenarios.

## Inputs and outputs

- **Reads:** the upstream compartment on inflow (composition).
- **Written by:** `Heart` (`act_factor` = the ventricular activation `vaf`, every step); `Mob` (subtracts the myocardial O2 consumption from `to2` and adds CO2 to `tco2` by the respiratory quotient, every step); `Blood` (temperature, viscosity, seed composition); `Drugs`, `Lactate`, `Glucose` (their solutes and drugs); `PERICARDIUM` (`pres_ext`); the connected resistors (volume).
- **Read by:** `AA_COR` (whose resistance `Heart` raises in systole), `COR_RAIVCI` and `COR_RASVC` (its pressure); `Mob` (its `to2`, `tco2` and volume, plus the `AA_COR` flow and aortic `to2` for O2 delivery); `DataCollector` watchers.

## Assumptions and limitations

- **One compartment for the whole coronary circulation.** Left and right coronary beds, and epicardial versus intramyocardial vessels, aren't separated.
- **Compression follows the LV activation for the whole bed.** The right-ventricular activation (`rvaf`) doesn't act on it.
- **Two compression effects.** The bed's own elastance swing (`el_max/el_min` = 3) squeezes blood *out* in systole. Holding inflow back is done by `Heart.cor_r_systolic_factor`, which raises the inflow resistance `AA_COR` by `(1 + 5·vaf)` in systole. With both, 73 % of the coronary inflow arrives in diastole at term (60–62 % in the preterm and fetal scenarios, which have shorter diastoles). This compares with ~75–85 % for an adult left coronary, which a lumped left+right bed should sit below. An intramyocardial-*pressure* variant was tried and dropped: with this bed's compliance it squeezed the bed empty in systole.
- **Active only since the two-phase build** (`302ed76`). Before that, `Heart` never found `COR` (owned by `Mob`), and `act_factor` stayed 0.

## Example definition (JSON)

From `term_neonate.json`, `models.Mob.components.COR` (trimmed to the config props):

```json
{
  "name": "COR",
  "model_type": "BloodTimeVaryingElastance",
  "is_enabled": true,
  "u_vol": 0.00028,
  "el_min": 30000,
  "el_max": 90000,
  "el_k": 0,
  "vol": 0.00067
}
```

## Usage in the scenarios

One instance in all 10 scenarios: `COR`, owned by `Mob`, inside the `PERICARDIUM`. It is fed from the ascending aorta by `AA_COR` (implicit flow) and drains into both halves of the right atrium through `COR_RAIVCI` and `COR_RASVC`.

## References

This class introduces no literature-derived values. For the time-varying elastance concept see [TimeVaryingElastance](./TimeVaryingElastance.md#references). The coronary elastances are scenario calibrations.
