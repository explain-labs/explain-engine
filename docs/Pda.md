# Pda

`Pda` is the ductus arteriosus: the connection between the aortic arch (`AAR`) and the pulmonary trunk (`PA`). Each step it turns the duct's size into a resistance (viscous loss along the duct plus a Bernoulli loss at its narrowest point), sets it on the duct resistor `AAR_DA`, and reports the shunt flow and the Doppler velocities a clinician would measure.

## Physiology

Before birth the duct carries most of the right ventricle's output past the fluid-filled lungs into the descending aorta. After birth, rising oxygen and falling prostaglandin E2 constrict it, functionally within days, starting at the pulmonary end. In preterm infants it often stays open: blood then runs left-to-right from the aorta into the lungs ("ductal steal"), flooding the lungs and draining the systemic circulation in diastole. When pulmonary pressure is high, flow becomes bidirectional or right-to-left and lowers the post-ductal saturation.

The **size** of the duct sets how much flows, and its **shape** sets the Doppler picture:
- **Large, unrestrictive duct:** low flow velocity, aortic and pulmonary pressures nearly equal, flow following the pressure difference over the cycle.
- **Restrictive duct (narrow, short throat):** a fast continuous jet (2–3 m/s) over a large pressure difference.

Prostaglandin E1 keeps a constricting duct open (duct-dependent heart disease).

## Inheritance

```
BaseModelClass
  └── Pda
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `diameter_ao_max` | mm | 3.0 | Fully open diameter at the aortic end. |
| `diameter_pa_max` | mm | 2.0 | Fully open diameter at the pulmonary (narrowest) end. **Equal to `diameter_ao_max` in every shipped scenario**, so the duct is a cylinder there. |
| `diameter_relative` | – | 0.0 | Patency fraction 0–1, scaling both ends together; 0 = closed. term_neonate_72h 0. |
| `length` | mm | 20 | Length of the duct (the Poiseuille term). A restrictive jet needs a short throat (~1–2 mm). term_neonate_72h 14. |
| `discharge_coeff` | – | 0.9 | Vena-contracta coefficient of the pulmonary-end orifice; lower = tighter jet. 0.9 in every shipped scenario. |

### Set by other models

| Property | Unit | Default | Description |
|---|---|---|---|
| `diameter_drug_factor` | – | 1.0 | Patency multiplier from `Drugs` (PGE1 > 1). Multiplies `diameter_relative`, capped at the anatomic maximum. It cannot reopen a fully closed duct (`diameter_relative` 0). |
| `viscosity` | cP | 6 | Read from `AAR` every step (follows the haematocrit). |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `diameter_relative_eff` | – | `diameter_relative · diameter_drug_factor`. |
| `diameter_ao`, `diameter_pa` | mm | Current diameters at both ends. |
| `res` | mmHg·s/L | Viscous resistance of the duct (conical Poiseuille). |
| `bernoulli_b` | mmHg·s²/L² | Orifice coefficient at the pulmonary end (see [Orifice](./Orifice.md)). |
| `flow` | L/s | Shunt flow; positive = left-to-right (aorta → pulmonary artery). |
| `flow_ao`, `flow_pa` | L/s | Aliases of `flow` (kept for older probes). |
| `velocity_doppler` | m/s | Jet velocity through the vena contracta, `Q / A_eff`: **the Doppler value to watch**. |
| `velocity_ao`, `velocity_pa` | m/s | Mean velocity through the anatomic area at each end (`Q / A`). |
| `velocity_pa_max`, `velocity_pa_min` | m/s | Per-beat extremes of `velocity_pa`, latched at each new ventricular activation. |
| `velocity_doppler_max`, `velocity_doppler_min` | m/s | Per-beat extremes of `velocity_doppler` (min < 0 = right-to-left). |
| `forward_fraction` | – | Fraction of the previous beat with left-to-right flow. |

## Calculation

Each step (skipped if `AAR_DA` is missing):

1. **Closed duct** (`diameter_relative` exactly 0). `AAR_DA` is sealed (`no_flow`, resistance 10⁸) and the outputs are zeroed.
2. **Geometry.**
   ```
   d_ao = min(diameter_relative · drug_factor · diameter_ao_max, diameter_ao_max)
   d_pa = likewise with diameter_pa_max
   ```
3. **Viscous resistance** over a linearly tapered cone (Hagen–Poiseuille integrated along the length):
   ```
   res = 8·η·L / (3π) · (r₁² + r₁·r₂ + r₂²) / (r₁³ · r₂³)        (a cylinder when r₁ = r₂)
   ```
4. **Bernoulli loss** at the pulmonary end: `B = K_BERNOULLI / (Cd · π·r_pa²)²`.
5. **Resistor:** `AAR_DA.r_for = AAR_DA.r_back = res + B·|Q_prev|`, with `r_k = 0`. The quadratic loss is linearised with the previous step's flow (semi-implicit, stable). It differs from the exact `res·Q + B·Q²` by about 1 % of the Bernoulli term per 0.5 ms step (see [Shunts](./Shunts.md#calculation)).
6. **Velocities:**
   - `velocity_doppler = jet_velocity(B, Q) = Q / A_eff`;
   - `velocity_ao` and `velocity_pa` are `Q / A` at the anatomic areas;
   - then the per-beat envelope is updated.

**Doppler velocity.** Because `B·Q²` is the kinetic (Bernoulli) loss, `velocity_doppler` is the velocity through the vena contracta, consistent across the whole closure trajectory. The viscous loss along the duct doesn't accelerate the blood, so it isn't attributed to the jet. Two consequences:
- a **long, narrow duct** is viscous-limited: low flow and low velocity even across a large gradient;
- the jet can't exceed `√(gradient / 3.975)`: a faster jet needs a larger aorta–pulmonary pressure difference, not a different duct geometry.

Earlier versions reported other velocity outputs (from a separate `DA` compartment and the old 4·v² rule); they were replaced by this single orifice velocity, consistent with [Shunts](./Shunts.md) and [Orifice](./Orifice.md).

## Factor system

None of its own. It writes the **base** `r_for`/`r_back`/`r_k`/`no_flow` of `AAR_DA` every step. `AAR_DA` is `implicit` in every scenario.

## Inputs and outputs

- **Reads:** `AAR.viscosity`, `AAR_DA.flow`, `Heart.ncc_ventricular` (beat boundary).
- **Writes:** `AAR_DA.r_for`, `r_back`, `r_k`, `no_flow`.
- **Written by:** `Drugs` (`diameter_drug_factor`); the user and the scenario generators (diameters, length, `discharge_coeff`).
- **Read by:**
  - `probe_vitals` (duct shunt), and `Monitor` through its configurable `flow_targets`;
  - `scripts/probe_pda.mjs`, `probe_term_reference.mjs` (Doppler envelope);
  - `DataCollector` watchers.

## Assumptions and limitations

- **No closure physiology.** Constriction by oxygen and falling PGE2, closure from the pulmonary end first, and the wall's passive and active elastance aren't computed. The duct's size is a scenario or user setting.
- **Symmetric patency.** `diameter_relative` scales both ends together. The shipped scenarios also set both ends equal, so the duct is a cylinder.
- **Absolute millimetres.** The diameters and `length` aren't scaled with body size; each scenario sets them.
- **PGE1 cannot reopen a closed duct** (`diameter_relative` 0 is a hard stop).
- **Reopening transient.** On the first step after reopening, the Bernoulli term is 0 (no previous flow), so flow briefly overshoots for one step.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Pda` (trimmed to the config props; `components` holds `AAR_DA`):

```json
{
  "name": "Pda",
  "model_type": "Pda",
  "is_enabled": true,
  "diameter_ao_max": 3,
  "diameter_pa_max": 3,
  "diameter_relative": 0,
  "length": 14,
  "discharge_coeff": 0.9,
  "diameter_drug_factor": 1
}
```

## Usage in the scenarios

One instance in every scenario, owning `AAR_DA` (`AAR` → `PA`, implicit):

| Scenario | `diameter_relative` × max (mm) | `length` (mm) | `discharge_coeff` | Duct |
|---|---|---|---|---|
| term_neonate_72h | 0 | 14 | 0.9 | closed |

## References


The orifice constant is derived in [Orifice](./Orifice.md).
