# BloodComposition

`BloodComposition` is the blood-gas solver: the function `calc_blood_composition(bc)`. Given a blood compartment's **contents** (total O2, total CO2, strong ions, buffers, haemoglobin, temperature), it computes what a blood-gas analyser reports: **pH, pCO2, HCO3, base excess, pO2 and SO2**. The compartments carry only contents. The partial pressures and pH exist only where someone calls this solver.

It is a module of functions, not a model class: no `model_type`, no instance.

## Physiology

The body transports amounts (mmol of O2 and CO2, mmol of ions), but gases diffuse and receptors sense along partial pressures and pH. Converting one to the other is what this solver does.

- **Acid-base (physicochemical, Stewart / Figge).** A sample's pH is set by three independent things:
  - the **strong ion difference** (Na + K + 2Ca + 2Mg − Cl − lactate);
  - the **total CO2**;
  - the **weak acids**: albumin, phosphate, haemoglobin.

  pH is whatever makes the solution electrically neutral. So a high chloride (saline) or a high lactate lowers the SID and causes a metabolic acidosis; CO2 retention a respiratory one.
- **Oxygen.** O2 is carried bound to haemoglobin (1.36 mL per g, Hüfner) and a little dissolved (0.0031 mL/dL per mmHg). Saturation follows the sigmoid dissociation curve. Its position (P50) shifts right with acidosis (Bohr effect), higher pCO2, higher temperature and more 2,3-DPG, and left in fetal haemoglobin.
- **Haldane effect.** Deoxygenated blood binds more CO2 (carbamino), so at the same total CO2 desaturated blood has a lower pCO2.

## API

```js
import { calc_blood_composition } from "./component_models/BloodComposition.js";
calc_blood_composition(bc);   // solves in place on bc
```

### Read from `bc`

| Field | Unit | Description |
|---|---|---|
| `to2`, `tco2` | mmol/L | Total O2 and CO2 content. |
| `solutes.na`, `k`, `ca`, `mg`, `cl`, `lact` | mmol/L | Strong ions (SID). |
| `solutes.albumin` | g/L | Weak acid. |
| `solutes.phosphates` | mmol/L | Weak acid. |
| `solutes.uma` | mmol/L | Unmeasured anions, a fixed negative charge (the anion-gap calibration). |
| `solutes.hemoglobin` | mmol/L | O2 capacity and non-bicarbonate buffer (1 g/dL = 0.6206 mmol/L). |
| `temp` | °C | Shifts P50 only. |
| `P50_0` | mmHg | Dissociation-curve position at standard conditions (default 20). |
| `haldane_coeff` | – | Haldane strength (default 1; 2.2 in the scenarios). |
| `hb_buffer_fraction` | – | Optional; share of Hb that buffers (default 1/3). No scenario sets it. |
| `so2`, `prev_ph`, `prev_po2` | %, –, mmHg | Last solution: the Haldane input and the warm start of both root searches. |

### Written to `bc`

| Field | Unit | Description |
|---|---|---|
| `ph`, `pco2`, `hco3`, `be` | –, mmHg, mmol/L, mmol/L | Acid-base result; `be` is the **standard** base excess. |
| `po2`, `so2` | mmHg, % | Oxygen result. |
| `prev_ph`, `prev_po2` | | Warm start for the next call (persisted state, saved with the scenario). |
| `_bc_prev_*`, `_bc_cache_initialized` | | Result cache (see below). |

## Calculation

**1. Cache.** If the step time (`model_time_total`) and every input above equal the last call's, it returns at once. In practice it skips only repeated calls within one step (several models solving the same compartment).

**2. Acid-base: charge balance.** Brent's method finds [H⁺] (mmol/L) that zeroes the net charge:
```
cCO2  = tco2 / (1 + Kc/H + Kc·Kd/H² + haldane_coeff·(1 − SO2_prev))     dissolved CO2
HCO3  = Kc·cCO2 / H,   CO3 = Kd·HCO3 / H,   OH = Kw / H,   pCO2 = cCO2 / 0.03067
A_alb+P = albumin·(0.123·pH − 0.631) + phosphates·(0.309·pH − 0.469)        (Figge)
A_Hb    = 2.3 · Hb · hb_buffer_fraction · (pH − 7.4)                       (Van Slyke)
0 = H + SID − HCO3 − 2·CO3 − OH − A_alb+P − A_Hb − uma
```
Constants: pK′ 6.1 (`Kc`), pK 10.22 (`Kd`), pKw 13.6, CO2 solubility 0.03067 mmol/L/mmHg; all at 37 °C. The search is bracketed at the last pH ± 0.1; if that fails, at pH 6.0–8.5.
```
BE = 0.93 · (HCO3 − 24.4 + 14.83·(pH − 7.4))       standard base excess (Siggaard-Andersen)
```

**3. P50.**
```
log10 P50 = log10 P50_0 − 0.48·(pH − 7.4) + 0.0015·(pCO2 − 40) + 0.024·(T − 37) + 0.051·(DPG − 5)
```
DPG is fixed at 5, so its term is always 0.

**4. Oxygen.** Brent's method finds the pO2 for which
```
SO2 = pO2ⁿ / (pO2ⁿ + P50ⁿ),   n = 2.7                         (Hill)
to2 = (0.0031·pO2 + 1.36·Hb[g/dL]·SO2) · 10 / 22.414          (mL/L at STPD → mmol/L)
```
equals the compartment's `to2`. It is bracketed at the last pO2 ± 10 mmHg; if that fails, at 0–1000 mmHg.

**Order and lag.** The acid-base solve runs first with the previous SO2 (Haldane); then the O2 solve uses the new pH and pCO2 (Bohr). The O2↔CO2 coupling therefore lags by one call and converges at steady state.

## Behaviour (bench test, term_neonate composition, Hb 10 mmol/L)

| Change | Result |
|---|---|
| tCO2 24 → 28 mmol/L | pCO2 38 → 69 mmHg, pH 7.38 → 7.17, HCO3 22.1 → 24.5: **~0.8 mmol/L HCO3 per 10 mmHg** (in vivo acute ~1). SBE drifts −2.4 → −3.1. |
| to2 7 mmol/L | SO2 71 %, pO2 32 mmHg at pH 7.30 |
| temp 37 → 33.5 °C | pO2 32 → 27 mmHg at the same SO2; **pH and pCO2 unchanged** |

## Assumptions and limitations

- **No temperature correction of acid-base.** The dissociation constants and CO2 solubility are 37 °C values; temperature moves only P50. So pH and pCO2 are what an analyser reports at 37 °C (alpha-stat values), also during therapeutic hypothermia. pO2 does follow the patient's temperature (via P50).
- **Plasma model with an ECF-equivalent Hb buffer.** The charge balance is a plasma model; Hb buffers at a third of its concentration to stand in for the extracellular fluid the blood equilibrates with. No red-cell compartment, no chloride shift.
- **Fixed Hill curve** (n 2.7): less accurate at very low and very high saturations than the full Kelman / Severinghaus curves. 2,3-DPG is fixed; methaemoglobin and carboxyhaemoglobin are absent.
- **Carbamino CO2** appears only in the Haldane term; it isn't reported separately, and `hco3` excludes it.
- **Failed solves keep the last values.** Outside pH 6.0–8.5, or above the content reachable at 1000 mmHg, the solve fails, logs once per call, and the compartment keeps its previous pH, pCO2, pO2 and SO2. A compartment that has never solved keeps the `-1` sentinel; [GasExchanger](./GasExchanger.md) handles that case.
- **Not re-entrant.** The solver keeps its working values in module-level variables; it must not run for two compartments at once (it never does in the single-threaded worker).
- **Contents are whole blood, chemistry is plasma.** `to2`/`tco2` are per litre of blood, the acid-base constants are plasma ones; the calibration (`uma`, `haldane_coeff`) absorbs the difference.

## Callers

| Caller | Compartments | When |
|---|---|---|
| [Blood](./Blood.md) | `AA`, `AD`, `IVCI`, `SVC`, `RAIVCI`, `PA` | every 1 s |
| [GasExchanger](./GasExchanger.md) | the lung capillaries | its own update interval |
| [BloodDiffusor](./BloodDiffusor.md) | both sides (e.g. placenta) | every step it runs |
| [Ans](./Ans.md) | its `blood_composition_models` (chemoreceptor sites) | its update interval, while `ans_active` |
| [Ecls](./Ecls.md) | tubing and oxygenator | its update interval |
| `ModelEngine` | any named compartment | on request (`GET "blood_composition"`) |

## References

- Figge J, Mydosh T, Fencl V. Serum proteins and acid-base equilibria: a follow-up. *J Lab Clin Med* 1992 (albumin and phosphate charge).
- Stewart PA. Modern quantitative acid-base chemistry. *Can J Physiol Pharmacol* 1983.
- Siggaard-Andersen O. The Van Slyke equation. *Scand J Clin Lab Invest Suppl* 1977 (standard base excess).
