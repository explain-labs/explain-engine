# Respiration

`Respiration` coordinates the respiratory system; it holds no gas itself. It groups the airway, lung, thorax and gas-exchange models by name and gives them system-wide levers: lung and chest-wall stiffness, upper and lower airway resistance, and gas-exchange capacity. It configures the airway dead space as a series (plug-flow) dead space, and it owns **atelectasis**: collapse of part of a lung, its recruitment and derecruitment with pressure, and resorption collapse behind a blocked bronchus.

## Physiology

The respiratory system is the airways (upper: nose, larynx, trachea; lower: bronchi down to the alveolar ducts), the lungs, and the chest wall around them. Disease acts on a few properties at once:
- **compliance:** stiff lungs in RDS, a stiff or floppy chest wall;
- **resistance:** bronchospasm, secretions, a narrow tube;
- **exchange surface:** lost alveoli, oedema.

**Atelectasis** is collapse of alveoli. A collapsed region loses its gas volume, its share of the lung's compliance and its exchange surface, but its blood keeps flowing past without picking up oxygen: an intrapulmonary shunt, partly limited by hypoxic pulmonary vasoconstriction. Collapsed units reopen above an *opening pressure* (a recruitment manoeuvre, a sustained inflation) and close again below a lower *closing pressure*. That hysteresis is why PEEP keeps a recruited lung open. Behind a blocked bronchus (mucus plug, a tube in the other main bronchus) the trapped gas is absorbed into the blood and the lung collapses: fast if the gas was oxygen, slowly if it was air, because nitrogen dissolves poorly.

## Inheritance

```
BaseModelClass
  └── Respiration
```

## Properties

### Config: groups (names of models)

| Property | Scenario value | Used by |
|---|---|---|
| `upper_airways` | `["MOUTH_DS"]` | `res_upper_airways_factor` |
| `lower_airways` | `["DS_ALL", "DS_ALR"]` | `res_lower_airways_factor` |
| `lower_airways_left`, `lower_airways_right` | `["DS_ALL"]`, `["DS_ALR"]` | bronchus obstruction |
| `dead_space` | `["DS"]` | series dead space |
| `thorax` | `["THORAX"]` | `el_thorax_factor` |
| `lungs`, `left_lung`, `right_lung` | `["ALL", "ALR"]`, `["ALL"]`, `["ALR"]` | `el_lungs_factor`; atelectasis; the dead space's distal end |
| `gas_exchangers`, `gas_exchanger_left_lung`, `gas_exchanger_right_lung` | `GASEX_LL`, `GASEX_RL` | `gex_factor`; atelectasis |
| `intrapulmonary_shunt_left`, `intrapulmonary_shunt_right` | `["IPSL"]`, `["IPSR"]` | atelectasis perfusion |
| `pulmonary_capillaries_left`, `pulmonary_capillaries_right` | `xL_ART_xL_CAP`, `xL_CAP_xL_VEN` | atelectasis perfusion |

Older scenario files spell `gas_exchangers` as `gas_echangers`; `init_model` accepts it.

### Config: system levers

Multipliers around 1; a change is added as a delta to the members' persistent layer (see [Calculation](#calculation)).

| Property | Default | Acts on |
|---|---|---|
| `el_lungs_factor` | 1.0 | lungs' `el_base_factor_ps` |
| `el_thorax_factor` | 1.0 | thorax's `el_base_factor_ps` |
| `res_upper_airways_factor` | 1.0 | upper airways' `r_factor_ps` |
| `res_lower_airways_factor` | 1.0 | lower airways' `r_factor_ps` |
| `gex_factor` | 1.0 | gas exchangers' `dif_o2_factor_ps` and `dif_co2_factor_ps` |

### Config: series dead space

| Property | Unit | Default | Description |
|---|---|---|---|
| `dead_space_segments` | – | 32 | Composition sub-tanks of the dead space (1 = well mixed). |
| `dead_space_dispersion` | – | 0.015 | Axial dispersion coefficient. |
| `dead_space_diffusion` | L/s per interface | 0 | Molecular diffusion along the dead space; scenarios 1e-5. |

Written onto every `dead_space` compartment each update, with `distal_models = lungs` (see [GasCapacitance → Series dead space](./GasCapacitance.md#series-dead-space)).

### Config: atelectasis

| Property | Unit | Default | Description |
|---|---|---|---|
| `atelectasis_left`, `atelectasis_right` | fraction | 0 | Collapsed fraction of each lung (clamped to `atelectasis_max`). Setting it also defines the unstable region. |
| `atelectasis_max` | fraction | 0.9 | Upper limit. |
| `atelectasis_hpv` | fraction | 0.3 | Share of the collapsed units' blood that hypoxic vasoconstriction diverts away from the lung. |
| `atelectasis_recruitable` | boolean | true | Pressure can reopen collapsed units. Off = obstructive/resorption atelectasis. |
| `atelectasis_open_pressure`, `atelectasis_open_sd` | cmH2O | 25, 3 | Opening pressures (normal distribution). |
| `atelectasis_close_pressure`, `atelectasis_close_sd` | cmH2O | 8.5, 1.5 | Closing pressures. |
| `atelectasis_tau_open`, `atelectasis_tau_close` | s | 3, 30 | Recruitment and derecruitment time constants. |
| `airway_obstructed_left`, `airway_obstructed_right` | boolean | false | A plug in the main bronchus. |
| `atelectasis_resorb_tau_air`, `atelectasis_resorb_tau_o2` | s | 1800, 240 | Resorption time constant with trapped air and trapped oxygen. |

## Calculation

**Every step:** while a lung has atelectasis, its perfusion split is rewritten on the non-persistent `r_factor` of its shunt and capillary resistors (see [Atelectasis](#atelectasis)).

**Every 15 ms:**
1. The series dead-space settings are pushed to the dead-space compartments.
2. Each lever that changed since the last update is applied by its setter: the change `new − previous` is added to the members' persistent layer, clamped at 0. Several models share these layers, so Respiration only ever adds its own change. A set-and-clear round trip restores the start values.
3. Changed atelectasis or obstruction settings are applied.
4. Per lung: an obstructed lung resorbs; an open lung with an unstable region recruits or derecruits with its distending pressure.

The setters (`set_el_lung_factor`, `set_el_thorax_factor`, `set_upper_airway_resistance`, `set_lower_airway_resistance`, `set_gasexchange`, `set_atelectasis_left/right`, `set_airway_obstructed_left/right`) can also be called directly; each records its new value, so a change is applied once either way. `set_tube_block(side, state)` is called by the Ventilator.

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
(term_neonate_72h 20 400). With `c = 0` nothing is written.

On `term_neonate_72h`, right lung, room air (`scripts/probe_atelectasis.mjs`, measured when atelectasis was introduced, 2026-10):

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
distending pressure sits roughly 5 cmH₂O above the set PEEP. On `term_neonate_72h`, the collapsed lung's
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

Trace on `term_neonate_72h`, right lung, set to 0.6 on SLE CMV 20/5 (`scripts/probe_atelectasis.mjs`, 2026-10):

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
pressure. Where a scenario has [Surfactant](./Surfactant.md), it keeps its own whole-lung
recruitment on the non-persistent layer. The two run independently and their effects add.

The thresholds are calibrated on the term lung.

Because the factor layers add up, Surfactant's derecruitment and atelectasis together can take a
lung's effective unstressed volume or diffusion constant below zero. [Capacitance](./Capacitance.md)
floors `u_vol_eff` and [GasExchanger](./GasExchanger.md) the diffusion constants at 0. A negative
diffusion constant would pump gas against its gradient and blow up the blood gases.

### Bronchus obstruction and resorption

`airway_obstructed_left` / `_right` (setters `set_airway_obstructed_left/right`) close a main
bronchus (`DS_ALx.no_flow`) with a mucus plug. A tube in the right main bronchus blocks the left one
through `set_tube_block(side, state)` (called by [Ventilator](./Ventilator.md#airway-events)). That
block is kept apart from the plug, and the bronchus is closed while either holds. No gas moves in or out, and the
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

On term_neonate_72h with a right-mainstem tube on CMV 20/5, the left lung's collapse after 10 minutes is
0.26 on air and 0.67 on oxygen. A right bronchial plug in a spontaneously breathing baby takes SaO₂
from 96 to 76 % in 5 minutes.

## Factor system

None of its own. It writes:

| Target | Layer |
|---|---|
| lungs, thorax | `el_base_factor_ps` (levers, atelectasis); lungs' `u_vol_factor_ps` (atelectasis) |
| airways | `r_factor_ps` (levers); `no_flow` (obstruction) |
| gas exchangers | `dif_o2_factor_ps`, `dif_co2_factor_ps` (`gex_factor`, atelectasis) |
| shunt and capillary resistors | `r_factor`, every step while there is atelectasis |

## Inputs and outputs

- **Reads:** the lungs' `pres_in`, `fo2`, `vol`, `u_vol_eff`, `el_eff`; the resistors' layers.
- **Writes:** the layers above; the dead space's series settings; trapped-lung volume (`volume_out`) during resorption.
- **Written by:** the user and bot (levers, atelectasis, plugs); the [Ventilator](./Ventilator.md#airway-events) (`set_tube_block`); scenario generators (`el_lungs_factor`, `gex_factor`).
- **Read by:** `DataCollector` watchers and the probes (`atelectasis_left/right`).

## Assumptions and limitations

- **Levers add.** The persistent layers are shared, so simultaneous writers add their changes. A layer driven to the 0 clamp loses the part of the change below 0.
- **Membership is by name.** Only models named in the lists are affected.
- **Atelectasis is per lung, not regional,** and calibrated on the term lung. Where a scenario has [Surfactant](./Surfactant.md), its own whole-lung recruitment runs in parallel; their effects add.
- **The perfusion split assumes the shunt and capillary paths share one pressure drop** (`xL_ART` → `xL_VEN`).

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Respiration` (trimmed: groups and atelectasis defaults left out):

```json
{
  "name": "Respiration",
  "model_type": "Respiration",
  "is_enabled": true,
  "lungs": ["ALL", "ALR"],
  "thorax": ["THORAX"],
  "el_lungs_factor": 1,
  "el_thorax_factor": 1,
  "res_upper_airways_factor": 1,
  "res_lower_airways_factor": 1,
  "gex_factor": 1,
  "dead_space_segments": 32,
  "dead_space_dispersion": 0.015,
  "dead_space_diffusion": 1e-5,
  "atelectasis_left": 0,
  "atelectasis_right": 0
}
```

## Usage in the scenarios

One instance in every scenario, owning `MOUTH`, `DS`, `ALL`, `ALR`, `THORAX`, `GASEX_LL` and `GASEX_RL`. term_neonate_72h uses the defaults above for every lever (1) and for atelectasis (0); disease is carried by the compartments' own values and, where a scenario has one, by Surfactant.

## References

- Hickling KG. The pressure-volume curve is greatly modified by recruitment: a mathematical model of ARDS lungs. *Am J Respir Crit Care Med* 1998;158:194–202. doi:10.1164/ajrccm.158.1.9708049 (normally distributed opening and closing pressures).
