# BloodComposition

`BloodComposition.js` is **not a model class** — it is a module that exports the function **`calc_blood_composition(bc)`**, the acid-base and blood-gas solver for the engine. Given a blood compartment's total dissolved-gas contents (`to2`, `tco2`), its solutes and temperature, it computes pH, pCO₂, pO₂, SO₂, HCO₃⁻ and base excess and writes them back onto the compartment. It is invoked by [`Blood`](./Blood.md), by [`BloodDiffusor`](./BloodDiffusor.md) and the gas exchangers, and by any read-out (Monitor, ANS chemoreceptors, ECLS) that needs partial pressures.

## Inheritance

```
(module function — not a class)

  calc_blood_composition(bc)                      ← exported entry point + result cache
    └── _calc_blood_composition_js(bc)            ← the solve
          ├── _brent_root_finding(_net_charge_plasma, …)   acid-base (H⁺)
          │     └── _net_charge_plasma(hp)        Stewart charge balance + CO₂ partition
          └── _brent_root_finding(_do2_content, …)         oxygenation (pO₂)
                ├── _do2_content(po2)             O₂ content residual
                └── _calc_so2(po2)                Hill saturation
```

These are plain module-scoped functions. The constants, independent variables and state variables (`ph`, `po2`, `so2`, `pco2`, `hco3`, `be`, `P50`, …) are **module-level `let`/`const` globals**, reused across every call — the solver is single-threaded and stateful per call, not re-entrant. Results are returned by mutating the passed-in compartment object `bc`.

## What it models

Two coupled physiological solves, each implemented as a Brent root-find:

1. **Acid-base** — a Stewart strong-ion / charge-balance model. Total CO₂ is partitioned into dissolved CO₂, bicarbonate and carbonate via the carbonic-acid equilibria; albumin and phosphate provide non-bicarbonate buffering. The solver finds the plasma H⁺ that makes net charge zero, yielding pH, pCO₂, HCO₃⁻ and base excess.
2. **Oxygenation** — an O₂–haemoglobin dissociation model (Hill equation) with a P50 that is right/left-shifted by pH (Bohr), pCO₂ (carbamino CO₂-Bohr), temperature and 2,3-DPG. The solver finds the pO₂ whose total O₂ content (Hb-bound + dissolved) matches the compartment's `to2`; SO₂ falls out of the Hill equation.

The two solves are coupled through the **Haldane effect** (O₂ saturation → CO₂ carrying capacity) and the **CO₂-Bohr effect** (pCO₂ → O₂ affinity).

## Inputs and outputs

Read from the compartment `bc`:

| Input | Source | Description |
|---|---|---|
| `bc.to2` | mmol/L | Total O₂ concentration (target for the O₂ solve) |
| `bc.tco2` | mmol/L | Total CO₂ concentration (input to the acid-base solve) |
| `bc.temp` | degC | Temperature (CO₂ solubility, P50 shift) |
| `bc.solutes.na/k/ca/mg/cl/lact` | mmol/L | Strong ions → SID |
| `bc.solutes.albumin/phosphates/uma` | — | Non-bicarbonate buffers / unmeasured anions |
| `bc.solutes.hemoglobin` | mmol/L | Haemoglobin (converted to g/dL via `/0.6206`) |
| `bc.P50_0` | mmHg | O₂–Hb affinity baseline (falls back to 20.0) |
| `bc.haldane_coeff` | unitless | Haldane strength (falls back to `DEFAULT_HALDANE_COEFF = 1.0`) |
| `bc.so2` | % | **Previous-step** SO₂ used for the Haldane term (falls back to 0.98 fraction) |
| `bc.prev_ph`, `bc.prev_po2` | — | Previous results used to set narrow root-find brackets |

Written back to the compartment `bc`:

| Output | Unit | Description |
|---|---|---|
| `bc.ph` | — | Plasma pH |
| `bc.pco2` | mmHg | Partial pressure of CO₂ |
| `bc.hco3` | mmol/L | Bicarbonate |
| `bc.be` | mmol/L | Base excess |
| `bc.po2` | mmHg | Partial pressure of O₂ |
| `bc.so2` | % | O₂ saturation |
| `bc.prev_po2` | mmHg | Updated to the solved pO₂ (next-call bracket seed) |

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `kw` | 2.5119e-11 | Water dissociation constant |
| `kc` | 7.94328235e-4 | Carbonic-acid dissociation constant |
| `kd` | 6.0255959e-8 | Bicarbonate dissociation constant |
| `alpha_co2p` | 0.03067 | CO₂ solubility coefficient |
| `n` | 2.7 | Hill coefficient |
| `alpha_o2` | 1.38e-5 | O₂ solubility coefficient (declared) |
| `gas_constant` | 62.36367 | For the mmol/L → mL conversion factor |
| `left_hp_wide` / `right_hp_wide` | 5.85e-6 / 3.16e-4 | Wide H⁺ brackets (mmol/L) |
| `left_o2_wide` / `right_o2_wide` | 0 / 800.0 | Wide pO₂ brackets (mmHg) |
| `delta_ph_limits` | 0.1 | ± window for the narrow pH bracket |
| `delta_o2_limits` | 10.0 | ± window for the narrow pO₂ bracket |
| `brent_accuracy` | 1e-6 | Root-find tolerance |
| `max_iterations` | 60 | Root-find iteration cap |
| `DEFAULT_HALDANE_COEFF` | 1.0 | Haldane fallback when `bc.haldane_coeff` is undefined |

## Result cache (`calc_blood_composition`)

The exported wrapper memoises the last solve per compartment. It stores `_bc_prev_*` snapshots of `tco2`, `to2`, `temp`, `prev_ph`, `prev_po2`, the strong ions, buffers, haemoglobin and `model_time_total` on `bc`. If every cached input matches the current values (and the step stamp matches, when defined), it returns immediately without re-solving. Otherwise it calls `_calc_blood_composition_js(bc)` and refreshes the cache. This is what makes it cheap to call `calc_blood_composition` from many places each second.

## Acid-base solve (Stewart / charge balance)

`_calc_blood_composition_js` computes the **strong ion difference**:

```
SID = Na + K + 2·Ca + 2·Mg − Cl − lactate
```

then brackets H⁺. If `prev_ph > 0` the brackets are tightened to `10^−(prev_ph ± 0.1)·1000`; the narrow solve is retried with the wide brackets if it fails. `_brent_root_finding` solves `_net_charge_plasma(H⁺) = 0`:

```
cco2p = tco2 / (1 + kc/H + kc·kd/H² + haldane_coeff·(1 − SO₂_prev))
hco3  = kc · cco2p / H
co3p  = kd · hco3 / H
ohp   = kw / H
pco2  = cco2p / alpha_co2p
a_base = albumin·(0.123·pH − 0.631) + phosphates·(0.309·pH − 0.469)

net charge = H + SID − hco3 − 2·co3p − ohp − a_base − uma
```

The `haldane_coeff·(1 − SO₂_prev)` term in the CO₂ partition is the **Haldane effect**: as saturation falls it raises the effective CO₂-carrying capacity, lowering dissolved CO₂ (hence `pco2`/`hco3`) at a given `tco2`. It uses the *previous-step* SO₂ (`bc.so2/100`, default 0.98) to break the O₂↔CO₂ coupling; at steady state `SO₂_prev == SO₂` so the one-step lag vanishes. `haldane_coeff = 0` disables it.

Once H⁺ is found, base excess is:

```
be = (hco3 − 25.1 + (2.3·Hb + 7.7)·(pH − 7.4)) · (1 − 0.023·Hb)
```

and `ph`, `pco2`, `hco3`, `be` are written to `bc`.

## P50 shift (Bohr / CO₂-Bohr / temperature / DPG)

Before the O₂ solve, P50 is shifted from its baseline `P50_0`:

```
ΔpH   = ph − 7.40        (Bohr)
ΔpCO2 = pco2 − 40.0       (carbamino CO₂-Bohr)
ΔT    = temp − 37.0
ΔDPG  = dpg − 5.0

log10(P50) = log10(P50_0) − 0.48·ΔpH + 0.0015·ΔpCO2 + 0.024·ΔT + 0.051·ΔDPG
P50   = 10^log10(P50)
P50_n = P50^n
```

`dpg` is a module variable fixed at 5.0 (no DPG input is wired in, so `ΔDPG = 0` in practice). The `0.0015·ΔpCO2` term is the carbamino-specific CO₂-Bohr coefficient; the pH-mediated part of the CO₂ effect already runs through `−0.48·ΔpH`.

## Oxygen solve (Hill + dissolved O₂)

A second Brent solve finds the pO₂ whose O₂ content matches `to2`. Brackets are `prev_po2 ± 10` when available (retried wide on failure). `_do2_content(po2)` returns the residual `to2 − to2_estimate`, where:

```
SO₂        = po2^n / (po2^n + P50_n)                       (Hill, _calc_so2)
to2_est    = (0.0031·po2 + 1.36·Hb_gdl·SO₂) · 10           (mL O₂ per L blood)
to2_est    = to2_est · inv_mmol_to_ml                      (→ mmol/L)
```

with `Hb_gdl = hemoglobin / 0.6206` and `inv_mmol_to_ml = 760 / (gas_constant·(273.15 + temp))`. On success `bc.po2`, `bc.so2 = so2·100`, and `bc.prev_po2` are written. The Hill SO₂ uses the shifted `P50_n`, so the Bohr/CO₂-Bohr/temperature shifts feed directly into saturation.

## Root finder (`_brent_root_finding`)

A standard Brent solver combining inverse quadratic interpolation, the secant method and bisection fallback, capped at `max_iterations` with `brent_accuracy` tolerance. It returns `-1` if the bracket does not straddle a root (`f(x0)·f(x1) > 0`) or if it fails to converge — which is why both the acid-base and O₂ solves fall back from narrow to wide brackets and log a failure if even the wide bracket fails.

## Notes & caveats

- **Two distinct CO₂↔O₂ couplings.** The CO₂→O₂-affinity term (`ΔpCO2`, "CO₂-Bohr") shifts P50; the **Haldane effect** (SO₂→CO₂ capacity) is the separate term in the CO₂ partition. Don't conflate them.
- **One-step lag.** Because the Haldane term reads the previous SO₂, and the acid-base solve runs before the O₂ solve within a call, the coupling is explicit (lagged), not simultaneous. It converges at steady state.
- The module-level state variables make the solver **non-re-entrant** — it must not be called concurrently for two compartments.
- See [Blood.md](./Blood.md) for how the inputs are seeded and the outputs published, and [BloodCapacitance.md](./BloodCapacitance.md) for the compartment that carries the values.
</content>
