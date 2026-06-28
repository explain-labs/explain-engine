# Brain (cerebral autoregulation + ICP)

The `Brain` model is the **neonatal cerebral haemodynamics controller** — it couples cerebral
blood-flow **autoregulation** with **intracranial pressure (ICP)** through the cerebral perfusion
pressure `CPP = MAP − ICP`. Like [`Kidneys`](./Kidneys.md) and [`Hormones`](./Hormones.md) it is a
**controller/process model**: it holds no blood, resolves references to other models lazily, runs on
an update interval, and **owns its effector channels while enabled** (releasing them once on
disable). Default config is **neutral** — the baseline CPP/CBF setpoint and the baseline cerebral
blood volume are **auto-seeded** after a warm-up, so a scenario that ships a `Brain` model behaves
identically at rest and only diverges when blood pressure changes, autoregulation is impaired, or
intracranial volume rises.

## The cerebral bed (pre-wired in the scenarios)

```
AA ──AA_BR_ART──► BR_ART ──► BR_CAP ──► BR_VEN ──BR_VEN_VUB──► VUB
     (arteriole         (autoregulated bed: summed for CBV)      (venous outflow;
      effector)          BR_CAP = dominant O2 sink (fvo2~0.45)    ICP raises its R)
```

`CBF = AA_BR_ART.flow`. `BR_CAP` is the dominant neonatal O2 sink ([`Metabolism`](./Metabolism.md)
`fvo2 ≈ 0.45`), so a fall in CBF shows up as `BR_CAP.to2` collapsing — the HIE / ischaemia signature
(`brain_to2` read-out).

## Autoregulation = closed-loop control of CBF

Autoregulation is modelled as **closed-loop control on FLOW**, not open-loop pressure→resistance
scaling — because the cerebral bed is several resistors in series and `AA_BR_ART` is only ~44 % of
the total path resistance, so a fixed pressure-driven scaling of one resistor would not hold CBF. A
**leaky integrator** adjusts the arteriole resistor's `AA_BR_ART.r_factor_ps` to hold CBF at its
seeded setpoint (`u` = update interval, `err` = fractional CBF error):

```
err  = (cbf_smooth − cbf_setpoint) / cbf_setpoint
d    = autoreg_control_gain·err − autoreg_leak·(_ar_int − 1)     # leaky integral
_ar_int = clamp(_ar_int + d·u, autoreg_factor_min, autoreg_factor_max)
applied = clamp(1 + autoregulation_gain·(_ar_int − 1), …)        # blend toward pressure-passive
autoreg_factor ← lag(autoreg_factor → applied, autoreg_tc)       # anti-oscillation lag
AA_BR_ART.r_factor_ps = autoreg_factor
```

Too much flow (`err > 0`) → constrict. The **leak** (`autoreg_leak`) relaxes the integrator toward
neutral (`1.0`), so at the baseline (`err ≈ 0`) the factor returns to `1.0` — **no windup**, the
baseline stays collision-free/neutral. Under a sustained insult the error term dominates and the
correction is held (`control_gain / leak ≈ 5 / 0.05 = 100` → strong autoregulation with a small
droop). `autoregulation_gain ∈ [0, 1]` blends between **intact (1)** and **pressure-passive (0)**:
the immature / sick neonatal brain is pressure-passive (set the gain `< 1` or `0` for HIE / extreme
preterm — the IVH/HIE substrate, where CBF follows pressure: surge → haemorrhage, drop → ischaemia).

> **Why `AA_BR_ART` is the effector.** It is a free-standing `Resistor` that is **not** in
> [`Circulation`](./Circulation.md)'s ANS/SVR fan-out, so writing its `r_factor_ps` composes
> cleanly with systemic tone (the brain's ANS/SVR tone lives on `BR_ART` and is left alone) — same
> no-collision precedent as the Kidneys afferent and the Hormones efferent.

The sensed MAP (`AA.pres`) and CBF are both **smoothed** first-order (`pres_tc`/`cbf_tc ≈ 3 s`),
because the instantaneous resistor pressures/flows are pulsatile — so `CPP` tracks the **mean**
arterial pressure, not the instantaneous value. CBF is converted L/s → L/min (`×60`).

## ICP (Monro–Kellie, exponential compliance)

Cerebral blood volume `CBV = BR_ART + BR_CAP + BR_VEN` volume (L → mL). The volume excess above
baseline drives an exponential pressure-volume curve:

```
ΔV         = (CBV − CBV0) + edema_volume                  # mL  (CBV0 auto-seeded)
icp_excess = clamp(icp_e0·(exp(icp_k·ΔV) − 1), 0, icp_excess_max)   # mmHg (floored at 0)
ICP        = icp_baseline + icp_excess
CPP        = sensed_map − ICP
```

`edema_volume` is the settable oedema / mass / haemorrhage lever (mL), set via `set_edema(volume_ml)`.
The neonatal cranium is **compliant** (open fontanelle / sutures) → a gentler curve than the adult,
carried by `icp_k`.

> **ICP is applied as a RESISTANCE on the OUTFLOW, not as `pres_ext`.** External pressure on a series
> of compartments does not change their steady-state through-flow, so ICP instead raises the cerebral
> venous **outflow** resistor: `BR_VEN_VUB.r_factor_ps = clamp(1 + icp_outflow_gain·icp_excess, 1,
> icp_outflow_factor_max)`. This models **venous compression / the vascular waterfall** — rising ICP
> congests the venous outflow → CBF falls (and the closed-loop autoregulation then defends CBF by
> dilating the inflow, until the reserve is exhausted). The ICP → outflow-R → venous-congestion →
> CBV → ICP loop is **positive feedback**, so `icp_outflow_gain` is kept low (loop gain < 1).

## Clinical demonstrations it enables

- **Autoregulation intact vs pressure-passive on hypotension** — with `autoregulation_gain = 1`
  CBF is protected as MAP falls; with the gain low/0 CBF collapses with pressure → IVH/HIE.
- **Raised ICP / HIE** — `set_edema(…)` (oedema/mass) + lost autoregulation → CPP falls, CBF falls,
  `brain_to2` collapses → cerebral ischaemia.
- **Emergent coupling** — autoregulatory **vasodilation raises ICP** (it increases arterial CBV),
  and rising ICP feeds back onto CBF through the outflow resistance.

## Read-outs
| Read-out | Unit | Meaning |
|---|---|---|
| `cbf` | L/min | cerebral blood flow (smoothed `AA_BR_ART.flow`) |
| `cpp` | mmHg | cerebral perfusion pressure (`sensed_map − icp`) |
| `icp` | mmHg | intracranial pressure (`icp_baseline + icp_excess`) |
| `icp_excess` | mmHg | ICP above baseline (drives the outflow-R) |
| `cerebral_blood_volume` | mL | CBV (`BR_ART+BR_CAP+BR_VEN`) |
| `brain_to2` | mmol/L | `BR_CAP.to2` — ischaemia read-out |
| `autoreg_factor` | — | applied `AA_BR_ART.r_factor_ps` |
| `sensed_map` | mmHg | smoothed mean arterial pressure |

## Configuration
| Param | Default | Meaning |
|---|---|---|
| `brain_running` | `true` | master gate (false → owned channels released to neutral) |
| `autoregulation_enabled` | `true` | cerebral autoregulation on/off |
| `icp_enabled` | `true` | intracranial-pressure coupling on/off |
| `autoregulation_gain` | `1.0` | 1 = intact, 0 = pressure-passive (blend) |
| `autoreg_control_gain` | `5.0` | CBF-error feedback gain (per fractional error per second) |
| `autoreg_leak` | `0.05` | 1/s — integrator leak toward neutral (no windup) |
| `autoreg_factor_min` / `max` | `0.15` / `6.0` | max vasodilation / vasoconstriction limits |
| `autoreg_tc` | `4.0` s | lag on the applied factor (anti-oscillation) |
| `cbf_tc` / `pres_tc` | `3.0` / `3.0` s | smoothing of pulsatile CBF / arterial pressure |
| `cbf_setpoint` / `cpp_setpoint` | auto-seeded | baseline CBF (L/min) / CPP (mmHg) targets |
| `icp_baseline` | `5.0` mmHg | normal neonatal ICP (read-out anchor) |
| `edema_volume` | `0.0` mL | oedema / mass / haemorrhage lever (`set_edema()`) |
| `icp_e0` | `4.0` mmHg | scale of the exponential P-V curve |
| `icp_k` | `0.18` 1/mL | intracranial stiffness (neonatal-compliant) |
| `icp_excess_max` | `70.0` mmHg | clamp on the ICP excess |
| `icp_outflow_gain` | `0.03` | fractional outflow-R rise per mmHg of ICP excess |
| `icp_outflow_factor_max` | `8.0` | clamp on the outflow-resistance factor |

Wiring refs (`map_model` `AA`, `arteriole_resistor`/`cbf_resistor` `AA_BR_ART`,
`cerebral_compartments` `[BR_ART, BR_CAP, BR_VEN]`, `outflow_resistor` `BR_VEN_VUB`, `oxy_model`
`BR_CAP`) are resolved lazily on the first step. The controller runs on a 15 ms tick
(`_update_interval`); the baseline CPP / CBF setpoint and `CBV0` are seeded once after a
`_warmup_delay` (30 s) so they reflect the settled circuit, not the startup transient. Disabling
(`brain_running = false`) writes `AA_BR_ART.r_factor_ps` and `BR_VEN_VUB.r_factor_ps` back to `1.0`
once, restoring neutral cerebral haemodynamics.

## Related models
[`Kidneys`](./Kidneys.md) (the autoregulation pattern Brain mirrors) ·
[`Metabolism`](./Metabolism.md) (cerebral O2 consumption at `BR_CAP`) ·
[`Circulation`](./Circulation.md) (systemic SVR / `AA` perfusion pressure) ·
[`Monitor`](./Monitor.md) (read-out surfacing) · [`Hormones`](./Hormones.md) (sibling controller).
