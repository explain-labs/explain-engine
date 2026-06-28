# Surfactant

The `Surfactant` model turns the previously **static** preterm RDS lung phenotype — baked-in stiff
alveoli, low FRC, reduced alveolar diffusion and an intrapulmonary shunt — into a **dynamic,
treatable** process: pressure-driven alveolar **recruitment / derecruitment with hysteresis**, plus a
**surfactant-therapy** response. It is a slow **process controller** in the same family as
[`Hormones`](./Hormones.md) / [`Kidneys`](./Kidneys.md) / `Lactate`: it holds no compartment,
resolves references to other models lazily, and is **neutral at rest**. A scenario that ships it keeps
its calibrated RDS operating point unchanged and only diverges when PEEP/CPAP changes or surfactant is
given.

It is the *pathophysiology/therapy* layer that sits on top of the lung mechanics owned by
[`Respiration`](./Respiration.md), the alveolar gas exchange of [`GasExchanger`](./GasExchanger.md),
and the venous admixture of [`Shunts`](./Shunts.md) — driven by the airway pressure that
[`Breathing`](./Breathing.md) and the [`Ventilator`](./Ventilator.md) impose.

## Recruitment state

```
SENSOR (lazy refs)                  STATE                         EFFECTORS (owned while running)
ALL.pres_in ─┐ mean, smoothed                                     ALL/ALR.el_base_factor   1−el_gain·r   (compliance)
ALR.pres_in ─┴─► P_tp ──► [ hysteresis dead zone ] ──► open_fraction ─► ALL/ALR.u_vol_factor 1+uvol_gain·r (FRC)
                          TCP ····· TOP                            GASEX_*.dif_o2/co2_factor 1+dif_gain·r  (gas exchange)
surfactant ───► lowers TOP/TCP                                    IPSL/IPSR.r_factor_ps    1+ips_gain·r   (less shunt)
```

`open_fraction` ∈ `[0,1]` is the fraction of alveoli that are open. It is driven by the mean
(breath-averaged) **transpulmonary pressure** `P_tp` = alveolar recoil pressure (`GasCapacitance.pres_in`,
averaged over both lungs `ALL`/`ALR` and smoothed first-order over `pres_tc` so tidal swings don't
dominate):

```
dOpen = [ k_open·max(0, P_tp − TOP)·(1 − open)     recruit above the opening threshold
        − k_close·max(0, TCP − P_tp)·open ] · dt   derecruit below the closing threshold
```

Between the closing threshold `TCP` and the opening threshold `TOP` there is a hysteresis **dead zone**
(`open` holds) — the signature of lung recruitment.

## Auto-centered thresholds (the robustness trick)

At warm-up (after `_warmup_delay` = 30 s, once the circuit has settled) the model captures the baseline
mean `P_tp` (`P0`), `open_fraction` (`f0`) and `surfactant` level (`surf0`), then centers the dead zone
on `P0`:

```
TOP = P0 + open_margin  − surf_open_gain ·(surfactant − surf0)
TCP = P0 − close_margin − surf_close_gain·(surfactant − surf0)
```

So at the scenario's own baseline (`surfactant == surf0`, `P_tp == P0`) the operating pressure sits
inside the dead zone → `open` holds at `f0` → the model is **neutral and stable at ANY scenario's
operating point with no per-scenario threshold tuning**. Raising PEEP pushes `P_tp` above `TOP` →
recruit; losing PEEP pushes it below `TCP` → derecruit; **surfactant lowers `TOP`/`TCP`** so the same
prevailing airway pressure now recruits the lung. Recruitment is **gated off until seeded** (`open_fraction`
holds at its init value during warm-up), so the `f0` (≈ 0.5) headroom is identical for every scenario
regardless of the warm-up pressure transient.

## Effectors

All effects are referenced to `f0`, so each factor is exactly `1.0` at baseline. With
`r = open_fraction − f0` (`+` = recruited above baseline, `−` = derecruited):

| Channel | Target | Factor | Effect of recruitment |
|---|---|---|---|
| `el_lung_factor` | `ALL`/`ALR`.`el_base_factor` | `1 − el_gain·r` | lower elastance / more compliant |
| `uvol_lung_factor` | `ALL`/`ALR`.`u_vol_factor` | `1 + uvol_gain·r` | higher FRC |
| `dif_factor` | `GASEX_LL`/`GASEX_RL`.`dif_o2_factor` & `dif_co2_factor` | `1 + dif_gain·r` | more gas-exchange surface |
| `ips_factor` | `IPSL`/`IPSR`.`r_factor_ps` | `1 + ips_gain·r` | higher shunt resistance → less venous admixture |

Each factor is clamped (`el` `[0.2,3.0]`, `uvol` `[0.3,3.0]`, `dif` `[0.1,5.0]`, `ips` `[0.1,30.0]`).

**Which factor layer matters.** The first three use the **non-persistent** factor layer
(`el_base_factor` / `u_vol_factor` / `dif_*_factor`) — reset to `1.0` each step by the compartment and
**re-written here every step** — so they compose additively with the [`Respiration`](./Respiration.md)
controller, which owns the persistent `*_factor_ps` layer (see the
[factor / effective-value pattern](./Capacitance.md)). The shunt instead modulates the **persistent**
`r_factor_ps` on `IPSL`/`IPSR` (those resistors carry their `r_for`/`r_back` from `Shunts.ips_res`);
that channel is **owned by Surfactant** and released back to `1.0` on disable.

## Surfactant therapy

`surfactant` ∈ `[0,1]` is alveolar maturity: `0` = severe deficiency (RDS), `1` = mature / fully
treated (default baseline `0.3`). The dosing API instills surfactant and ramps maturity up first-order:

```
administer_surfactant(target = 1.0)   // sets surfactant_target; callable via callModelFunction / TaskScheduler
surfactant += dt·(1/surfactant_tc)·(surfactant_target − surfactant)   // surfactant_tc = 180 s
```

The acute compliance/recruitment response therefore develops over a few minutes. Setting
`surfactant_target = null` holds maturity at its current value.

## Read-outs

| Read-out | Meaning |
|---|---|
| `open_fraction` | recruited alveolar fraction `[0,1]` |
| `transpulmonary_pressure` | smoothed mean `P_tp` (mmHg) |
| `open_pressure` / `close_pressure` | current `TOP` / `TCP` (mmHg) |
| `surfactant` | current alveolar maturity `[0,1]` |
| `el_lung_factor` / `uvol_lung_factor` / `dif_factor` / `ips_factor` | applied effector factors |

## Configuration & calibration

| Parameter | Default | Meaning |
|---|---|---|
| `surfactant` / `surfactant_tc` | `0.3` / `180.0` s | baseline maturity / therapy ramp time constant |
| `open_margin` / `close_margin` | `2.0` / `2.0` mmHg | dead-zone half-widths above/below `P0` |
| `surf_open_gain` / `surf_close_gain` | `14.0` / `12.0` mmHg | drop in `TOP` / `TCP` per unit surfactant rise |
| `k_open` / `k_close` | `0.5` / `0.5` (1/(mmHg·s)) | recruitment / derecruitment rates |
| `pres_tc` | `4.0` s | smoothing of `P_tp` |
| `el_gain` / `uvol_gain` / `dif_gain` / `ips_gain` | `0.7` / `1.5` / `2.0` / `6.0` | effect gains per unit `r` |
| `_warmup_delay` | `30.0` s | delay before capturing `P0` / `f0` / `surf0` |

> **Calibration note.** A spontaneously-breathing preterm runs at a **low** mean `P_tp` (~1–3 mmHg), so
> the margins are deliberately small and the surfactant gains large: a therapeutic dose must clearly
> pull the opening threshold below the prevailing airway pressure for recruitment to occur.

## Gating

`surfactant_running` (default `true`) is the master gate. When set `false`, `_release_channels()` runs
**once** — resetting `el_base_factor`/`u_vol_factor` on the lungs, `dif_o2_factor`/`dif_co2_factor` on
the gas exchangers, and the persistent `r_factor_ps` on the shunts all back to `1.0` — then the model
idles. This is the clean "off" switch that returns the lung to its underlying (static) phenotype.
