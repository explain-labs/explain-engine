# Brain

`Brain` models neonatal cerebral haemodynamics: **autoregulation** of cerebral blood flow (CBF) and **intracranial pressure** (ICP), linked through the cerebral perfusion pressure CPP = MAP − ICP. Like [Kidneys](./Kidneys.md)' renal autoregulation, it is a controller: it holds no blood, acts on the cerebral bed's resistors, and is neutral at the scenario's baseline. It diverges only when blood pressure changes, autoregulation is impaired, or intracranial volume rises.

## Physiology

The brain keeps its blood flow nearly constant over a range of perfusion pressures by constricting or dilating its arterioles (myogenic autoregulation). In the sick or very preterm newborn that range is narrow and easily lost. The circulation then becomes **pressure-passive**: CBF follows blood pressure, so a surge can cause intraventricular haemorrhage and a fall can cause ischaemia.

The skull holds brain, blood and CSF (Monro–Kellie). Added volume (oedema, haemorrhage, a mass) raises ICP along an exponential pressure–volume curve. It is gentler in the newborn, whose fontanelle and sutures are open. Rising ICP compresses the bridging veins and lowers CPP; autoregulation dilates to compensate until its reserve is gone, then CBF falls.

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
| `outflow_resistor` | `"BR_VEN_VUB"` | Cerebral venous outflow (ICP compresses it). |
| `oxy_model` | `"BR_CAP"` | Brain oxygenation read-out. |

### Config: autoregulation

| Property | Unit | Default | Description |
|---|---|---|---|
| `autoregulation_gain` | 0–1 | 1.0 | 1 = intact, 0 = pressure-passive (blend). |
| `autoreg_control_gain` | 1/s | 5.0 | Integral gain on the fractional CBF error. |
| `autoreg_leak` | 1/s | 0.05 | Pull of the integrator back to 1, so the baseline stays neutral (gain/leak ≈ 100: strong regulation, small droop). |
| `cbf_setpoint` | L/min | 0 | Target CBF; ≤ 0 = captured 30 s after build. Stored in every scenario (term 0.106). |
| `cpp_setpoint` | mmHg | 0 | Baseline CPP (read-out); captured likewise. |
| `autoreg_tc` | s | 4.0 | Lag on the applied factor. |
| `autoreg_factor_min`, `autoreg_factor_max` | – | 0.15, 6.0 | Maximal dilation and constriction (the autoregulation limits). |
| `cbf_tc`, `pres_tc` | s | 3.0, 3.0 | Smoothing of CBF and MAP (averages out the pulse). |

### Config: ICP

| Property | Unit | Default | Description |
|---|---|---|---|
| `cbv0` | mL | 0 | Baseline cerebral blood volume; ≤ 0 = captured 30 s after build. Stored in every scenario. |
| `icp_baseline` | mmHg | 5 | Normal ICP (read-out anchor). |
| `edema_volume` | mL | 0 | Added intracranial volume: oedema, haemorrhage, mass (`set_edema`). |
| `icp_e0`, `icp_k` | mmHg, 1/mL | 4.0, 0.18 | Exponential pressure–volume curve (compliant neonatal cranium). |
| `icp_excess_max` | mmHg | 70 | Clamp on the excess ICP. |
| `icp_outflow_gain`, `icp_outflow_factor_max` | 1/mmHg, – | 0.03, 8 | Rise of the venous outflow resistance per mmHg of excess ICP, and its clamp. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `cbf` | L/min | Smoothed cerebral blood flow. |
| `sensed_map` | mmHg | Smoothed arterial pressure. |
| `cpp` | mmHg | MAP − ICP. |
| `icp`, `icp_excess` | mmHg | ICP and its excess above baseline. |
| `cerebral_blood_volume` | mL | CBV. |
| `autoreg_factor` | – | Applied factor on `AA_BR_ART.r_factor_ps` (saved; the integrator resumes from it on load). |
| `brain_to2` | mmol/L | `BR_CAP` O2 content (ischaemia read-out). |

## Calculation

Every 15 ms:

1. **Smooth** MAP and CBF (`AA_BR_ART.flow`); sum CBV.
2. **ICP:**
   ```
   dV = (CBV − cbv0) + edema_volume
   icp_excess = clamp(icp_e0 · (exp(icp_k · dV) − 1), 0, icp_excess_max)
   BR_VEN_VUB.r_factor_ps = clamp(1 + icp_outflow_gain · icp_excess, 1, icp_outflow_factor_max)
   ```
   CPP = MAP − ICP. ICP acts through the venous outflow resistance, not as an external pressure (external pressure on a series of compartments doesn't change their steady through-flow).
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

It owns `AA_BR_ART.r_factor_ps` (inflow) and `BR_VEN_VUB.r_factor_ps` (outflow). Neither is in Circulation's groups; the brain's ANS and SVR tone acts on the `BR_ART` vessel, so the channels compose.

## Inputs and outputs

- **Reads:** `AA.pres`, `AA_BR_ART.flow`, the cerebral volumes, `BR_CAP.to2`.
- **Writes:** the two channels above.
- **Written by:** the user (`set_edema`, `autoregulation_gain`, switches).
- **Read by:** `DataCollector` watchers and the Monitor (read-outs).

## Assumptions and limitations

- **Behaviour in term_neonate** (2 min after each change, 2026-10-24):

  | Change | MAP | ICP | CPP | CBF (mL/min) | Factor |
  |---|---|---|---|---|---|
  | `svr_factor_art` 0.5, intact | 52.6 | 5.1 | 47.5 | 103 → 105 | 1.24 |
  | same, pressure-passive | 52.8 | 5.3 | 47.5 | 103 → 114 | 1.00 |
  | oedema 5 mL | 59.0 | 11.2 | 47.8 | 103 → 108 | 0.96 |
  | oedema 10 mL, pressure-passive | 58.6 | 26.4 | 32.2 | 103 → 99 | 1.00 |

  - Autoregulation holds CBF against a systemic dilation that also dilates the brain's vessels.
  - **ICP couples weakly to CBF:** an ICP of 26 mmHg lowers CBF only 4 %. The venous outflow is a small part of the cerebral resistance, so the HIE picture (ICP up → CBF and `brain_to2` down) needs large volumes. This is listed for the re-validation.
- **Stored state predates v1.0 circulation changes** in several scenarios: the autoregulation factor settles away from its stored value in the first ~30 s after load (fetus_term 1.29 → 1.10). Listed for the re-validation re-bake.
- **One cerebral bed:** no regional flow, no CO2 reactivity (hypercapnia doesn't dilate the cerebral vessels), no venous haemorrhage model.

## Example definition (JSON)

From `term_neonate.json`, `models.Brain` (trimmed: wiring and gains are the defaults):

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
  "cbv0": 3.784,
  "edema_volume": 0,
  "icp_k": 0.18
}
```

## Usage in the scenarios

One instance in every scenario, running with intact autoregulation and the baseline stored. `cbf_setpoint` ranges from 0.0196 L/min (preterm_25wk) to 0.355 L/min (fetus_term).

## References

No literature values; the gains, limits and the pressure–volume curve are model choices for teaching.
