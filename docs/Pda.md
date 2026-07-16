# Pda

A `Pda` (Patent Ductus Arteriosus) is a component model representing the ductus arteriosus — the fetal shunt between the aortic arch and the pulmonary artery. Unlike a typical `BloodVessel`, the `Pda` is a thin coordinator: it owns a single `Resistor` sub-model (`AAR_DA`, connecting `AAR` → `PA`) and drives its resistance from a set of geometric inputs (diameter, length, viscosity), implementing the **standard quadratic stenosis element** `ΔP = R·Q + B·Q²`.

See also: [Pda-velocity.md](./Pda-velocity.md) for the rationale behind the velocity outputs.

## Inheritance

```
BaseModelClass
  └── Pda    (coordinates the single resistor AAR_DA)
```

The `Pda` does not extend `Capacitance` or `BloodVessel` itself. It steps once per cycle and writes the derived resistance onto its resistor.

## What it models

The ductus arteriosus is a short conical vessel (~2–3 cm) connecting the pulmonary trunk to the descending aorta. In utero it is held open by PGE₂; after birth, rising PO₂ and falling PGE₂ trigger smooth-muscle constriction that closes it functionally within 12–24 hours, followed by fibrotic remodeling over 2–3 weeks.

The model represents the duct as a **linearly tapered cone**, wider at the aortic end and narrower at the pulmonary end. Closure scales both diameters together via `diameter_relative` from `1.0` (fully open) to `0.0` (closed). The whole duct is a **single resistor** carrying the quadratic stenosis element `ΔP = R·Q + B·Q²`:

- `R·Q` — the **viscous** (Hagen-Poiseuille) loss integrated over the full tapered cone (`res`).
- `B·Q²` — the **convective / Bernoulli orifice** loss at the narrowest (pulmonary) end, the vena contracta. `B = K_BERNOULLI / A_eff²` with `A_eff = discharge_coeff · A_pa`. This term *is* the modified-Bernoulli relation, so the jet velocity it produces is self-consistent with the flow and with continuity through the effective orifice.

```
AAR ──[AAR_DA: Resistor]── PA
         r_for/r_back = res + B·|Q|
         (quadratic stenosis element; r_k = 0)
```

There is **no intermediate compartment**: the duct was historically modeled as two resistors around a small `DA` blood-capacitance, but that capacitance was numerically vestigial (a 1000× change in its compliance moved shunt/velocity/gas by 0%, and it turned over ~2.5×/s so it neither delayed nor buffered transport), so the duct was collapsed to a single resistor between `AAR` and `PA`. Blood-gas composition propagates by the `Resistor`'s direct `volume_out`/`volume_in` mixing between the two compartments.

**Numerical scheme.** The quadratic term is applied via a **semi-implicit linearization**: each step `AAR_DA.r_for/r_back` is set to `res + B·|Q_prev|` (and `r_k = 0`), so the resistor solves `Q = ΔP / (res + B·|Q_prev|)`. At steady state this reproduces `ΔP = res·Q + B·Q²` exactly, but it is unconditionally stable. The engine's native explicit quadratic term (`Resistor.r_k`, evaluating `flow = (ΔP − r_k·Q_prev²)/r_for`) is **not** used here: for an open duct the viscous resistance (~10³–10⁴) is far below `2·√(B·ΔP)` (~2×10⁴), so the explicit form diverges.

## Calculation cycle (`calc_model`)

**Closed-duct fast path.** When `diameter_relative === 0` (the postnatal steady state) the cone math,
the Bernoulli √, and the continuity divisions all degenerate, so `calc_model` short-circuits: it
forces `no_flow = true` and `r_for/r_back = 1e8` on the resistor (`r_k = 0`, `B = 0`), zeroes the
velocities, and returns early. The full path below runs only while the duct is patent
(`diameter_relative > 0`).

Each open-duct step executes in this order:

1. **Viscosity** — pulled from the upstream `AAR` compartment (tracks hematocrit).
2. **Diameters** — `diameter_ao` and `diameter_pa` from the effective relative diameter `diameter_relative_eff = diameter_relative · diameter_drug_factor` (PGE1 patency) × their respective maxima, each capped at the anatomic max.
3. **Flow gating** — set `no_flow` when the pulmonary end is fully constricted (`diameter_pa === 0`).
4. **Viscous resistance** — `res = calc_conical_resistance(d_ao, d_pa, length, viscosity)` over the full cone.
5. **Bernoulli orifice term** — compute `B = K_BERNOULLI / A_eff²` from the pulmonary effective orifice area, then set `AAR_DA.r_for/r_back = res + B·|Q_prev|` (semi-implicit quadratic stenosis element).
6. **Velocities** — the honest Bernoulli jet (`velocity_doppler = sign(Q)·√(B·Q²/4)`) plus the anatomic continuity bulk means (`velocity_ao`, `velocity_pa`) for reference.

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
| `discharge_coeff` | 0.3..1 | Effective vena-contracta contraction `Cd` of the pulmonary orifice. The Bernoulli coefficient uses `A_eff = Cd · A_pa`, so `B ∝ 1/Cd²`. The single tuning knob for peak jet velocity (lower `Cd` → tighter jet → higher velocity). Default `0.8` |
| `diameter_drug_factor` | multiplier | Patency multiplier owned by the `Drugs` model (`1.0` = neutral). Prostaglandin E1 (alprostadil / PGE1) drives this above `1.0` to hold a constricting duct open in duct-dependent CHD; it multiplies `diameter_relative` (the product is capped at the anatomic max). **It does not reopen a fully-closed duct** — the `diameter_relative === 0` fast path stays keyed on the raw value (clinically the duct is maintained patent from birth on PGE1, never allowed to reach 0). Default `1.0` |

### Dependent (recomputed each step)

| Property | Unit | Description |
|---|---|---|
| `diameter_relative_eff` | 0..1 | Effective relative diameter after the drug factor (`diameter_relative · diameter_drug_factor`); the read-out that actually drives the geometry |
| `diameter_ao` | mm | Current diameter at aortic end (= `min(diameter_relative_eff · diameter_ao_max, diameter_ao_max)`) |
| `diameter_pa` | mm | Current diameter at pulmonary end (= `min(diameter_relative_eff · diameter_pa_max, diameter_pa_max)`) |
| `viscosity` | cP | Blood viscosity pulled from the upstream `AAR` compartment |
| `flow` | L/s | Shunt flow through the duct; +ve = L→R (aorta → pulmonary) |
| `flow_ao`, `flow_pa` | L/s | Aliases of `flow` (single resistor now; kept for probe/back-compat) |
| `res` | mmHg·s/L | Viscous resistance of the full cone (linear part, pushed to `AAR_DA.r_for/r_back`) |
| `bernoulli_b` | mmHg·s²/L² | Orifice Bernoulli coefficient `B = K_BERNOULLI / A_eff²` (quadratic part, folded into `AAR_DA.r_for/r_back` as `B·|Q_prev|`) |

### Velocity outputs (dependent)

| Property | Unit | Description |
|---|---|---|
| `velocity_doppler` | m/s | Jet peak from the Bernoulli (kinetic) term: `sign(Q)·√(|B·Q²|/4)`. Equals continuity `Q/A_eff` through the effective orifice, so it is honest across both open and restrictive regimes and reverses sign cleanly during bidirectional / PHT shunting |
| `velocity_ao` | m/s | Bulk mean velocity at the *anatomic* aortic end (continuity, `Q/A`) — for reference / open-duct flows |
| `velocity_pa` | m/s | Bulk mean velocity at the *anatomic* pulmonary end (continuity, `Q/A`) — for reference / open-duct flows |

`velocity_doppler` is now the single value to monitor. See [Pda-velocity.md](./Pda-velocity.md) for why the quadratic element makes one honest velocity possible (the old jet-correction outputs and `jet_exponent` were removed).

## Closure

The duct seals purely through its resistance: as `diameter_relative → 0`, the cone collapses and
`res → ∞` (Hagen-Poiseuille `~1/d⁴`), and at exactly `diameter_relative === 0` the closed-duct fast
path forces `no_flow = true` with `r_for/r_back = 1e8`. (The earlier model additionally stiffened a
`DA` capacitance via a BloodVessel-style `el = el_base · (R/R_open)^alpha` coupling; with the duct
collapsed to a single resistor and no intermediate compartment, that coupling — and the `el_base`/
`alpha` parameters — were removed.)

## Resistance formulas

The two functions below compute only the **viscous** (`R·Q`) part of the stenosis element. The
**Bernoulli** (`B·Q²`) part is computed inline in `calc_model` from the pulmonary effective orifice
area: `B = K_BERNOULLI / A_eff²`, `A_eff = discharge_coeff · π·(d_pa/2)²`, with `K_BERNOULLI = ρ/(2·133.322)·1e-6 ≈ 3.976e-6` (mmHg·s²/L²·m², ρ ≈ 1060 kg/m³) — the prefactor that makes `B·Q² ≈ 4·v²`, the textbook modified-Bernoulli form.

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

The Pda references two models by name, cached in `init_model()`:

| Reference | Looks up | Type | Role |
|---|---|---|---|
| `_aar_da` | `AAR_DA` | `Resistor` | AAR → PA, the duct; gets `r_for/r_back = res + B·|Q_prev|` (`r_k = 0`) and `no_flow` |
| `_aar` | `AAR` | `BloodCapacitance` | upstream (aortic-arch) compartment, read-only viscosity source |

`AAR_DA` is declared in the Pda's `components` dictionary in the model definition JSON and instantiated
by `BaseModelClass.init_model()` before `Pda.init_model()` caches the reference. `AAR` is a top-level
circuit compartment (not owned by the Pda).

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
      "description": "ductus arteriosus (aorta-pulmonary) resistor",
      "is_enabled": true,
      "model_type": "Resistor",
      "r_for": 100000000,
      "r_back": 100000000,
      "r_k": 0,
      "comp_from": "AAR",
      "comp_to": "PA",
      "no_flow": true,
      "no_back_flow": false
    }
  },
  "diameter_ao_max": 3.0,
  "diameter_pa_max": 2.0,
  "diameter_relative": 0,
  "length": 20,
  "discharge_coeff": 0.8
}
```

## Usage notes

- **Closure is symmetric in this model.** Real PDA closure proceeds from the pulmonary end first, but the current implementation scales both `diameter_ao` and `diameter_pa` by the same `diameter_relative`. Asymmetric closure would require independent scaling factors.
- **`velocity_doppler` is the value to monitor** — it is the honest jet peak across both open and restrictive regimes (it equals continuity `Q/A_eff` through the effective orifice). `velocity_pa`/`velocity_ao` remain as anatomic continuity bulk means for reference. Some older model definitions still watch `Pda.velocity_pa`; consider repointing the chart channel to `velocity_doppler`.
- **A restrictive jet requires an orifice-like (short) throat `length`.** Because the viscous term scales with `length` (Poiseuille over the cone) while the Bernoulli term does not, a long, narrow duct is viscous-limited and will *not* jet — flow and velocity both stay low even at a large trans-ductal gradient (this is physically correct, and is what makes the new element honest where the old `√(full gradient/4)` over-reported). To model a restrictive/closing PDA, set `length` to the throat length (~1–2 mm) and tune `discharge_coeff` (lower → tighter jet). The `preterm_28wk_restrictive_pda` scenario uses `length = 1.5`, `discharge_coeff = 0.5` (≈2.5 m/s continuous L→R, low pulsatility).
- **Velocity is gradient-limited.** Since `B·Q² = 4·v²` and `B·Q²` can at most equal the full trans-ductal gradient, the peak jet velocity cannot exceed `√(gradient/4)`. Raising peak velocity beyond that ceiling requires a larger systemic–pulmonary pressure difference (e.g. higher SVR / lower PVR), not duct geometry.
- **Viscosity is dynamic.** `viscosity` is pulled from the upstream `AAR` compartment each step (which itself follows hematocrit), so `res` tracks viscosity changes automatically.
