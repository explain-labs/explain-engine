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
| `icp_enabled` | `true` | ICP coupling on/off. |
| `map_model` | `"AA"` | Arterial pressure source. |
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
4. **Autoregulation** (leaky integral control on flow):
   ```
   err = (CBF − cbf_setpoint) / cbf_setpoint
   int += (autoreg_control_gain · err − autoreg_leak · (int − 1)) · Δt         clamped to the limits
   applied = 1 + autoregulation_gain · (int − 1)
   autoreg_factor → applied   (lag autoreg_tc),   AA_BR_ART.r_factor_ps = autoreg_factor
   ```
   Within the limits CBF stays near its set-point; at a limit the bed becomes pressure-passive.

## Factor system

It owns `AA_BR_ART.r_factor_ps` (inflow), and writes the non-persistent `BR_VEN_VUB.p2_ext` and the cerebral compartments' `pres_ext` (added to, so other writers compose). The inflow channel is not in Circulation's groups; the brain's ANS and SVR tone acts on the `BR_ART` vessel, so the channels compose.

## Inputs and outputs

- **Reads:** `AA.pres`, `AA_BR_ART.flow`, the cerebral volumes, `BR_CAP.to2`.
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
- **One cerebral bed:** no regional flow, no CO2 reactivity (hypercapnia doesn't dilate the cerebral vessels), no venous haemorrhage model.

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

No literature values; the gains, limits and the pressure–volume curve are model choices for teaching.
