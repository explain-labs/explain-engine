# Surfactant

`Surfactant` turns the preterm lung's respiratory distress syndrome (RDS) into a dynamic, treatable process. The fraction of open alveoli rises and falls with the mean distending pressure, with hysteresis (recruitment above an opening threshold, derecruitment below a closing one). Giving surfactant lowers both thresholds, so the same CPAP or PEEP now opens the lung. The open fraction drives the lungs' compliance and FRC, the gas-exchange surface and the intrapulmonary shunt. It holds no compartment, and it is **neutral at rest**: a scenario keeps its calibrated operating point until PEEP changes or surfactant is given.

## Physiology

Surfactant lowers the surface tension in the alveoli. Without it, as in a preterm infant before ~34 weeks, small alveoli collapse at end-expiration:
- the lung is stiff and its functional residual capacity (FRC) low;
- blood flows past collapsed alveoli unoxygenated;
- the infant needs pressure (CPAP, PEEP) to keep the lung open.

A collapsed region reopens only above its opening pressure and recollapses below a lower closing pressure. Between the two, it holds. This hysteresis is why a recruited lung stays open on less pressure than it took to open it.

Exogenous surfactant, instilled into the trachea, works within minutes: compliance improves, FRC rises, oxygenation improves and the needed FiO2 falls. It doesn't change the lung's structural immaturity.

## Inheritance

```
BaseModelClass
  └── Surfactant
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `surfactant_running` | boolean | `true` | Master switch. Off releases every effect to 1 once, then idles. |
| `lung_models` | list | `["ALL", "ALR"]` | Alveolar compartments. |
| `gasex_models` | list | `["GASEX_LL", "GASEX_RL"]` | Gas exchangers. |
| `shunt_models` | list | `["IPSL", "IPSR"]` | Intrapulmonary shunt resistors. |
| `surfactant` | 0–1 | 0.3 | Surfactant maturity: 0 = severe deficiency, 1 = mature or fully treated. |
| `surfactant_target` | 0–1 or null | null | Therapy target the maturity ramps toward; null holds it. Set by `administer_surfactant`. |
| `surfactant_tc` | s | 180 | Ramp time constant of the therapy response. |
| `open_margin`, `close_margin` | mmHg | 2, 2 | Half-widths of the dead zone above and below the baseline pressure. |
| `surf_open_gain`, `surf_close_gain` | mmHg per unit | 14, 12 | Fall of the opening and closing thresholds per unit rise in maturity. |
| `k_open`, `k_close` | 1/(mmHg·s) | 0.5, 0.5 | Recruitment and derecruitment rates. |
| `pres_tc` | s | 4 | Smoothing of the transpulmonary pressure (averages out tidal swings). |
| `el_gain`, `uvol_gain`, `dif_gain`, `ips_gain` | per unit `r` | 0.7, 1.5, 2.0, 6.0 | Effect gains (see [Calculation](#calculation)). |
| `el_factor_min`, `el_factor_max`, `uvol_factor_min`, `uvol_factor_max`, `dif_factor_min`, `dif_factor_max`, `ips_factor_min`, `ips_factor_max` | – | 0.2/3, 0.3/3, 0.1/5, 0.1/30 | Clamps on the effect factors. |

### Baseline (captured, saved with the state)

| Property | Unit | Description |
|---|---|---|
| `baseline_captured` | boolean | The baseline has been captured (30 s after a fresh build). |
| `baseline_ptp` | mmHg | P0: the smoothed transpulmonary pressure at capture. |
| `baseline_open_fraction` | 0–1 | f0: the open fraction at capture, the neutral reference. |
| `baseline_surfactant` | 0–1 | surf0: the maturity at capture. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `open_fraction` | 0–1 | Fraction of open alveoli (0.5 in every scenario at build). |
| `transpulmonary_pressure` | mmHg | Smoothed mean alveolar recoil pressure (`pres_in` of the lungs). |
| `open_pressure`, `close_pressure` | mmHg | Current opening and closing thresholds. |
| `el_lung_factor`, `uvol_lung_factor`, `dif_factor`, `ips_factor` | – | Applied effect factors. |

## Calculation

Each step:

1. **Therapy:** `surfactant += dt/surfactant_tc · (surfactant_target − surfactant)` while a target is set.
2. **Pressure:** the lungs' mean `pres_in`, smoothed over `pres_tc`.
3. **Baseline** (once, 30 s after a fresh build): P0, f0 and surf0 are captured. A loaded state that already has `baseline_captured` keeps its own.
4. **Thresholds**, centred on the scenario's own baseline:
   ```
   TOP = P0 + open_margin  − surf_open_gain  · (surfactant − surf0)
   TCP = P0 − close_margin − surf_close_gain · (surfactant − surf0)
   ```
   At baseline P0 sits inside the dead zone, so any scenario is neutral without per-scenario tuning.
5. **Recruitment** (after the baseline is captured):
   ```
   d open / dt = k_open · max(0, P − TOP) · (1 − open)  −  k_close · max(0, TCP − P) · open
   ```
6. **Effects**, with `r = open_fraction − f0` (1.0 at baseline), each clamped:
   ```
   el_lung_factor   = 1 − el_gain · r      → ALL/ALR.el_base_factor     (stiffer when derecruited)
   uvol_lung_factor = 1 + uvol_gain · r    → ALL/ALR.u_vol_factor       (FRC)
   dif_factor       = 1 + dif_gain · r     → GASEX_*.dif_o2/co2_factor  (exchange surface)
   ips_factor       = 1 + ips_gain · r     → IPSL/IPSR.r_factor_ps      (less shunt when recruited)
   ```

`administer_surfactant(target = 1.0)` sets `surfactant_target` (clamped 0–1); it is callable through `callModelFunction` or the TaskScheduler.

## Factor system

| Target | Layer | Note |
|---|---|---|
| lungs | `el_base_factor`, `u_vol_factor` (non-persistent) | rewritten every step; composes with Respiration's `*_factor_ps` |
| gas exchangers | `dif_o2_factor`, `dif_co2_factor` (non-persistent) | |
| IPSL, IPSR | `r_factor_ps` (persistent) | owned by Surfactant; reset to 1 on switch-off |

## Inputs and outputs

- **Reads:** the lungs' `pres_in`.
- **Writes:** the layers above.
- **Written by:** the user and the bot (`administer_surfactant`, `surfactant_running`, `surfactant`); the scenario generators.
- **Read by:** Respiration's atelectasis perfusion (computes against IPSL/IPSR's `r_factor_ps`); `DataCollector` watchers.

## Assumptions and limitations

- **Whole-lung, one open fraction.** No regional or gravity-dependent collapse; both lungs share one state. [Respiration](./Respiration.md#atelectasis)'s per-lung atelectasis runs independently, and their effects add.
- **Relative to the baseline.** Effects are deviations from the open fraction at capture, so the scenario's static RDS phenotype stays its baked values plus these deviations.
- **Calibrated for a low operating pressure.** A spontaneously breathing preterm runs at a mean transpulmonary pressure of ~1–3 mmHg, so the margins are small and the surfactant gains large: a dose must pull the opening threshold clearly below the prevailing pressure to recruit.
- **No surfactant kinetics.** Maturity only ramps toward the target. There is no inactivation (meconium, protein leak), no redosing decay, no effect on the airway.
- **The first 30 s of a fresh build** hold the open fraction while the baseline is captured.

## Example definition (JSON)

No shipped scenario has a Surfactant model; a `models.Surfactant` entry (config props only) looks like:

```json
{
  "name": "Surfactant",
  "model_type": "Surfactant",
  "is_enabled": true,
  "surfactant_running": true,
  "lung_models": ["ALL", "ALR"],
  "gasex_models": ["GASEX_LL", "GASEX_RL"],
  "shunt_models": ["IPSL", "IPSR"],
  "surfactant": 0.2,
  "surfactant_target": null,
  "surfactant_tc": 180,
  "open_margin": 2,
  "close_margin": 2,
  "surf_open_gain": 14,
  "surf_close_gain": 12,
  "k_open": 0.5,
  "k_close": 0.5,
  "pres_tc": 4,
  "el_gain": 0.7,
  "uvol_gain": 1.5,
  "dif_gain": 2,
  "ips_gain": 6
}
```

## Usage in the scenarios

Not used by any shipped scenario: `term_neonate_72h` has no Surfactant model.

## References

No literature values; the gains and thresholds are teaching calibrations.
