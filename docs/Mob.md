# Mob

`Mob` is the **myocardial oxygen balance**. It computes the heart's own O2 consumption, a basal part plus the cost of its mechanical stroke work, and takes it from the coronary blood pool `COR`. When coronary O2 runs low it depresses heart rate, contractility and the heart's response to sympathetic drive: the ischaemic, failing myocardium. It owns the coronary circulation (`COR` and its connectors) as sub-models.

## Physiology

The heart extracts more of its blood's oxygen than any other organ, about 70 % at rest (coronary sinus saturation ~30 %). It can therefore raise its O2 supply almost only by raising coronary flow. Its O2 use has two parts:
- a **basal** part, for ion pumps and housekeeping;
- a **work** part, proportional to the pressure–volume work of each beat (the P–V loop area) and divided by the contractile efficiency (~35 % of the extra O2 becomes external work).

The left ventricle is perfused mainly in diastole, when the muscle relaxes (see [Heart](./Heart.md) for the systolic compression). Coronary hypoxia makes the myocardium beat slower and weaker. Severe ischaemia ends in bradycardia and failure, a key step in neonatal collapse.

## Inheritance

```
BaseModelClass
  └── Mob
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `mob_active` | boolean | `true` | Switch. |
| `bm_vo2_per_g` | mmol O2/g/s | 3.7e-5 | Basal O2 use per gram of heart. |
| `hw_intercept`, `hw_slope` | g, g/g | 7.799, 0.004296 | Heart weight = intercept + slope · body weight (g): 23 g at 3.5 kg, 10.8 g at 0.7 kg. |
| `mech_efficiency` | – | 0.35 | Incremental (contractile) efficiency: stroke work / O2 energy. With the basal part included, whole-heart efficiency is the textbook ~15–20 %. |
| `caloric_equiv_o2` | J/mL O2 | 20.1 | Energy per mL O2 (STPD). |
| `resp_q` | – | 0.8 | Myocardial respiratory quotient. |
| `to2_ref`, `to2_min` | mmol/L | 0.2, 0.0002 | Coronary O2 content below which hypoxia effects start, and where they reach their floor. |
| `hr_factor_min`, `hr_factor_max`, `hr_tc` | –, s | 0.01, 1, 5 | Heart-rate channel range and time constant. |
| `cont_factor_min`, `cont_factor_max`, `cont_tc` | –, s | 0.01, 1, 5 | Contractility channel. |
| `ans_factor_min`, `ans_factor_max`, `ans_tc` | –, s | 0.01, 1, 5 | Sympathetic-responsiveness channel. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `hw` | g | Heart weight. |
| `bm_vo2`, `sw_vo2`, `mob_vo2` | mmol/s | Basal, stroke-work and total myocardial O2 use. |
| `mvo2_step` | mmol | O2 demanded this step. |
| `stroke_work_lv`, `stroke_work_rv`, `stroke_work_total` | mmHg·L | P–V loop areas of the last beat. |
| `beat_interval` | s | Measured time between the last two beats. |
| `mob` | mmol/s | Instantaneous O2 balance: coronary O2 inflow (`AA_COR.flow · AA.to2`) minus use. |
| `o2_deficit` | mmol/s | Demand `COR` could not supply this step (0 at rest). |
| `hr_factor`, `cont_factor`, `ans_activity_factor` | – | Applied hypoxia effects (1 = none). |
| `hr_g`, `cont_g`, `ans_g` | – | Hypoxia gains (rebuilt every step). |

## Calculation

Each step (skipped if `AA`, `AA_COR`, `COR`, `Heart`, `LV` or `RV` is missing):

1. **Basal:** `bm_vo2 = bm_vo2_per_g · hw`.
2. **Stroke work.** Each step adds the trapezoidal P·dV of LV and RV, split into filling and ejection areas. At each new beat (rising edge of `Heart.cardiac_cycle_running`) the loop area of the finished beat is stored and the beat interval measured:
   ```
   O2 per beat = max(SW_lv + SW_rv, 0) · 0.133322 J/(mmHg·L) / (mech_efficiency · 20.1 J/mL) / 22.414
   sw_vo2      = O2 per beat / beat_interval
   ```
   Before the first beat after a build or load, `60 / Heart.heart_rate` stands in for the interval. A pause longer than the last interval stretches it, so an arrested heart stops paying for its last beat.
3. **Coronary pool.** The step's demand `mob_vo2 · dt` is taken from `COR` as far as it holds O2; CO2 is added at `resp_q` for the O2 used; the shortfall is `o2_deficit`.
4. **Hypoxia effects.** The activation is `min(COR.to2, to2_ref) − to2_ref` (≤ 0, floored at `to2_min − to2_ref`). It is smoothed per channel and mapped linearly so the factor is 1 at `to2_ref` and `*_min` at `to2_min`:
   - `Heart.hr_mob_factor` = `hr_factor` (heart-rate sum);
   - each chamber's `el_max_mob_factor` = `cont_factor` (LV, RV, LA and the right-atrial halves);
   - `Heart.ans_activity_factor` = `ans_activity_factor` (scales the sympathetic drive the Heart passes to the chambers).

## Factor system

None of its own; it writes the hypoxia channels above. `el_max_mob_factor` is one of HeartChamber's additive `el_max` layers.

## Inputs and outputs

- **Reads:** `COR` (`to2`, `tco2`, `vol`), `AA.to2`, `AA_COR.flow`, `LV`/`RV` (`vol`, `pres`), Heart (`cardiac_cycle_running`, `heart_rate`); `model.weight`.
- **Writes:** `COR.to2`, `COR.tco2`; `Heart.hr_mob_factor`, `Heart.ans_activity_factor`; the chambers' `el_max_mob_factor`.
- **Read by:** Heart and the chambers (the channels); `DataCollector` watchers and the probes.

## Assumptions and limitations

- **Behaviour at rest** (30 s averages, after the beat-interval fix):

  | Scenario | Heart weight | Basal + stroke work | Per 100 g | Coronary flow | `COR` / arterial to2 |
  |---|---|---|---|---|---|
  | term_neonate | 23.0 g | 1.15 + 1.39 mL/min | 11.0 mL/min | 40 mL/min (174 per 100 g) | 6.9 / 9.6 mmol/L |
  | preterm_25wk | 10.8 g | 0.54 + 0.20 | 6.8 | 9.0 (83 per 100 g) | 3.9 / 7.5 |
  | fetus_term | 23.0 g | 1.15 + 1.73 | 12.5 | 32.6 (141 per 100 g) | 1.9 / 5.7 |

- **The coronary flow is high for the heart's O2 use.** At term the heart extracts only ~30–35 % of its arterial O2, against ~70 % in vivo. Aburawi's neonatal LAD flow of 8.2 mL/min points to a total coronary flow of roughly 20–30 mL/min, not 40. Listed for the scenario re-validation (retune `AA_COR` per scenario and check the extraction).
- **The hypoxia effects start only at a very low `COR.to2`** (0.2 mmol/L, ~2 % saturation). At rest they are inactive, and they engage only in profound coronary hypoxia.
- **Contractility is depressed twice** under hypoxia: `cont_factor` lowers `el_max`, and `ans_activity_factor` lowers the sympathetic inotropy. Their combined strength is set by `cont_factor_min` and `ans_factor_min`.
- **Heart weight follows body weight only** (no hypertrophy).

### History (v1.0)

- **The stroke-work cost was spread over the contraction** (`Heart.cardiac_cycle_time`) instead of the beat, overstating it by RR / contraction time (×1.41 at term). The O2 the heart no longer uses moved to `Metabolism.vo2` in every scenario, so whole-body VO2 and the gases are unchanged (`scripts/_fix_mob_beat_interval.mjs`).
- **An O2 shortfall used to skip the whole step's uptake**, so the heart consumed nothing in ischaemia.

## Example definition (JSON)

From `term_neonate.json`, `models.Mob` (trimmed to the config props; `components` holds `COR`, `AA_COR`, `COR_RAIVCI`, `COR_RASVC`):

```json
{
  "name": "Mob",
  "model_type": "Mob",
  "is_enabled": true,
  "mob_active": true,
  "bm_vo2_per_g": 3.7e-5,
  "hw_intercept": 7.799,
  "hw_slope": 0.004296,
  "mech_efficiency": 0.35,
  "caloric_equiv_o2": 20.1,
  "resp_q": 0.8,
  "to2_ref": 0.2,
  "to2_min": 0.0002,
  "hr_factor_min": 0.01, "hr_factor_max": 1, "hr_tc": 5,
  "cont_factor_min": 0.01, "cont_factor_max": 1, "cont_tc": 5,
  "ans_factor_min": 0.01, "ans_factor_max": 1, "ans_tc": 5
}
```

## Usage in the scenarios

One instance in every scenario, with the defaults above, owning the coronary bed (`AA` → `AA_COR` → `COR` → right atrium).

## References

- Aburawi EH, Malcus P, Thuring A, Fellman V, Pesonen E. Coronary flow in neonates with impaired intrauterine growth. *J Am Soc Echocardiogr* 2012;25(3):313–8. doi:10.1016/j.echo.2011.11.019 (healthy controls: LAD flow 8.2 ± 3.0 mL/min at 1 week).
