# Respiration

`Respiration` is a **coordinator**, not a physical compartment (the same pattern as
[Circulation](./Circulation.md)). It groups the models of the respiratory tract by name and applies
whole-system adjustments to their elastance, resistance and gas-exchange factors. It owns no volume,
pressure or flow of its own.

It is the *mechanical/structural* counterpart to [Breathing](./Breathing.md): `Breathing` generates
the breath effort, while `Respiration` sets the lung/thorax stiffness, airway resistance and
gas-exchange efficiency that the breath acts against.

## Inheritance

```
BaseModelClass
  └── Respiration   (group coordinator — no physics of its own)
```

Extends `BaseModelClass` directly; `calc_model()` iterates over named members and writes onto their
persistent factor layers rather than computing any physics itself.

## What it models

A single set of system-wide multipliers over the respiratory tree:

- **Lung / chest-wall stiffness** — `el_lungs_factor`, `el_thorax_factor`.
- **Airway resistance** — `res_upper_airways_factor`, `res_lower_airways_factor`.
- **Gas-exchange efficiency** — `gex_factor` (drives both O₂ and CO₂ diffusion).
- **Atelectasis** — `atelectasis_left`, `atelectasis_right`: the collapsed fraction of each lung (see
  [Atelectasis](#atelectasis)).

Each multiplier is translated into a **delta** on the corresponding `*_factor_ps` of the grouped
models, so it composes additively with other writers of that persistent layer.

## Properties

### Group lists (set in the model definition)

| List | Default members | Role |
|---|---|---|
| `upper_airways` | `["MOUTH_DS"]` | mouth → dead-space resistor |
| `lower_airways` (`_left`/`_right`) | `["DS_ALL", "DS_ALR"]` | dead-space → alveolar resistors |
| `dead_space` | `["DS"]` | conducting-airway gas compartment |
| `thorax` | `["THORAX"]` | chest-wall container |
| `lungs` (`left_lung`/`right_lung`) | `["ALL", "ALR"]` | alveolar gas compartments |
| `gas_echangers` (`_left`/`_right`) | `["GASEX_LL", "GASEX_RL"]` | blood↔gas exchangers |
| `pleural_space_left`/`_right` | `[]` | reserved (declared, not driven) |
| `intrapulmonary_shunt` | `["IPS"]` (scenarios override, e.g. `["IPSL","IPSR"]`) | reserved (declared, not driven) |

> Note: `gas_echangers` is a (consistent) misspelling of "exchangers" — both the property and the
> definition key use it, so it is left as-is. Some definitions also carry a correctly-spelled
> `gas_exchangers` field; the source reads only `gas_echangers`.

### Factor inputs (set in the model definition)

| Property | Default | Method | Drives |
|---|---|---|---|
| `el_lungs_factor` | `1.0` | `set_el_lung_factor` | `el_base_factor_ps` on the lungs |
| `el_thorax_factor` | `1.0` | `set_el_thorax_factor` | `el_base_factor_ps` on the thorax |
| `res_upper_airways_factor` | `1.0` | `set_upper_airway_resistance` | `r_factor_ps` on the upper airways |
| `res_lower_airways_factor` | `1.0` | `set_lower_airway_resistance` | `r_factor_ps` on the lower airways |
| `gex_factor` | `1.0` | `set_gasexchange` | `dif_o2_factor_ps` **and** `dif_co2_factor_ps` on the exchangers |

### Atelectasis inputs

| Property | Default | Method | Drives |
|---|---|---|---|
| `atelectasis_left` / `_right` | `0.0` | `set_atelectasis_left` / `_right` | collapsed fraction of that lung, clamped `0..atelectasis_max` |
| `atelectasis_max` | `0.9` | — | upper clamp (a fully collapsed lung has no aerated volume left to scale) |
| `atelectasis_hpv` | `0.3` | — | share of the collapsed units' perfusion that hypoxic pulmonary vasoconstriction removes from the lung |
| `atelectasis_recruitable` | `true` | — | pressure reopens and re-collapses the affected units; `false` = obstructive/resorption atelectasis |
| `atelectasis_open_pressure` / `_open_sd` | `25` / `3` cmH₂O | — | opening pressures of the collapsed units (normal distribution, on the distending pressure) |
| `atelectasis_close_pressure` / `_close_sd` | `8.5` / `1.5` cmH₂O | — | closing pressures of the affected units |
| `atelectasis_tau_open` / `_tau_close` | `3` / `30` s | — | recruitment and derecruitment time constants |
| `intrapulmonary_shunt_left` / `_right` | `["IPSL"]` / `["IPSR"]` | — | the lung's shunt resistors (art → ven) |
| `pulmonary_capillaries_left` / `_right` | `["LL_ART_LL_CAP", "LL_CAP_LL_VEN"]` / `["RL_…"]` | — | the lung's gas-exchanging path, in series |

### Series dead space (pushed to the `dead_space` compartments every update)

| Property | Default | Drives |
|---|---|---|
| `dead_space_segments` | `32` | `series_segments` on each dead-space compartment (1 = classic well-mixed) |
| `dead_space_dispersion` | `0.015` | `dispersion_coeff` (axial dispersion between the sub-tanks) |

Each update the loop also sets the dead space's `distal_models` to `lungs`, so gas leaves towards the
alveoli from the distal end of the chain. See
[GasCapacitance → Series dead space](./GasCapacitance.md#series-dead-space) for the model and its
calibration.

### Local (internal)

`_update_interval` (0.015 s) / `_update_counter` throttle the loop; `_prev_*` shadow each factor so a
change can be detected and applied as a delta.

## Calculation cycle (`calc_model`)

One throttled loop (every 0.015 s). It first pushes the series-dead-space configuration onto the
`dead_space` compartments (cheap, and keeps it live-editable). It then applies each factor **only when
it changed** (guarded by a `_prev_*` comparison). Each changed input calls its `set_*` method, then stores the new value into
`_prev_*`.

## The `set_*` methods — delta application

Every target is a **persistent** factor (`*_factor_ps`) that accumulates contributions from several
models, so `Respiration` applies the **delta** since its last call, not the absolute value:

```
delta = new_factor − prev_factor
for each model in the group:  factor_ps += delta   (clamped at 0)
this.<factor> := new_factor          (prev_factor stored by calc_model after the call)
```

The delta is computed **once** so every model in the group gets the same change, and each factor is
clamped at 0 (negative elastance/resistance/diffusion factors are non-physical). `set_gasexchange`
applies the delta to both the O₂ and CO₂ diffusion factors, clamping each independently.

## Factor system

`Respiration` does not itself carry the three-tier `_factor`/`_factor_ps`/`_factor_scaling_ps` pattern
(it has no base physics param). Instead it is one of the *writers* of the **persistent** `*_factor_ps`
tier on the grouped models: `el_base_factor_ps` (lungs/thorax), `r_factor_ps` (airways) and
`dif_o2/co2_factor_ps` (exchangers). It never touches the non-persistent (`_factor`) or scaling
(`_factor_scaling_ps`) tiers — those belong to transient interventions and `ModelScaler` respectively.

All factor inputs default to 1.0 (no effect). Disease scenarios raise lung/airway factors (e.g. RDS →
stiff lungs, bronchospasm → high lower-airway resistance) or lower `gex_factor` (impaired diffusion).

## Atelectasis

A shunt alone is not atelectasis. Lowering the intrapulmonary-shunt resistance reproduces the
hypoxaemia but leaves the lung fully aerated: FRC, compliance and Vt do not change, so neither the
ventilator readouts nor PEEP have anything to act on. A collapsed unit loses four things at once, and
each lung already has a channel for each:

| Collapsed fraction `c` | Channel | Layer |
|---|---|---|
| aerated volume ×(1 − c) | `ALL`/`ALR` `u_vol` | `u_vol_factor_ps` (delta) |
| elastance ×1/(1 − c) (fewer units in parallel) | `ALL`/`ALR` `el_base` | `el_base_factor_ps` (delta) |
| exchange surface ×(1 − c) | `GASEX_LL`/`GASEX_RL` `dif_o2`, `dif_co2` | `dif_*_factor_ps` (delta) |
| perfusion of the collapsed units → shunt | `IPSL`/`IPSR` and the capillary resistors | `r_factor` (every step) |

The gas side follows the other `set_*` methods: the change in the target multiplier since the last
call is added to the persistent layer, so a set-and-clear round trip restores the start values and it
composes with `el_lungs_factor`, `gex_factor` and Surfactant's non-persistent layer.

**Perfusion.** The capillary path and the intrapulmonary shunt both run from `xL_ART` to `xL_VEN`, so
they see the same pressure drop and split the lung's blood flow in the ratio of their conductances.
With `G_ips`, `G_cap` the conductances without the non-persistent layer and `s0 = G_ips / (G_ips + G_cap)`
the shunt share of the aerated lung:

```
G_tot' = (G_ips + G_cap) · (1 − c·hpv)                    hypoxic vasoconstriction diverts blood away
s'     = s0 + (1 − s0) · c·(1 − hpv) / (1 − c·hpv)        the rest of the collapsed units' blood is shunted
```

Each shunt resistor is scaled by `G_ips / (s'·G_tot')` and each capillary resistor by
`G_cap / ((1 − s')·G_tot')`, written on the non-persistent `r_factor` every step: `r_factor_ps` on
`IPSL`/`IPSR` belongs to [Surfactant](./Surfactant.md) and the scaling layer to the Calibrator and
`ModelScaler`, and the factors are computed against those layers so they compose. Because the split is
set from conductance ratios, the shunt share does not depend on the scenario's `Shunts.ips_res`
(preterm 1600–4200, term 5000). With `c = 0` nothing is written.

On `term_neonate`, right lung, room air (`scripts/probe_atelectasis.mjs`):

| c | SaO₂ | PaO₂ | lung Qs | Qs/Qt | ALR ml | CMV 20/5: Vte | C (ml/mbar) |
|---|---|---|---|---|---|---|---|
| 0 | 96.3 | 70 | 9 % | 9 % | 53 | 46.6 | 3.10 |
| 0.3 | 93.7 | 58 | 30 % | 19 % | 39 | 42.9 | 2.86 |
| 0.6 | 89.6 | 47 | 56 % | 32 % | 23 | 37.8 | 2.52 |
| 0.9 | 82.2 | 39 | 88 % | 47 % | 6 | 31.2 | 2.08 |

These are the static effects, measured with `atelectasis_recruitable = false`.

### Recruitment

Setting a lung's atelectasis (`set_atelectasis_left/right`, or the prop) defines both the collapsed
fraction `c` and the **unstable** region `u = c`: the units prone to collapse. Within it, `x = c / u`
is the share that is collapsed. Healthy lungs (`u = 0`) never derecruit, and setting 0 resolves the
atelectasis completely. Recruited units **stay unstable**: they keep their closing pressure, so only
PEEP keeps them open.

Each unit has an opening and a closing pressure, normally distributed (the Hickling picture of
recruitment). They are evaluated every update (15 ms) on the lung's instantaneous **distending
pressure** `p = ALx.pres_in` (alveolar recoil = airway − pleural) in cmH₂O:

```
can_stay_closed = 1 − Φ((p − TOP) / sd_open)      units whose opening pressure is above p
must_close      = 1 − Φ((p − TCP) / sd_close)     units whose closing pressure is above p
x > can_stay_closed:  x → can_stay_closed  with tau_open     (recruitment)
x < must_close:       x → must_close       with tau_close    (derecruitment)
otherwise:            hold                                    (hysteresis)
```

Because `p` is instantaneous, recruitment follows the time spent at pressure. A sustained inflation or
an HFOV sigh opens more than brief breaths at the same peak. Every change of `c` goes through the same
persistent-layer deltas as a user change, and the perfusion follows it every step.

**Calibration.** At end-expiration the pleural pressure in this model is about −4.5 cmH₂O, so the
distending pressure sits roughly 5 cmH₂O above the set PEEP. On `term_neonate`, the collapsed lung's
distending pressure in cmH₂O, min–max:

| | range |
|---|---|
| spontaneous | 4–8 |
| CMV 20/0 | 5–22 |
| CMV 20/2 | 7–22 |
| CMV 20/5 | 10–22 |
| CMV 28/8 | 12–27 |

The closing pressure is 8.5 cmH₂O (about PEEP 4 at the airway), with sd 1.5. So PEEP ≥ 8 holds
everything, PEEP 5 lets about a fifth of the unstable region re-collapse, and PEEP 2 or no support
re-collapses most of it.

The opening pressure is 25 cmH₂O (sd 3), the range of a neonatal sustained inflation. CMV 20/5
recruits only a little (its peak sits in the tail), while PIP 28 or a sigh of 27 mbar opens most of it.

Trace on `term_neonate`, right lung, set to 0.6 on SLE CMV 20/5 (`scripts/probe_atelectasis.mjs`):

| phase | c | SaO₂ | lung Qs | ALR ml |
|---|---|---|---|---|
| CMV 20/5, 2 min after setting 0.6 | 0.53 | 91.1 | 49 % | 32 |
| PIP 28 / PEEP 8, 1 min | 0.29 | 94.3 | 30 % | 52 |
| PIP 20 / PEEP 8, 2 min (holds) | 0.29 | 94.2 | 29 % | 50 |
| PEEP 5, 3 min (holds) | 0.29 | 94.7 | 29 % | 47 |
| PEEP 2, 3 min (re-collapses) | 0.49 | 92.2 | 45 % | 33 |
| HFOV MAP 12 + 5 sighs 27 mbar × 3 s | 0.19 | 94.7 | 22 % | 57 |
| Standby, spontaneous, 3 min | 0.55 | 90.6 | 50 % | 26 |

With `atelectasis_recruitable = false` (a mucus plug, resorption atelectasis) the collapse ignores
pressure. In the preterm scenarios [Surfactant](./Surfactant.md) keeps its own whole-lung
recruitment on the non-persistent layer. The two run independently and their effects add.

The thresholds are calibrated on the term lung. In `preterm_28wk`, recruitment with PIP 28 or sighs
works the same way, but PEEP 8 already lets some re-collapse. At PEEP ≤ 5, Surfactant derecruits the
whole lung as well, so a surfactant-deficient lung needs more PEEP, as at the bedside.

Because the factor layers add up, Surfactant's derecruitment and atelectasis together can take a
lung's effective unstressed volume or diffusion constant below zero. [Capacitance](./Capacitance.md)
floors `u_vol_eff` and [GasExchanger](./GasExchanger.md) the diffusion constants at 0. A negative
diffusion constant would pump gas against its gradient and blow up the blood gases.

### Bronchus obstruction and resorption

`airway_obstructed_left` / `_right` (setters `set_airway_obstructed_left/right`) close a main
bronchus (`DS_ALx.no_flow`). This is a mucus plug, or the left bronchus behind a tube in the right
main bronchus (set by [Ventilator](./Ventilator.md#airway-events)). No gas moves in or out, and the
trapped gas is absorbed into the blood, so the lung collapses (resorption atelectasis):

```
c → atelectasis_max    with tau = tau_air + (tau_o2 − tau_air) · (FO₂_trapped − 0.21) / 0.79
```

Oxygen absorbs fast and nitrogen slowly, so the time constant runs from `atelectasis_resorb_tau_air`
(1800 s, trapped room air) to `_tau_o2` (240 s, trapped oxygen). `FO₂_trapped` is the lung's `fo2`
captured at the moment of obstruction. The absorbed gas leaves the lung: each update holds the
trapped lung at its captured recoil pressure, so it deflates instead of pressurising as it stiffens.
The collapsed units join the unstable region. While obstructed, pressure recruitment of that lung
pauses. Once the bronchus is open again, pressure recruits it and PEEP keeps it open.

On term_neonate with a right-mainstem tube on CMV 20/5, the left lung's collapse after 10 minutes is
0.26 on air and 0.67 on oxygen. A right bronchial plug in a spontaneously breathing baby takes SaO₂
from 96 to 76 % in 5 minutes.

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Respiration",
  "description": "high level respiration model",
  "model_type": "Respiration",
  "is_enabled": true,
  "upper_airways": ["MOUTH_DS"],
  "lower_airways": ["DS_ALL", "DS_ALR"],
  "lower_airways_left": ["DS_ALL"],
  "lower_airways_right": ["DS_ALR"],
  "dead_space": ["DS"],
  "thorax": ["THORAX"],
  "lungs": ["ALL", "ALR"],
  "left_lung": ["ALL"],
  "right_lung": ["ALR"],
  "gas_echangers": ["GASEX_LL", "GASEX_RL"],
  "intrapulmonary_shunt": ["IPSL", "IPSR"],
  "el_lungs_factor": 1.0,
  "el_thorax_factor": 1.0,
  "res_upper_airways_factor": 1.0,
  "res_lower_airways_factor": 1.0,
  "gex_factor": 1.0
}
```

## Usage in the model

- Disease models (RDS / surfactant, CDH, bronchospasm) set `el_lungs_factor`,
  `res_lower_airways_factor` or `gex_factor` to impose stiff lungs, narrowed airways or impaired
  diffusion without touching the individual compartment definitions.
- Because the targets are the shared `*_factor_ps` layer, Respiration composes with whatever the
  surfactant/recruitment model or `ModelScaler` is doing to the same compartments.
- It is the structural partner of [Breathing](./Breathing.md) (effort generator) and the respiratory
  analogue of [Circulation](./Circulation.md) (vascular-tree coordinator).

## Notes & caveats

- **Factors are cumulative and shared.** `*_factor_ps` is written by several models; `Respiration`
  only adds its delta. A factor driven to the 0 clamp stops tracking further decreases until the
  target rises again — inherent to the per-model persistent-factor scheme.
- **Side- and space-specific lists.** The `left_lung`/`right_lung` and
  `gas_exchanger_left_lung`/`_right_lung` lists are used by atelectasis; `pleural_space_left/right`,
  `intrapulmonary_shunt` and the `_left`/`_right` airway lists are declared but not used by any method.
- **Group membership is name-based** — a model is only affected if its name is in the relevant list.
