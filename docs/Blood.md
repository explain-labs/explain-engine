# Blood

`Blood` is a **manager model**, not a compartment. It owns the circulating blood properties (haemoglobin and the other solutes, dissolved gases, temperature, viscosity, the O₂–Hb affinity baseline and the Haldane coefficient), seeds them onto every blood-containing compartment at build time, exposes setters to change them at runtime, and once per second samples representative compartments to publish arterial and venous blood gases. The acid-base / oxygenation chemistry itself lives in [`BloodComposition`](./BloodComposition.md); `Blood` only sets the inputs and reads the outputs.

## Inheritance

```
BaseModelClass
  └── Blood   (whole-blood property manager)
```

`Blood` extends `BaseModelClass` directly. It holds no volume or pressure of its own — it operates on the [`BloodCapacitance`](./BloodCapacitance.md)-family compartments via references collected at init.

## What it models

A single `Blood` instance per scenario represents the circulating blood as a whole:

- the **reference composition** every freshly-built blood compartment starts from,
- the **propagation path** that pushes `haldane_coeff` / `P50_0` (and, via setters, temperature, viscosity, gases and solutes) out to all blood compartments, and
- the **blood-gas read-outs** (pre-ductal arterial, post-ductal arterial, venous, mixed-venous) that the Monitor and UI display.

It does not move volume or compute pressure; flow mixing is done per-compartment in [`BloodCapacitance.volume_in`](./BloodCapacitance.md), gas exchange in the diffusors/exchangers, and metabolism in the metabolic models.

## Properties

### Configuration (set from the model definition / `init_model`)

| Property | Unit | Description |
|---|---|---|
| `viscosity` | cP | Reference blood viscosity (default 6.0) |
| `temp` | degC | Reference blood temperature (default 37.0) |
| `to2` | mmol/L | Reference total O₂ concentration seeded into compartments |
| `tco2` | mmol/L | Reference total CO₂ concentration seeded into compartments |
| `solutes` | object | Reference circulating solute set (Na, K, Ca, Mg, Cl, lactate, albumin, phosphates, uma, hemoglobin, glucose, …) |
| `P50_0` | mmHg | O₂–Hb affinity baseline (pO₂ at 50% saturation): fetal HbF ≈ 18.8, neonatal 20.0, adult 26.7 (default 20.0) |
| `haldane_coeff` | unitless | Haldane-effect strength propagated to every compartment; `0` disables it (default 1.0) |
| `blood_containing_modeltypes` | array | Model types treated as blood compartments: `BloodVessel`, `HeartChamber`, `BloodCapacitance`, `BloodTimeVaryingElastance`, `BloodPump`, `MicroVascularUnit` |

### Computed / published (dependent)

| Property | Unit | Description |
|---|---|---|
| `preductal_art_bloodgas` | object | `{ph, pco2, po2, hco3, be, so2}` sampled from the ascending aorta `AA` |
| `art_bloodgas` | object | Post-ductal arterial blood gas sampled from the descending aorta `AD` |
| `ven_bloodgas` | object | Venous read-out (declared on the model; venous solves run on `IVCI`/`SVC`/`RAIVCI`) |
| `art_solutes` | object | Snapshot of `AD.solutes` (arterial solute concentrations) |

### Local references (`_`-prefixed)

| Property | Description |
|---|---|
| `_update_interval` | Sampling period for `calc_model` (1.0 s) |
| `_update_counter` | Time accumulator toward `_update_interval` |
| `_ascending_aorta` | Reference to `model.models["AA"]` (pre-ductal site) |
| `_descending_aorta` | Reference to `model.models["AD"]` (post-ductal site) |
| `_blood_components` | Array of every blood-containing compartment, collected at init |

## Build-time bootstrap (`init_model`)

After applying the definition args, `init_model` walks `model.models` and, for every model whose `model_type` is in `blood_containing_modeltypes`:

1. pushes it onto `_blood_components`,
2. propagates `model.haldane_coeff = this.haldane_coeff`,
3. sets `model.P50_0 = this.P50_0` **only if the compartment has no `P50_0` of its own** (`model.P50_0 === undefined`) — a maternal pool kept at adult affinity therefore survives,
4. **only for freshly-constructed compartments** (`Object.keys(model.solutes).length === 0`) copies the reference composition: `to2`, `tco2`, a shallow clone of `solutes`, `temp`, `viscosity`.

The empty-solutes guard (rather than a `to2 == 0 && tco2 == 0` proxy) is deliberate: a restored / loaded saved state already carries per-compartment composition, and that composition is preserved even when a compartment legitimately has `to2 == 0`. Finally it caches the `AA`/`AD` references and sets `art_solutes = {...this.solutes}`.

## Publishing blood gases (`calc_model`)

`calc_model` accumulates `_t` into `_update_counter` and only acts once `_update_counter >= _update_interval` (1.0 s), then resets the counter. On each tick it calls `calc_blood_composition` (see [BloodComposition](./BloodComposition.md)) on selected compartments and copies the results:

- **`AA`** → `preductal_art_bloodgas`
- **`AD`** → `art_bloodgas`, and `art_solutes = {...AD.solutes}`
- **`IVCI`** and **`SVC`** → venous solve (composition updated in place)
- **`RAIVCI`** (if present) → mixed-venous solve. The Monitor reads SvO₂ from `RAIVCI`, so its composition must be solved here or `so2` stays at the `-1` sentinel.

## Runtime setters

Each setter updates the reference value on `Blood` and/or pushes a value out to the compartments. Those that accept a `bc_site` apply to a single named compartment when one is given, otherwise to every compartment in `_blood_components`.

| Setter | Effect |
|---|---|
| `set_temperature(temp, bc_site = "")` | Sets `temp` on all compartments (or one site); updates `this.temp` |
| `set_viscosity(viscosity)` | Sets `viscosity` on all compartments; updates `this.viscosity` |
| `set_haldane_coeff(coeff)` | Sets `haldane_coeff` on all compartments; updates `this.haldane_coeff` |
| `set_P50(p50)` | Sets `P50_0` on all compartments; updates `this.P50_0` (pick the dissociation curve, e.g. fetal vs adult) |
| `set_to2(to2, bc_site = "")` | Sets `to2` on all compartments (or one site) |
| `set_tco2(tco2, bc_site = "")` | Sets `tco2` on all compartments (or one site) |
| `set_solute(solute, value, bc_site = "")` | Sets one solute on a named site; or (no site) sets it on every compartment **and** on the reference `this.solutes` |

Note: `set_temperature`, `set_viscosity`, `set_haldane_coeff`, `set_P50` and `set_solute` (no site) write back to the matching reference property; `set_to2` / `set_tco2` (no site) push to the compartments only and do **not** update `this.to2` / `this.tco2`.

## Example definition (JSON)

From `term_neonate.json` (`model_definition.models.Blood`):

```json
{
  "name": "Blood",
  "description": "blood composition model",
  "is_enabled": true,
  "model_type": "Blood",
  "viscosity": 6,
  "temp": 37.0,
  "to2": 7,
  "tco2": 25.5,
  "solutes": {
    "na": 138, "k": 3.5, "ca": 1, "cl": 106, "lact": 1, "mg": 0.75,
    "albumin": 25, "phosphates": 1.64, "uma": 6, "hemoglobin": 10, "glucose": 4
  },
  "P50_0": 20,
  "haldane_coeff": 1
}
```

`hemoglobin` is carried in `solutes` in **mmol/L** (the solver converts to g/dL internally). The `preductal_art_bloodgas` / `art_bloodgas` / `ven_bloodgas` / `art_solutes` objects also appear in a saved scenario, but they are computed outputs, not inputs.

## Usage in the model

- Exactly one `Blood` instance per scenario. It must be built after the compartments exist so `_blood_components`, `AA` and `AD` resolve.
- The reference `to2`/`tco2`/`solutes` are **seeds only**; after build the simulation tracks per-compartment values updated by flow mixing ([BloodCapacitance](./BloodCapacitance.md)), diffusion ([BloodDiffusor](./BloodDiffusor.md)) and metabolism.
- `set_P50` / `set_haldane_coeff` are the levers for selecting a dissociation curve (fetal vs neonatal vs adult) and tuning the arterio-venous CO₂ behaviour respectively.
</content>
