# Brain

`Brain` models neonatal cerebral haemodynamics: **autoregulation** of cerebral blood flow (CBF) and **intracranial pressure** (ICP), linked through the cerebral perfusion pressure CPP = MAP − ICP. Like [Kidneys](./Kidneys.md)' renal autoregulation, it is a controller: it holds no blood, acts on the cerebral bed's resistors, and is neutral at the scenario's baseline. It diverges only when blood pressure changes, autoregulation is impaired, or intracranial volume rises.

## Physiology

The brain keeps its blood flow nearly constant over a range of perfusion pressures by constricting or dilating its arterioles (myogenic autoregulation). In the sick or very preterm newborn that range is narrow and easily lost. The circulation then becomes **pressure-passive**: CBF follows blood pressure, so a surge can cause intraventricular haemorrhage and a fall can cause ischaemia.

The skull holds brain, blood and CSF (Monro–Kellie). Added volume (oedema, haemorrhage, a mass) raises ICP along an exponential pressure–volume curve. It is gentler in the newborn, whose fontanelle and sutures are open. Rising ICP squeezes cerebral blood out and lowers CPP: the cerebral veins cannot drain below ICP, so the driving pressure is MAP − ICP; autoregulation dilates to compensate until its reserve is gone, then CBF falls.

## Inheritance

```
BaseModelClass
  └── Brain
```

## Properties

### Config: gating and wiring

| Property | Default | Description |
|---|---|---|
| `brain_running` | `true` | Master switch. Off releases the owned channels to 1 once, then idles. |
| `autoregulation_enabled` | `true` | Autoregulation on/off (off relaxes the factor to 1: pressure-passive). |
| `co2_enabled` | `true` | CO2 reactivity on/off (below). |
| `o2_enabled` | `true` | O2 reactivity on/off (below). |
| `icp_enabled` | `true` | ICP coupling on/off. |
| `map_model` | `"AA"` | Arterial pressure source. |
| `co2_model` | `"AA"` | Arterial compartment whose pCO2 is sensed. |
| `o2_model` | `"AA"` | Arterial compartment whose O2 content is sensed. |
| `arteriole_resistor`, `cbf_resistor` | `"AA_BR_ART"` | Autoregulation effector, and the resistor whose flow is CBF. |
| `cerebral_compartments` | `["BR_ART", "BR_CAP", "BR_VEN"]` | Summed for the cerebral blood volume. |
| `outflow_resistor` | `"BR_VEN_VUB"` | Cerebral venous outflow; the ICP excess is added to its outlet pressure (vascular waterfall). |
| `oxy_model` | `"BR_CAP"` | Brain oxygenation read-out. |

### Config: autoregulation

| Property | Unit | Default | Description |
|---|---|---|---|
| `autoregulation_gain` | 0–1 | 1.0 | 1 = intact, 0 = pressure-passive (blend). |
| `autoreg_control_gain` | 1/s | 5.0 | Integral gain on the fractional CBF error. |
| `autoreg_leak` | 1/s | 0.05 | Pull of the integrator back to 1, so the baseline stays neutral (gain/leak ≈ 100: strong regulation, small droop). |
| `cbf_setpoint` | L/min | 0 | Target CBF; ≤ 0 = captured 30 s after build. Stored in every scenario (term 0.106). |
| `cpp_setpoint` | mmHg | 0 | Baseline CPP (read-out); captured likewise. |
| `autoreg_tc` | s | 1.0 | Lag on the applied factor. |
| `autoreg_factor_min`, `autoreg_factor_max` | – | 0.15, 6.0 | Maximal dilation and constriction (the autoregulation limits). |
| `cbf_tc`, `pres_tc` | s | 1.0, 3.0 | Smoothing of CBF and MAP (averages out the pulse). |

### Config: CO2 reactivity

| Property | Unit | Default | Description |
|---|---|---|---|
| `co2_ref` | mmHg | 0 | pCO2 at which the factor is 1; ≤ 0 = captured 30 s after build. Stored in every scenario at its own resting PaCO2. |
| `co2_gain` | 1/mmHg | 0.04 | Fractional change of the CBF target per mmHg (see Assumptions). |
| `co2_factor_min`, `co2_factor_max` | – | 0.5, 2.0 | Clamps on the factor. |
| `co2_tc` | s | 30 | Time constant of the response. |

### Config: O2 reactivity

| Property | Unit | Default | Description |
|---|---|---|---|
| `o2_ref` | mmol/L | 0 | Arterial O2 content at which the factor is 1; ≤ 0 = captured 30 s after build. Stored in every scenario at its own resting content. |
| `o2_factor_min`, `o2_factor_max` | – | 0.8, 2.0 | Clamps on the factor. |
| `o2_tc` | s | 30 | Time constant of the response. |

### Config: ICP

| Property | Unit | Default | Description |
|---|---|---|---|
| `cbv0` | mL | 0 | Baseline cerebral blood volume; ≤ 0 = captured 30 s after build. Stored in every scenario. |
| `icp_baseline` | mmHg | 5 | Normal ICP (read-out anchor). |
| `edema_volume` | mL | 0 | Added intracranial volume: oedema, haemorrhage, mass (`set_edema`). |
| `icp_e0`, `icp_k` | mmHg, 1/mL | 4.0, 0.18 | Exponential pressure–volume curve (compliant neonatal cranium). |
| `icp_excess_max` | mmHg | 70 | Clamp on the excess ICP. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `cbf` | L/min | Smoothed cerebral blood flow. |
| `sensed_map` | mmHg | Smoothed arterial pressure. |
| `cpp` | mmHg | MAP − ICP. |
| `icp`, `icp_excess` | mmHg | ICP and its excess above baseline. |
| `cerebral_blood_volume` | mL | CBV. |
| `co2_factor` | – | Applied factor on the CBF target (saved; 1 = neutral). |
| `o2_factor` | – | Applied factor on the CBF target (saved; 1 = neutral). |
| `autoreg_factor` | – | Applied factor on `AA_BR_ART.r_factor_ps` (saved; the integrator resumes from it on load, the smoothers from `cbf` and `sensed_map`). |
| `brain_to2` | mmol/L | `BR_CAP` O2 content (ischaemia read-out). |

## Calculation

Every 15 ms:

1. **Smooth** MAP and CBF (`AA_BR_ART.flow`); sum CBV.
2. **ICP:**
   ```
   dV = (CBV − cbv0) + edema_volume
   icp_excess = clamp(icp_e0 · (exp(icp_k · dV) − 1), 0, icp_excess_max)
   ```
   CPP = MAP − ICP.
5. **ICP as a pressure** (every step, since both are reset after use):
   - `BR_VEN_VUB.p2_ext += icp_excess`: the outflow pressure rises with ICP (vascular waterfall: the bridging veins cannot drain below ICP), so the driving pressure falls with CPP and perfusion stops as ICP reaches MAP;
   - `pres_ext += icp_excess` on `BR_ART`, `BR_CAP`, `BR_VEN`: their volume follows the transmural pressure, so raised ICP squeezes cerebral blood out (the Monro–Kellie buffer).

   Only the excess above `icp_baseline` is applied, so the calibrated resting bed is unchanged (`cbv0` is the resting cerebral blood volume).
3. **Baseline:** if not stored, CBF, CPP and CBV are captured 30 s after build.
4. **CO2 reactivity** (`co2_factor` relaxes over `co2_tc` towards the clamped target):
   ```
   1 + co2_gain · (pCO2 − co2_ref)
   ```
5. **O2 reactivity** (`o2_factor` relaxes over `o2_tc` towards the clamped target; no arterial O2 at all gives the upper clamp):
   ```
   o2_ref / to2
   ```
6. **Autoregulation** (leaky integral control on flow):
   ```
   target = cbf_setpoint · co2_factor · o2_factor
   err = (CBF − target) / target
   int += (autoreg_control_gain · err − autoreg_leak · (int − 1)) · Δt         clamped to the limits
   applied = 1 + autoregulation_gain · (int − 1)
   autoreg_factor → applied   (lag autoreg_tc),   AA_BR_ART.r_factor_ps = autoreg_factor
   ```
   Within the limits CBF stays near its set-point; at a limit the bed becomes pressure-passive.

## Factor system

It owns `AA_BR_ART.r_factor_ps` (inflow), and writes the non-persistent `BR_VEN_VUB.p2_ext` and the cerebral compartments' `pres_ext` (added to, so other writers compose). The inflow channel is not in Circulation's groups; the brain's ANS and SVR tone acts on the `BR_ART` vessel, so the channels compose.

## Inputs and outputs

- **Reads:** `AA.pres`, `AA.pco2`, `AA.to2`, `AA_BR_ART.flow`, the cerebral volumes, `BR_CAP.to2`.
- **Writes:** the channels above.
- **Written by:** the user (`set_edema`, `autoregulation_gain`, switches).
- **Read by:** `DataCollector` watchers and the Monitor (read-outs).

## Assumptions and limitations

- **Behaviour in term_neonate_72h** (re-validation (f), 2 min after each oedema step; CBF in mL/min):

  | Oedema (mL) | ICP | CPP | CBF intact (factor) | CBF pressure-passive | `brain_to2` intact / passive |
  |---|---|---|---|---|---|
  | 0 | 5.0 | 55.7 | 105 (1.00) | 105 | 6.6 / 6.6 |
  | 5 | 10.5 | 50 | 105 (0.80) | 96 | 6.6 / 6.3 |
  | 10 | 24 | 37–39 | 104 (0.31) | 74 | 6.6 / 5.4 |
  | 12 | 32–35 | 27–30 | 91 (0.15, dilation limit) | 59 | 6.2 / 4.1 |
  | 14 | 45 | 18 | 58 | 39 | 3.8 / 1.6 |
  | 16 | 60–61 | 2–4 | 16 | 11 | 0.2 / 0.0 |

  - **Pressure-passive** CBF falls in proportion to CPP and stops as ICP reaches MAP. **Intact** autoregulation holds CBF down to a CPP of ~35 mmHg; below ~30 its dilation reserve is exhausted (a lower limit of autoregulation near CPP 30 in the term newborn).
  - Until the re-validation ICP acted as a rise of the venous outflow resistance (`icp_outflow_gain` 0.03). That resistance is a small part of the cerebral bed, so CBF hardly fell: pressure-passive 92 mL/min with ICP above MAP, intact 104. Venous congestion also raised the cerebral blood volume, feeding ICP.
- **Neutral at rest.** The set-points dated from before the heart re-validation: term's natural cerebral flow had risen and the controller constricted 12 % at rest (factor 1.12). That was folded into `BR_ART` (`r_for`/`r_back` ×1.1228), so the factor is 1.00 at rest with CBF unchanged (106 mL/min), and `cbv0` was re-seeded to the resting cerebral blood volume (3.784 → 3.990 mL).
- **Dynamics.** After a step in arterial pressure CBF returns within ~5 s, without ringing (systemic resistance ×0.85: CBF +7 % at 2 s, +1 % at 5 s, then a steady +3 %, the leaky integrator's droop). With the former lags (`cbf_tc` 3 s, `autoreg_tc` 4 s) it rang with a ~22 s period for over a minute.
- **Resuming after a load.** The integrator restarts from the saved `autoreg_factor`, and the CBF and MAP smoothers from the saved `cbf` and `sensed_map`. Starting the CBF smoother at `cbf_setpoint` (as before the re-validation) zeroed the small standing error that the leaky integrator holds its factor with, so the leak pulled the factor away for the first seconds after every load.
- **CO2 and O2 reactivity act through the controller,** so both are lost when autoregulation is off, and neither can push CBF past the dilation limit (`autoreg_factor_min`) or a falling pressure.
- **CO2 gain.** 0.04 per mmHg sits close to the 32.6 %/kPa (4.3 %/mmHg) of ventilated preterm infants on day 2; on day 1 they showed only 11–12 %/kPa (Pryds 1989). No term figure was found, so the value is an assumption for the term scenarios. The response is linear and symmetric, though preterm Doppler velocity did not change with mild or moderate hypocarbia (van Bel 1988).
- **O2 rule.** Constant delivery comes from isocapnic newborn lambs, whose CBF rose to hold O2 delivery as arterial content fell to 50–60 % of control, with cerebral O2 consumption unchanged (Koehler 1982, 1984), and whose CBF doubled at SaO2 47 % (Borel 1987). One lamb study found less: +44 % at SaO2 33–65 %, starting after about a 25 % fall in saturation (Lou 1985). Applying it to a human newborn is an assumption: no neonatal numbers for hypoxaemia were found, only the same direction with haematocrit (Younkin 1987). `o2_tc` is a model choice, and the rule also lowers CBF when content rises above rest (down to `o2_factor_min`).
- **Combining the two.** The factors multiply, because the lamb response to hypoxia did not depend on PaCO2 between 33 and 60 mmHg (Massik 1989). It sits here and not in Ans because removing the chemoreceptors does not change it (Miyabe 1989).
- **A cyanotic patient's own resting content counts as neutral.** The ToF scenarios store their own `o2_ref`, which assumes adaptation to the baseline.
- **Behaviour in term_neonate_72h, spontaneously breathing:**

  | Test | CBF, mL/kg/min (rest 29.9) | O2 delivery vs rest | Extraction (rest 0.31) |
  |---|---|---|---|
  | 2 % CO2, 10 min (PaCO2 42.4, O2 reactivity not yet added) | 33.4 | not measured | 0.27 |
  | 4 % CO2, 10 min (PaCO2 47.3) | 39.2 | +31 % | 0.24 |
  | Drive ×1.7, 10 min (PaCO2 31.9) | 21.0 | −29 % | 0.43 |
  | FiO2 0.15, 2 min | 26.8 | −14 % | 0.36 |
  | FiO2 0.15, 30 min (SaO2 91 %, PaCO2 36.9) | 28.6 | −10 % | 0.34 |
  | FiO2 0.12, 2 min | 25.6 | −23 % | 0.40 |
  | FiO2 0.12, 30 min (SaO2 82 %, PaCO2 34.0) | 27.9 | −21 % | 0.39 |
  | FiO2 0.10, 30 min (SaO2 58 %, PaCO2 33.3) | 37.6 | −25 % | 0.41 |
  | FiO2 1.0, 30 min (PaCO2 35.2) | 22.8 | −16 % | 0.37 |

  With both switched off the model matches the version before either was added.
- **In sustained hypoxia the two effects pull apart, so O2 delivery is not constant.** Since `Breathing.hvd_max` went to 0.5, hypoxia keeps PaCO2 low (33–37), which offsets the O2 rise: CBF stays below rest at FiO2 0.15 and 0.12, and rises only from about FiO2 0.10. The lamb data behind the O2 rule are isocapnic, and Massik's lower PaCO2 was 33, so the size of this offset at hypocapnia is an assumption of multiplying the factors.
- **Early dip in hypoxia.** Hypoxic hyperventilation lowers PaCO2 before O2 content has fallen far, so CBF first falls (about −14 % at 2 min, FiO2 0.15). No neonatal data confirm or refute this dip.
- **Severe hypoxia.** The raised target cannot be met once pressure falls (FiO2 0.07 at 30 min: MAP 44, CBF 25.7), and from about FiO2 0.09 the capillary O2 becomes very low with MAP still normal (0.94 mmol/L at 30 min, MAP 58).
- **One cerebral bed:** no regional flow, no venous haemorrhage model.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Brain` (trimmed: wiring and gains are the defaults):

```json
{
  "name": "Brain",
  "model_type": "Brain",
  "is_enabled": true,
  "brain_running": true,
  "autoregulation_enabled": true,
  "autoregulation_gain": 1,
  "icp_enabled": true,
  "cbf_setpoint": 0.1059,
  "cpp_setpoint": 53.83,
  "cbv0": 3.9899,
  "edema_volume": 0,
  "icp_k": 0.18
}
```

## Usage in the scenarios

One instance in every scenario, running with intact autoregulation and the baseline stored. `cbf_setpoint` is 0.106 L/min in term_neonate_72h.

## References

The autoregulation gains and limits and the pressure–volume curve are model choices for teaching. The CO2 and O2 reactivity rest on:

- Borel CO et al. 1987, cerebral blood flow autoregulation during intracranial hypertension in hypoxic lambs. [doi](https://doi.org/10.1152/ajpheart.1987.253.6.h1342)
- Koehler RC et al. 1982, cerebral circulatory response to carbon monoxide and hypoxic hypoxia in the lamb. [doi](https://doi.org/10.1152/ajpheart.1982.243.1.h27)
- Koehler RC et al. 1984, cerebrovascular response to hypoxic and carbon monoxide hypoxia in newborn and adult sheep. [doi](https://doi.org/10.1038/jcbfm.1984.16)
- Lou HC et al. 1985, preferential blood flow increase to the brain stem in moderate neonatal hypoxia. [doi](https://doi.org/10.1007/bf00451945)
- Massik J et al. 1989, hypercapnia and response of cerebral blood flow to hypoxia in newborn lambs. [doi](https://doi.org/10.1152/jappl.1989.66.3.1065)
- Miyabe M et al. 1989, chemodenervation does not alter cerebrovascular response to hypoxic hypoxia. [doi](https://doi.org/10.1152/ajpheart.1989.257.5.h1413)
- Pryds O et al. 1989, heterogeneity of cerebral vasoreactivity in preterm infants supported by mechanical ventilation. [doi](https://doi.org/10.1016/s0022-3476(89)80301-4)
- van Bel F et al. 1988, the influence of abnormal blood gases on cerebral blood flow velocity in the preterm newborn. [doi](https://doi.org/10.1055/s-2008-1052397)
- Younkin DP et al. 1987, the effect of hematocrit and systolic blood pressure on cerebral blood flow in newborn infants. [doi](https://doi.org/10.1038/jcbfm.1987.66)

Read as abstracts only.
