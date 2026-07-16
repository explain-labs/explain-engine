# Pda — Velocity Outputs

> **Update (quadratic stenosis element).** The trade-off this document analyses has since been
> resolved at the source. The duct resistance is now the standard quadratic stenosis element
> `ΔP = R·Q + B·Q²`, where `R·Q` is the viscous (Poiseuille) loss and `B·Q²` is the Bernoulli orifice
> loss with `B = ρ/(2·A_eff²)`. Because `B·Q²` *is* the modified-Bernoulli relation, the single output
> `velocity_doppler = sign(Q)·√(B·Q²/4)` is now identical to continuity `Q/A_eff` through the effective
> orifice — the two formulas that used to disagree are the same number. The element separates viscous
> loss (which does not accelerate fluid) from kinetic energy (the jet), so `velocity_doppler` is honest
> across the whole closure trajectory, and the empirical jet-correction outputs (`velocity_*_jet`) and
> `jet_exponent` were removed. The continuity bulk means `velocity_ao`/`velocity_pa` remain as anatomic
> reference values. The historical analysis below is retained for background.
>
> One caveat the new element makes explicit: a restrictive jet only forms in an **orifice-like (short)
> throat**. A long, narrow duct is viscous-limited — low flow *and* low velocity even at a large
> gradient — which is correct (the old `√(full gradient/4)` over-reported there). See `Pda.md` usage
> notes; restrictive scenarios set a short `length` (~1–2 mm).
>
> The duct is now a **single resistor** `AAR → PA` (the intermediate `DA` blood-capacitance, shown in
> the figures below, was numerically vestigial and was removed). The "noisy Bernoulli" discussion
> below — which was rooted in the `DA` node's pressure transients feeding the velocity calc — is moot:
> `velocity_doppler` is now derived from the resistive flow (`sign(Q)·√(B·Q²/4)`), not from any node
> pressure. The historical analysis is retained only for background.

The `Pda` model exposes several velocity properties at the pulmonary end of the duct. Two of them are computed by fundamentally different physics and behave in complementary ways: a modified-Bernoulli formulation, and a continuity (flow ÷ area) formulation. This document explains *why* each method behaves the way it does, when each one is right, and where they disagree.

## The properties

`Pda.calc_model` (in `src/explain/component_models/Pda.js`, lines 329–332) sets four velocity outputs:

- **`velocity_doppler`** — the raw modified-Bernoulli jet velocity at the pulmonary end: `v_jet_pa = sign(ΔP) · √(|ΔP|/4)`.
- **`velocity_pa`** — that same jet velocity, scaled by continuity from the vena-contracta cross-section to the PA-end area: `v_jet_pa · (A_min / A_pa)`.
- **`velocity_ao`** — the analogous quantity at the aortic end of the duct.
- **`velocity_pa_area`** — the bulk mean velocity from the resistive flow: `Q_DA→PA / A_pa`.

In what follows, "the Bernoulli path" means `velocity_pa` / `velocity_doppler`, and "the continuity path" means `velocity_pa_area`.

## Observed trade-off

| | Bernoulli path | Continuity path |
|---|---|---|
| Peak velocity rises as the duct constricts | ✓ matches clinical Doppler | ✗ peak *falls* — unphysiological |
| Waveform shape resembles a real Doppler envelope | ✗ jagged / noisy | ✓ smooth |
| Open-duct peak velocity is clinically realistic | ✗ tends to overshoot | ✓ ~1 m/s as expected |

The rest of the doc explains each row.

## The two formulas

### Modified Bernoulli — `v = √(ΔP / 4)` (m/s, ΔP in mmHg)

This is the standard simplification of `½ρv² = ΔP` for blood (ρ ≈ 1060 kg/m³). Converting ΔP from mmHg to Pa and solving for v in m/s gives `v ≈ 0.5015·√(ΔP_mmHg)`, which is conventionally reported as `v² = ΔP/4`.

The formula assumes:
- The fluid is inviscid (no viscous dissipation between the upstream and downstream pressure-measurement sites).
- The proximal velocity is small enough to ignore.
- All of the trans-ductal pressure energy is converted to kinetic energy at the vena contracta.

In a *restrictive* lesion these assumptions are approximately true and the equation correctly reports the **jet peak velocity** at the vena contracta. In a *non-restrictive* segment the inviscid assumption fails (viscous drag is significant) and the equation over-estimates v.

### Continuity — `v = Q / A`

The bulk mean velocity at the chosen cross-section. In `Pda.js` it is evaluated at `A_pa`, the anatomic area at the PA end of the duct. `Q` is the resistive flow returned by the `DA_PA` `Resistor` instance (`src/explain/base_models/Resistor.js`, lines 204–254). The Resistor solves `Q = (p1 − p2) / R` each step — pure resistive, no inertance term.

This gives the average velocity over the anatomic lumen. When the flow profile is smooth and fills the lumen (low Reynolds number, no jet), the bulk mean is close to the Doppler peak. When a jet forms inside a much-narrower vena contracta, the bulk mean across the anatomic lumen dramatically underestimates the jet peak.

## Why the Bernoulli peak RISES as the duct constricts

`Pda.calc_conical_resistance` (lines 364–394) is a Hagen–Poiseuille integration over a linearly tapered cone:

```
R = (8 · μ · L / 3π) · (r1² + r1·r2 + r2²) / (r1³ · r2³)
```

So `R ∝ 1/r⁴` (to leading order). As the duct constricts, R rises rapidly and the duct becomes the dominant resistance between the aorta and the pulmonary artery. Increasingly, the *systemic-pulmonary pressure difference itself* (roughly 30–60 mmHg after transition) is dropped across the duct, so ΔP across the duct approaches that systemic-pulmonary difference.

`v = √(ΔP / 4)` with ΔP = 60 mmHg gives ~3.9 m/s — the textbook value for a restrictive PDA jet. As ΔP grows from a few mmHg (open) to tens of mmHg (constricted), v grows monotonically, matching clinical Doppler observations.

## Why the continuity peak FALLS as the duct constricts

Combine the network behavior:

- `Q ∝ ΔP / R`, and `R ∝ 1/d⁴`, so `Q ∝ ΔP · d⁴`.
- `A ∝ d²`.

Therefore `v = Q / A ∝ (ΔP · d⁴) / d² = ΔP · d²`. The `d²` factor dominates the (bounded) rise in ΔP, so `v → 0` as `d → 0`.

This is *not a bug*. The continuity formula reports the bulk mean velocity across the **anatomic** lumen. Real flow through a stenotic orifice does *not* fill the anatomic lumen smoothly — it forms a high-speed core jet through a vena contracta narrower than the anatomic opening, surrounded by separation/recirculation. The Doppler probe measures the **jet peak**, not the anatomic mean, so continuity-at-anatomic-area systematically underestimates the clinical Doppler value as the duct constricts.

## Why the continuity waveform looks like a clean Doppler envelope

`Q` comes from a Resistor whose only input each step is the instantaneous pressure difference between its two endpoints. Those endpoints are aortic-arch and pulmonary-artery node pressures filtered through the entire systemic and pulmonary circulation ODE — large reservoirs, slow compliances, smooth cardiac forcing. The resulting `Q` waveform inherits that smoothness: a clean systolic acceleration, a diastolic phase, no high-frequency content.

`velocity_pa_area = Q · 0.001 / A_pa` is just `Q` rescaled by a constant, so it inherits the smooth shape directly. That is why this output looks like a real Doppler envelope.

## Why the Bernoulli waveform looks noisier

The code at lines 319–322 uses **local** gradients across each half of the duct:

```js
const dp_ao = p_aa - p_da;
const dp_pa = p_da - p_pa;
v_jet_ao = Math.sign(dp_ao) * Math.sqrt(Math.abs(dp_ao) / 4.0);
v_jet_pa = Math.sign(dp_pa) * Math.sqrt(Math.abs(dp_pa) / 4.0);
```

`p_da` is the pressure at the DA capacitance node (`src/explain/base_models/Capacitance.js`, lines 168–180: pressure is the instantaneous elastic recoil on `vol − u_vol`). The DA node holds a small volume of blood and its pressure swings transiently within each cardiac cycle around the mean of `p_aa` and `p_pa`. Those swings inject into `dp_ao` and `dp_pa` with opposite signs and produce cycle-by-cycle artifacts in `v_jet_*`.

**Discrepancy worth flagging**: the comment block at lines 306–311 *claims* a single trans-ductal gradient `p_aa − p_pa` is used "to keep the sign of all three outputs consistent during flow reversal (PHT / bidirectional shunting); using the local p_da would let the DA capacitance's transient pressure swings flip the sign of one half independently of the other." That comment describes the *intent*, but the code uses local gradients. Either the code or the comment is stale — this is the most likely source of the "noisy Bernoulli" observation, and resolving it would meaningfully clean up the Bernoulli waveform.

## Why Bernoulli OVER-estimates at baseline

`v = √(ΔP/4)` assumes *all* of ΔP converts to kinetic energy at the orifice. In an open duct with low Reynolds number, a meaningful fraction of ΔP is instead dissipated viscously along the length of the duct — that fraction does not accelerate fluid. The Bernoulli formula over-states v by exactly that fraction. The equation only becomes accurate once viscous loss is small relative to jet kinetic energy, i.e., once the orifice is restrictive enough that flow detaches and forms a jet.

## Why continuity is realistic at baseline

Open PDA carries roughly 0.5–1.5 L/min through a 2–4 mm lumen, putting Reynolds number well below the turbulent threshold (~2300). Flow is laminar/transitional, the profile fills the lumen, and the bulk mean velocity is a good approximation of the Doppler envelope peak (≈ 0.5–1.5 m/s). This matches what clinicians see on echo for non-restrictive PDA.

## Doppler reality check

Echo Doppler reports the highest velocity in the sample volume — physically that is the vena contracta jet peak.

- **Non-restrictive PDA**: jet peak ≈ bulk mean. Continuity is right; Bernoulli over-shoots.
- **Restrictive PDA**: jet peak ≫ bulk mean. Bernoulli is right; continuity from anatomic area is wrong.

Neither single formula is correct across the whole closure trajectory.

## Summary

| Regime              | v = Q/A (continuity)         | v = √(ΔP/4) (Bernoulli)        |
|---------------------|------------------------------|--------------------------------|
| Open duct (low R)   | ✓ realistic peak & shape     | ✗ overestimates (viscous loss) |
| Restrictive duct    | ✗ underestimates (no jet)    | ✓ peak rises correctly         |
| Waveform shape      | ✓ smooth (network-filtered)  | ✗ noisy (p_da transients)      |

The user's empirical observations match the physics exactly: each formula is right in one regime and wrong in the other.

## Path forward (not implemented)

Two follow-up steps would resolve the trade-off without removing either existing output:

1. **Hybrid output `velocity_pa_combined`**. Blend Bernoulli and continuity via a sigmoid weight in `R_total / R_open_total` (the same driver already used for the elastance coupling at `Pda.js` lines 294–301, which mirrors the `BloodVessel` α-pattern at `src/explain/component_models/BloodVessel.js` lines 4–17 and 353–366). Below a ratio of ~5 the weight favors continuity (open-duct regime, smooth and realistic); above ~20 it favors Bernoulli (restrictive regime, jet peak rises); the transition is smooth between. Keeping the existing outputs preserves backward compatibility with old preset charts.

2. **Single trans-ductal gradient for Bernoulli**. Align the code at lines 319–322 with the comment block at lines 306–311 — drive both `v_jet_ao` and `v_jet_pa` from `p_aa − p_pa` rather than from the local gradients. This removes the spurious `p_da` transient artifacts and is independently worth doing even without (1).

## Cross-references

- Resistor flow equation: `src/explain/base_models/Resistor.js`, lines 204–254.
- Capacitance pressure equation: `src/explain/base_models/Capacitance.js`, lines 168–180.
- BloodVessel α-coupling (header + code): `src/explain/component_models/BloodVessel.js`, lines 4–17 and 353–366.
- Prior art (Shunts uses continuity only): `src/explain/component_models/Shunts.js`, lines 240–245.
