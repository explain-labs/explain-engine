# Orifice

`helpers/Orifice.js` computes the Bernoulli (kinetic) pressure loss and the jet velocity of flow through a restrictive opening. [`Pda`](./Pda.md) (the ductus arteriosus) and [`Shunts`](./Shunts.md) (foramen ovale, VSD) share it, so the duct and the septal defects use one formula and one constant.

## Physiology

Blood squeezing through a small hole speeds up into a jet. Accelerating the blood costs pressure, and that loss grows with the **square** of the flow, on top of the ordinary viscous (Poiseuille) loss, which grows linearly. A restrictive duct or defect therefore holds a large pressure difference across it, and the jet is fast. This is what Doppler echocardiography measures: the jet velocity *v*, from which clinicians estimate the gradient with the simplified Bernoulli equation ΔP ≈ 4·v².

The jet is narrower than the anatomical opening (the *vena contracta*). The *discharge coefficient* Cd is the ratio of the jet's area to the hole's: about 0.6–0.65 for a sharp-edged hole, up to about 0.9 for a smooth funnel.

## API

| Name | Arguments | Returns | Description |
|---|---|---|---|
| `K_BERNOULLI` | – | 3.975·10⁻⁶ | `ρ · 3.75·10⁻⁹` with ρ = 1060 kg/m³: converts `Q²/A²` (Q in L/s, A in m²) to mmHg. |
| `orifice_b(diameter_mm, cd)` | anatomic diameter (mm), discharge coefficient | B (mmHg·s²/L²) | `B = K_BERNOULLI / A_eff²` with `A_eff = cd · π·(d/2)²`. Returns 0 for a closed orifice (`A_eff = 0`); the caller decides what closed means. |
| `jet_velocity(b, q)` | B, flow (L/s) | m/s, signed like `q` | `v = sign(q)·√(B·q² / (K_BERNOULLI·10⁶))`, exactly the vena-contracta velocity `Q / A_eff`. |

### Derivation

```
ΔP_kinetic = ½·ρ·v²,      v = Q·10⁻³ / A_eff        (Q in L/s → m³/s)
ΔP [mmHg]  = (½·ρ / 133.322) · (Q·10⁻³ / A_eff)²
           = (ρ · 3.75·10⁻⁹) · Q² / A_eff²  =  B · Q²
```

`½·ρ/133.322` = 3.975 mmHg per (m/s)², the exact form of the clinical "4" in ΔP = 4·v². `jet_velocity` uses the exact 3.975, so the velocity and the pressure loss are consistent. With the clinical 4 the velocity would read 0.3 % low.

## Where it is used

| Caller | Orifice | Cd (default) | How |
|---|---|---|---|
| `Pda` | the narrowest (pulmonary) end of the duct, `diameter_pa` | `discharge_coeff` 0.9 | B is added to the duct resistor `AAR_DA` as a flow-dependent resistance `B·|Q_prev|`, on top of the conical Poiseuille resistance. `velocity_doppler` = `jet_velocity(B, Q)`. |
| `Shunts` | foramen ovale `diameter_fo`, VSD `diameter_vsd` | `discharge_coeff_fo` 0.7, `discharge_coeff_vsd` 0.64 | B is added the same way to the FO and VSD resistors. `velocity_fo_doppler` and `velocity_vsd_doppler` come from `jet_velocity`. |

Shipped settings, for example:
- **term_neonate_72h:** duct closed (diameter 0), FO 1.5 mm, no VSD.

## Notes

- **Only the kinetic term.** `jet_velocity` uses the Bernoulli coefficient and the flow, not the total pressure drop, so the viscous loss along a long duct isn't attributed to the jet. Through an open, non-restrictive duct the jet velocity is low even when the total gradient isn't zero.
- **Semi-implicit use.** Both callers fold B into the linear resistance using last step's flow (`B·|Q_prev|`), because the old turbulent `r_k` term of `Resistor` was unstable. `Resistor` now solves `r_k` exactly each step, so passing B as `r_k` is an option, to be reviewed with Pda and Shunts.
- **Cd is a model constant**, not computed from the orifice geometry. term_neonate_72h uses 0.9.
