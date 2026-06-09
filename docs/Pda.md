# Pda

A `Pda` (Patent Ductus Arteriosus) is a composite component model representing the ductus arteriosus — the fetal shunt between the aortic arch and the pulmonary artery. Unlike a typical `BloodVessel`, the `Pda` is a thin coordinator: it owns three sub-models (two `Resistor`s and one `BloodCapacitance`) and drives their properties from a single set of geometric inputs (diameter, length, viscosity).

See also: [Pda-velocity.md](./Pda-velocity.md) for the rationale behind the multiple velocity outputs.

## Inheritance

```
BaseModelClass
  └── Pda    (coordinates AAR_DA, DA, DA_PA)
```

The `Pda` does not extend `Capacitance` or `BloodVessel` itself. It steps once per cycle and writes derived values onto its sub-models.

## What it models

The ductus arteriosus is a short conical vessel (~2–3 cm) connecting the pulmonary trunk to the descending aorta. In utero it is held open by PGE₂; after birth, rising PO₂ and falling PGE₂ trigger smooth-muscle constriction that closes it functionally within 12–24 hours, followed by fibrotic remodeling over 2–3 weeks.

The model represents the duct as a **linearly tapered cone**, wider at the aortic end and narrower at the pulmonary end. Closure scales both diameters together via `diameter_relative` from `1.0` (fully open) to `0.0` (closed). The cone is split at its midpoint and the two halves are modeled as separate Hagen-Poiseuille resistances feeding a small central capacitance.

```
AA ──[AAR_DA: Resistor]── DA ──[DA_PA: Resistor]── PA
        r_for/r_back        (BloodCapacitance)    r_for/r_back
        = res_ao            holds vol, el_base    = res_pa
                            = this.el
```

## Calculation cycle (`calc_model`)

**Closed-duct fast path.** When `diameter_relative === 0` (the postnatal steady state) the cone math,
the Bernoulli √, and the continuity divisions all degenerate, so `calc_model` short-circuits: it
forces `no_flow = true` and `r_for/r_back = 1e8` on both resistors, zeroes the velocities, sets the
DA elastance to `el_base × CLOSED_EL_SCALE` (a deterministic `5000×` sentinel — see the coupling
section), and returns early. The full path below runs only while the duct is patent
(`diameter_relative > 0`).

Each open-duct step executes in this order:

1. **Diameters** — `diameter_ao` and `diameter_pa` from `diameter_relative` × their respective maxima.
2. **Pull state from sub-models** — `flow_ao`, `flow_pa`, `viscosity`, `vol`.
3. **Flow gating** — set `no_flow` on each resistor when its end is fully constricted.
4. **Resistances** — compute the AO-half and PA-half resistances over the linear cone, push them to `AAR_DA.r_for/r_back` and `DA_PA.r_for/r_back`.
5. **Resistance-elastance coupling** — compute `r_factor = res_total / res_open_total` and set the DA capacitance's `el_base` to `el_base * r_factor^alpha`.
6. **Velocities** — three flavors: modified Bernoulli (`velocity_doppler`), continuity bulk mean (`velocity_ao`, `velocity_pa`), and the jet-corrected hybrid (`velocity_ao_jet`, `velocity_pa_jet`).

## Properties

### Geometry (independent)

| Property | Unit | Description |
|---|---|---|
| `diameter_ao_max` | mm | Maximum diameter at the aortic end (open duct) |
| `diameter_pa_max` | mm | Maximum diameter at the pulmonary end (open duct) |
| `diameter_relative` | 0..1 | Linear scale on both end diameters. 1 = fully open, 0 = closed |
| `length` | mm | Total length of the cone |

### Physics inputs (independent)

| Property | Unit | Description |
|---|---|---|
| `el_base` | mmHg/L | Baseline (open-duct) elastance written to `DA.el_base` and scaled up by `(R/R_open)^alpha` as the duct constricts |
| `alpha` | 0..1.5 | Resistance-elastance coupling exponent (BloodVessel α-pattern). Default `0.55` — between large-artery (0.5) and arteriole (0.63) with a bump for the PDA's smooth-muscle content |
| `jet_exponent` | 0..3 | Exponent `n` on `(R_total / R_open_total)^(n/4)` used to amplify the continuity velocity into a jet-corrected end velocity. `n = 1` is a linear diameter correction. Default `0.6` |

### Dependent (recomputed each step)

| Property | Unit | Description |
|---|---|---|
| `diameter_ao` | mm | Current diameter at aortic end (= `diameter_relative · diameter_ao_max`) |
| `diameter_pa` | mm | Current diameter at pulmonary end (= `diameter_relative · diameter_pa_max`) |
| `viscosity` | cP | Blood viscosity pulled from `DA.viscosity` |
| `vol` | L | Current duct volume from `DA.vol` |
| `flow_ao` | L/s | Flow through `AAR_DA` (AA → DA) |
| `flow_pa` | L/s | Flow through `DA_PA` (DA → PA) |
| `res_ao` | mmHg·s/L | Resistance of the aortic half-cone (pushed to `AAR_DA.r_for/r_back`) |
| `res_pa` | mmHg·s/L | Resistance of the pulmonary half-cone (pushed to `DA_PA.r_for/r_back`) |
| `el` | mmHg/L | Coupled elastance, `el_base · (R/R_open)^alpha`, pushed to `DA.el_base` |

### Velocity outputs (dependent)

| Property | Unit | Description |
|---|---|---|
| `velocity_doppler` | m/s | Peak velocity from modified Bernoulli on the trans-ductal gradient: `sign(ΔP)·√(|ΔP|/4)` |
| `velocity_ao` | m/s | Bulk mean velocity at the aortic end (continuity, `Q/A`) |
| `velocity_pa` | m/s | Bulk mean velocity at the pulmonary end (continuity, `Q/A`) |
| `velocity_ao_jet` | m/s | `velocity_ao` amplified by stenosis: `velocity_ao · (R/R_open)^(jet_exponent/4)` |
| `velocity_pa_jet` | m/s | `velocity_pa` amplified by stenosis: `velocity_pa · (R/R_open)^(jet_exponent/4)` |

Each velocity is right in a different regime. See [Pda-velocity.md](./Pda-velocity.md) for the regime analysis.

## Resistance-elastance coupling

This mirrors the BloodVessel α-pattern. As the duct narrows:

- Resistance rises as ~`1/d⁴` (Hagen-Poiseuille over a cone).
- The wall stiffness rises with resistance via `el = el_base · (R/R_open)^alpha`.

`R_open` is computed each step from `diameter_ao_max`, `diameter_pa_max`, `length`, and `viscosity` (same conical formula). As `diameter_relative → 0`, `R → ∞` and `el → ∞` — the duct effectively seals. This reproduces the literature-described order-of-magnitude jump in total elastance during functional closure.

At exactly `diameter_relative === 0` the open-path computation is not run (the geometry degenerates); the closed-duct fast path instead sets `el = el_base × CLOSED_EL_SCALE` with `CLOSED_EL_SCALE = 5000`. The exact closed elastance does not affect DA pressure once the capacitance holds its unstressed volume, so a deterministic constant is used in place of the divergent `(R/R_open)^alpha` limit.

## Resistance formulas

### Uniform cylinder — `calc_resistance(diameter, length, viscosity)`

Standard Hagen-Poiseuille:

```
R = (8 · μ · L) / (π · r⁴)        in Pa·s/m³
```

then converted to `mmHg·s/L`.

### Conical taper — `calc_conical_resistance(d1, d2, length, viscosity)`

Hagen-Poiseuille integrated over a linearly tapered cone:

```
R = (8 · μ · L) / (3 · π) · (r1² + r1·r2 + r2²) / (r1³ · r2³)    in Pa·s/m³
```

then converted to `mmHg·s/L`. Reduces to the uniform cylinder when `r1 = r2`.

Both functions return a large sentinel (`1e8`) when the geometry collapses (`d ≤ 0` or `L ≤ 0`).

## Sub-model wiring

The Pda references three sub-models by name, cached in `init_model()`:

| Reference | Looks up | Type | Role |
|---|---|---|---|
| `_aar_da` | `AAR_DA` | `Resistor` | AA → DA, gets `r_for/r_back = res_ao` and `no_flow` |
| `_da` | `DA` | `BloodCapacitance` | the duct's small central volume, gets `el_base = this.el` |
| `_da_pa` | `DA_PA` | `Resistor` | DA → PA, gets `r_for/r_back = res_pa` and `no_flow` |

These three components are declared in the Pda's `components` dictionary in the model definition JSON and instantiated by `BaseModelClass.init_model()` before `Pda.init_model()` caches the references.

## Example definition (JSON)

```json
{
  "name": "Pda",
  "description": "ductus arteriosus model",
  "is_enabled": true,
  "model_type": "Pda",
  "components": {
    "AAR_DA": {
      "name": "AAR_DA",
      "description": "ductus arteriosus aorta connection",
      "is_enabled": true,
      "model_type": "Resistor",
      "r_for": 100000000,
      "r_back": 100000000,
      "r_k": 0,
      "comp_from": "AAR",
      "comp_to": "DA",
      "no_flow": true,
      "no_back_flow": false
    },
    "DA": {
      "name": "DA",
      "description": "blood capacitance model of the ductus arteriosus",
      "is_enabled": true,
      "model_type": "BloodCapacitance",
      "vol": 0.00015,
      "u_vol": 0.00015,
      "el_base": 30000,
      "el_k": 0,
      "pres_ext": 0,
      "fixed_composition": false
    },
    "DA_PA": {
      "name": "DA_PA",
      "description": "ductus arteriosus pulmonary connection",
      "is_enabled": true,
      "model_type": "Resistor",
      "r_for": 100000000,
      "r_back": 100000000,
      "r_k": 0,
      "comp_from": "DA",
      "comp_to": "PA",
      "no_flow": true,
      "no_back_flow": false
    }
  },
  "diameter_ao_max": 3.0,
  "diameter_pa_max": 2.0,
  "diameter_relative": 0,
  "length": 20,
  "el_base": 30000,
  "alpha": 0.55,
  "jet_exponent": 0.6
}
```

## Usage notes

- **Closure is symmetric in this model.** Real PDA closure proceeds from the pulmonary end first, but the current implementation scales both `diameter_ao` and `diameter_pa` by the same `diameter_relative`. Asymmetric closure would require independent scaling factors.
- **`velocity_pa` is the value most UIs monitor** (see model definitions, where `Pda.velocity_pa` is the default velocity channel). It is the continuity bulk mean — smooth waveform, realistic at open-duct flows, but undershoots once the duct becomes restrictive. For restrictive regimes use `velocity_doppler` or `velocity_pa_jet`.
- **Viscosity is dynamic.** `viscosity` is pulled from `DA.viscosity` each step (which itself follows hematocrit), so `res_ao`, `res_pa`, and the open-duct reference resistances all track viscosity changes automatically.
