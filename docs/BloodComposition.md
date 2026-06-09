# BloodComposition

`BloodComposition.js` exports **`calc_blood_composition(bc)`** — the acid-base and blood-gas solver.
Given a blood compartment's total contents (`to2`, `tco2`), solutes and temperature, it computes pH,
pCO₂, pO₂, SO₂, HCO₃⁻ and base excess. It is called by `Blood`, the diffusors/exchangers, the ANS
chemoreceptors and the ECLS/monitor read-outs.

## Inputs and outputs

| In | Out |
|---|---|
| `to2`, `tco2`, solutes (Na, K, Ca, Mg, Cl, lactate, albumin, phosphate, uma, haemoglobin), `temp` | `ph`, `pco2`, `po2`, `so2`, `hco3`, `be` |

A result cache short-circuits the (expensive) solve when none of the inputs changed since the last
call.

## Acid-base solve (Stewart / charge balance)

A **Brent root-finder** solves for the plasma H⁺ concentration that makes the net charge balance to
zero. At each candidate H⁺, total CO₂ is partitioned into dissolved CO₂, bicarbonate and carbonate
(carbonic-acid equilibria), albumin/phosphate buffering is added, and:

```
cco2p = tco2 / (1 + kc/H + kc·kd/H² + haldane_coeff · (1 − SO₂_prev))
pco2  = cco2p / alpha_co2p
hco3  = kc · cco2p / H
```

The **Haldane effect** term (`haldane_coeff · (1 − SO₂)`) raises the CO₂-carrying capacity as
saturation falls, using the previous step's SO₂ to break the O₂↔CO₂ coupling (they converge at steady
state). Base excess follows from `hco3`, `ph` and haemoglobin.

## Oxygen solve (P50 shift + Hill)

The O₂-haemoglobin **P50 is shifted** for pH (Bohr), pCO₂ (CO₂-Bohr), temperature and 2,3-DPG:

```
log10(P50) = log10(P50_0) − 0.48·ΔpH + 0.0015·ΔpCO2 + 0.024·ΔT + 0.051·ΔDPG
```

A second Brent solve finds the pO₂ whose O₂ content (Hill saturation with the shifted P50, plus
dissolved O₂) matches the target `to2`; SO₂ falls out of the Hill equation.

## Notes & caveats

- **Two distinct effects.** The CO₂→O₂-affinity term (`ΔpCO2`, "CO₂-Bohr") shifts P50; the **Haldane
  effect** (SO₂→CO₂ capacity) is the separate term in the CO₂ partition above. The CO₂-Bohr
  coefficient is `0.0015`/mmHg (a carbamino-specific value); the pH-mediated CO₂ effect runs through
  the `−0.48·ΔpH` term.
- `haldane_coeff` (default 1.0, tunable on `Blood`, 0 = off) controls the Haldane strength; both the
  Haldane and CO₂-Bohr coefficients should be validated against expected arterio-venous gases.
- See [Blood.md](./Blood.md) for how inputs are seeded and outputs published, and
  [BloodCapacitance.md](./BloodCapacitance.md) for the compartment that carries the values.
