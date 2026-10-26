# Kidneys

`Kidneys` turns the renal vascular bed (`KID_ART` → `KID_CAP` → `KID_VEN`) into a filtering organ. It holds no blood itself. Each step it:
- filters plasma out of the glomerular capillary `KID_CAP` by the Starling balance;
- reabsorbs most of the water and each solute by its own fraction;
- moves the rest into a `URINE` compartment it owns.

It also autoregulates glomerular filtration (myogenic and tubuloglomerular feedback) on the afferent arteriole, and offers the hooks through which [Hormones](./Hormones.md) applies ADH and aldosterone.

## Physiology

The glomerulus filters plasma at a rate set by the filtration coefficient and the net filtration pressure: glomerular capillary pressure minus Bowman's capsule pressure minus plasma oncotic pressure. Proteins and cells stay behind; small solutes pass at their plasma concentration. The tubules reabsorb ~99 % of the filtered water and sodium at term, less in the immature kidney, so a preterm infant loses more sodium (higher FENa) and concentrates urine poorly.

Renal blood flow and GFR stay nearly constant over a range of pressures:
- **myogenic response:** the afferent arteriole constricts when stretched;
- **tubuloglomerular feedback:** the macula densa senses distal NaCl delivery and constricts the afferent when it is high.

Neonatal GFR is low and rises steeply with gestation and postnatal age.

## Inheritance

```
BaseModelClass
  └── Kidneys
```

## Properties

### Config: filtration and reabsorption

| Property | Unit | Default | Description |
|---|---|---|---|
| `kidneys_running` | boolean | `true` | Switch for filtration. |
| `kid_cap_name`, `urine_name` | – | `"KID_CAP"`, `"URINE"` | Glomerular capillary and the bladder compartment (a component, kept out of the blood pool). |
| `kf` | L/(s·mmHg) | 6.6e-6 | Filtration coefficient. term 6.0e-6, preterm 2.1–3.4e-6 (scaled by body surface). |
| `p_bowman` | mmHg | 8 | Bowman's capsule pressure (preterm lower, scaled by the gestation's MAP). |
| `oncotic_base`, `albumin_ref` | mmHg, g/L | 18, 25 | Plasma oncotic pressure at the reference albumin (preterm 15). |
| `reabsorption_fraction` | – | 0.985 | Water reabsorption fraction. term_neonate_72h 0.98. |
| `reabsorption_fractions` | {solute: fraction} | `{}` | Per-solute fractions; absent = the water fraction (iso-osmotic). term_neonate_72h Na 0.99. |
| `filterable_solutes` | list | `na, k, ca, cl, lact, mg, phosphates, uma` | Solutes that pass the glomerulus. Everything else stays in the blood. |
| `kf_factor`, `kf_factor_ps`, `kf_factor_scaling_ps` | – | 1.0 | Additive layers on `kf` (the first reset each step). |
| `reabs_factor`, `reabs_factor_ps`, `reabs_factor_scaling_ps` | – | 1.0 | Multiplicative layers on the water fraction (the first reset each step). |
| `reabs_factor_adh` | – | 1.0 | ADH water channel (written by Hormones). |
| `reabsorption_factors` | {solute: factor} | `{}` | Aldosterone / drug channel on the per-solute fractions (written by Hormones: Na > 1, K < 1). |

### Config: autoregulation

| Property | Unit | Default | Description |
|---|---|---|---|
| `autoregulation_enabled` | boolean | `false` | On in every scenario. |
| `aff_resistor_name` | – | `"AD_KID_ART"` | The afferent's inflow resistor (the effector). |
| `myogenic_input_model`, `myogenic_input_prop` | – | `"KID_ART"`, `"pres"` | Pressure the myogenic limb senses. |
| `myogenic_p_set` | mmHg | 35 | Set-point: each scenario's resting `KID_ART.pres` (term_neonate_72h 40.9). |
| `myogenic_p_min`, `myogenic_p_max` | mmHg | 25, 55 | Autoregulatory window (term 25–65). |
| `myogenic_gain_up`, `myogenic_gain_down` | 1/mmHg | 0.06 | Resistance gain above and below the set-point (scenarios 0.18). |
| `myogenic_tc` | s | 4 | Myogenic time constant. |
| `tgf_use_nacl` | boolean | `true` | TGF senses GFR × Na (else GFR alone). |
| `tgf_setpoint` | – | 0 | TGF set-point; ≤ 0 = captured after `tgf_seed_delay`. Stored in every scenario. |
| `tgf_seed_delay` | s | 30 | Warm-up before the capture. |
| `tgf_gain`, `tgf_tc` | –, s | 0.8, 30 | TGF gain per fractional error (scenarios 2.0) and time constant. |
| `afferent_apply_tc` | s | 6 | Lag on the applied factor. |
| `afferent_factor_min`, `afferent_factor_max` | – | 0.5, 4 | Clamp on the applied factor (scenarios 0.5–10). |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `nfp` | mmHg | Net filtration pressure. |
| `gfr` | mL/min | Glomerular filtration rate. |
| `urine_flow` | mL/min | Urine output. |
| `urine_volume` | mL | Cumulative urine (`URINE.vol`). |
| `fe_na` | % | Fractional excretion of sodium. |
| `myogenic_factor`, `tgf_factor`, `afferent_factor` | – | Limb factors and the applied afferent factor. |
| `sensed_pressure`, `tgf_signal` | mmHg, – | Inputs of the two limbs. |

## Calculation

Each step (nothing while off; skipped if `KID_CAP` or `URINE` is missing):

1. **Effective values:** `kf_eff` (additive layers); `reabs_eff` = fraction × its layers × `reabs_factor_adh`, clamped to 0–0.9999.
2. **Starling:**
   ```
   oncotic = oncotic_base · albumin / albumin_ref
   nfp     = max(0, KID_CAP.pres − p_bowman − oncotic)
   GFR     = kf_eff · nfp,      urine = GFR · (1 − reabs_eff)
   ```
3. **Transfer** of one step's filtrate `Vf`:
   - urine water `Vf·(1 − reabs_eff)` leaves `KID_CAP` for `URINE`;
   - each filterable solute leaves with `Vf · c · (1 − its fraction)`, its fraction modulated by `reabsorption_factors`;
   - **everything not filtered keeps its mass**, so its concentration rises by `V_before / V_after`. That covers albumin and Hb (haemoconcentration), glucose (no glucosuria), the drugs, and the blood's O2 and CO2.
4. **Autoregulation**, every 15 ms:
   ```
   myogenic → 1 + gain · (clamp(KID_ART.pres, p_min, p_max) − p_set)       (tc myogenic_tc)
   tgf      → 1 + tgf_gain · (GFR·Na − tgf_setpoint) / tgf_setpoint          (tc tgf_tc)
   afferent_factor → clamp(myogenic · tgf, min, max)                          (tc afferent_apply_tc)
   AD_KID_ART.r_factor_ps = afferent_factor
   ```
   It acts on the afferent's inflow resistor, upstream of the sensed `KID_ART.pres`, so the loop is negative feedback. The `KID_ART` vessel keeps the systemic channels Circulation adds (SVR, Hormones, Drugs). Switching autoregulation off releases the factor to 1 once.

## Factor system

- `kf` takes additive layers (as Capacitance).
- The reabsorption fraction takes multiplicative layers (it is a fraction).
- ADH and aldosterone have their own channels: `reabs_factor_adh` and `reabsorption_factors`.
- It owns `AD_KID_ART.r_factor_ps`.

## Inputs and outputs

- **Reads:** `KID_CAP` (`pres`, `vol`, `solutes`), `KID_ART.pres`.
- **Writes:** `KID_CAP` (`vol`, `solutes`, `drugs`, `to2`, `tco2`), `URINE` (`vol`, `solutes`), `AD_KID_ART.r_factor_ps`.
- **Written by:** Hormones (`reabs_factor_adh`, `reabsorption_factors`); the user and scenario scripts (calibration, see below).
- **Read by:** `DataCollector` watchers, the Monitor (urine output).

## Assumptions and limitations

- **Oncotic pressure is linear in albumin.**
- **Reabsorption fractions are static per solute:** no transport maxima, no secretion, no acid–base handling (bicarbonate, ammonium), no concentrating mechanism.
- **The bladder never empties** (`URINE` accumulates).
- **Urine water comes from `KID_CAP` only;** the rest of the body equilibrates through the circulation (no interstitial compartment).

### Calibration

- **Term:** `kf` was back-solved for a GFR of ~4 mL/min at a net filtration pressure of ~11 mmHg (a thin margin, so `p_bowman + oncotic` must stay well below `KID_CAP.pres`).
- **Preterm (below 34 weeks) — the kidney of its own gestation and size:** `scripts/_renal_reference.mjs` with `scripts/_renal_bed.mjs`, applied by `reseed_preterm.mjs`, `build_patient.mjs` and `_fix_renal_bed.mjs`. The rules were chosen with the model's author:

  | Quantity | Rule | Basis |
  |---|---|---|
  | GFR target | Vieux 2010 day-7 medians, 7.9 (27 wk) → 30.3 (31 wk) mL/min/1.73 m², exponential, extrapolated to 24 wk; plateau from 31 wk | Vieux R, et al. *Pediatrics* 2010. doi:10.1542/peds.2009-1426 |
  | `oncotic_base` | 15 mmHg ≤ 28 wk, linear to 18 at 40 wk | preterm plasma colloid osmotic pressure ~15 vs term ~17–19 |
  | `p_bowman` | 8 × BR_MAP set-point / 50 | immature transglomerular gradient only modestly lower |
  | `kf` | term `kf` × body surface / term body surface (Mosteller) | the filtration surface grows with the body |
  | Renal blood flow | follows the GFR target at term's filtration fraction | inulin and PAH clearance rise in parallel |
  | Glomerular pressure | `p_bowman` + oncotic + GFR target / `kf` | what that `kf` needs to filter the target |

  `solveRenalBed` then iterates the base resistances of `KID_ART` and `KID_VEN` until renal blood flow and `KID_CAP.pres` meet the targets. It seeds the myogenic set-point, the TGF set-point and Hormones' `perfusion_setpoint` at that rest. The resulting GFR and urine values are in the scenario tables below.

- **Tooling:** `node scripts/headless.mjs <scenario>` reproduces and re-tunes the renal panel (GFR, urine, FE, afferent factor) with overrides such as `--kf` and `--water`.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Kidneys` (trimmed to the main config; `components` holds `URINE`):

```json
{
  "name": "Kidneys",
  "model_type": "Kidneys",
  "is_enabled": true,
  "kidneys_running": true,
  "kf": 6e-6,
  "p_bowman": 8,
  "oncotic_base": 18,
  "reabsorption_fraction": 0.98,
  "reabsorption_fractions": { "na": 0.99, "cl": 0.988, "lact": 0.99, "ca": 0.975, "mg": 0.95, "k": 0.88, "uma": 0.7, "phosphates": 0.82 },
  "autoregulation_enabled": true,
  "aff_resistor_name": "AD_KID_ART",
  "myogenic_p_set": 40.877,
  "myogenic_p_min": 25,
  "myogenic_p_max": 65,
  "myogenic_gain_up": 0.18,
  "myogenic_gain_down": 0.18,
  "tgf_gain": 2,
  "tgf_setpoint": 554.96,
  "afferent_factor_max": 10
}
```

## Usage in the scenarios

One instance in every scenario, with autoregulation on. Stored values at rest:

| Scenario | `kf` (×1e-6) | Water reabs. | GFR (mL/min) | Urine (mL/kg/h) |
|---|---|---|---|---|
| term_neonate_72h | 6.0 | 0.98 | 4.75 | 1.6 |

## References

- Vieux R, Hascoet JM, Merdariu D, Fresson J, Guillemin F. Glomerular filtration rate reference values in very preterm infants. *Pediatrics* 2010;125(5):e1186–92. doi:10.1542/peds.2009-1426.
