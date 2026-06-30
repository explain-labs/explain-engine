# Hormones (RAAS / ADH)

The `Hormones` model is the **long-loop neuro-hormonal volume / osmolality controller** — the slow
counterpart to the fast [`Ans`](./Ans.md) baroreflex. It models the
renin–angiotensin–aldosterone system (RAAS) plus ADH (vasopressin) as a small set of named,
inspectable hormone **activity levels** (`1.0` = resting baseline), each driven first-order toward a
stimulus-set target and each writing effector channels that are **independent of the ANS** (so they
compose, never collide).

Like the [`Kidneys`](./Kidneys.md) autoregulation loop it is a **controller/process model**: it
holds no blood, resolves references to other models lazily, runs on an update interval, and **owns
its effector channels while enabled** (releasing them once on disable). Default config is
**neutral** — with setpoints anchored to the scenario's resting state, every `(hormone − 1) ≈ 0`,
so a scenario that ships a `Hormones` model behaves identically at rest and only diverges when
perturbed or when a pathway is clamped.

## Sensors → hormones → effectors

```
SENSORS (lazy refs)                 HORMONES (1.0 = baseline)        EFFECTORS (owned, default-neutral)
KID_ART.pres ───────────┐
Circulation.total_blood_volume ─┬─► angiotensin ─┐                 Circulation.svr_factor_art / _ven   (arteriolar/venular constriction)
AA.solutes.na (osm≈2·Na) ──┐    │   (renin=drive) ├─► aldosterone   KID_CAP_KID_VEN.r_factor_ps         (renal EFFERENT constriction)
AA.solutes.k ──────────────┼────┘                │   (cascade+K)    Kidneys.reabsorption_factors.na/.k  (Na retention / K wasting)
                           └─────────────────────┴─► adh            Kidneys.reabs_factor_adh            (water retention / antidiuresis)
```

- **angiotensin II** ← low renal perfusion + low blood volume. `renin` is the instantaneous drive;
  `angiotensin` is its lagged effective level (`angiotensin_tc`).
- **aldosterone** ← angiotensin (cascade) + hyperkalemia. Slow (`aldosterone_tc`).
- **adh** ← plasma osmolality (osmotic, `osm ≈ 2·Na`) + low volume/pressure (baroregulated).

> **Why the renal EFFERENT, not the afferent.** The renal afferent (`KID_ART.r_factor_ps`) is owned
> by the Kidneys autoregulation loop (overwritten every tick). Angiotensin II therefore acts renally
> through the **efferent** arteriole (`KID_CAP_KID_VEN`, a free-standing `Resistor`) — which is also
> its signature physiology: efferent constriction raises glomerular pressure and **defends GFR** when
> perfusion falls. Systemic constriction goes through `Circulation.svr_factor_art/_ven`, which fans a
> delta out to every systemic arteriole/venule's `r_factor_ps` (`BloodVessel` α-couples that into
> elastance — realistic combined constriction). The ANS uses a *separate* `ans_activity` channel, so
> the two compose without clashing.

## Dynamics

Each hormone relaxes first-order toward a stimulus target on the controller tick
(`_update_interval`, default 1 s; hormones are slow so a fine tick is unnecessary):
`x += u·(1/tc)·(−x + target)`, clamped to `[hormone_min, hormone_max]`. With `p/V/Na/K` the sensed
values and `*_setpoint` the resting anchors:

```
renin       = 1 + renin_gain·(p_set−p)/p_set + renin_vol_gain·(V_set−V)/V_set        → angiotensin (lag)
aldo_target = 1 + aldo_gain·(angiotensin−1) + aldo_k_in_gain·(K−K_set)/K_set         → aldosterone (slow lag)
adh_target  = 1 + adh_gain_osmo·(Na−Na_set)/Na_set + adh_gain_baro·(V_set−V)/V_set   → adh (lag)
```

Each `*_enabled` gate that is off pins its hormone(s) to `1.0` (neutral). Effector factors map
`1 + gain·(hormone−1)` (K wasting is `1 − aldo_k_gain·(aldo−1)`), each clamped, then written to the
owned channel.

## Kidneys integration

Two neutral-by-default hooks were added to `Kidneys` for this layer (see [`Kidneys`](./Kidneys.md)):
- **`reabs_factor_adh`** — ADH's dedicated water-reabsorption multiplier, folded into `_reabs_eff`
  (separate from the user `reabs_factor_ps` layer).
- **`reabsorption_factors`** (per-solute dict) — aldosterone's per-solute multiplier applied in
  `_solute_reabs` (`na > 1` retain, `k < 1` waste); also reusable for diuretics.

## Read-outs
| Read-out | Meaning |
|---|---|
| `angiotensin` / `aldosterone` / `adh` | effective hormone activity (1.0 = baseline) |
| `renin` | instantaneous angiotensin drive (un-lagged) |
| `svr_factor` / `svr_ven_factor` | applied systemic arteriolar / venular constriction factor |
| `efferent_factor` | applied renal efferent `r_factor_ps` |
| `na_reabs_factor` / `k_reabs_factor` / `water_reabs_factor` | applied Kidneys reabsorption factors |
| `sensed_perfusion` / `sensed_volume` / `sensed_na` / `sensed_osmolality` / `sensed_k` | sensor read-outs |

## Configuration & calibration
Anchor `perfusion_setpoint` ≈ baseline `KID_ART.pres` (neonate ≈ 40, adult ≈ 82 mmHg),
`volume_setpoint` ≈ baseline `Circulation.total_blood_volume` (neonate ≈ 0.286 L, adult ≈ 4.84 L),
`osmo_na_setpoint` ≈ 138, `k_setpoint` ≈ 3.5 — so resting hormone levels ≈ 1.0 and no channel rails
(measured headless with `Ans` disabled). Gains/time-constants are configurable per hormone; both
scenarios ship **enabled** with **physiologic** time constants (`angiotensin_tc` 30 s, `adh_tc`
120 s, `aldosterone_tc` 1800 s).

**Validated headless** (`scripts/headless.mjs <scenario> --bleed FRAC | --naload Δ --phase2 S`,
optionally `--hset aldosterone_tc=…` to compress for a quick loop check):
- **Resting neutrality:** hormones ≈ 1.0; GFR/urine/FENa unchanged from the no-hormone calibration;
  disabling (`hormones_running=false`) is byte-identical.
- **Hemorrhage (−8% volume):** angiotensin/aldosterone↑, efferent constricts → GFR defended
  (adult 100 → 72 mL/min), urine → oliguria (1.0 → 0.64 mL/kg/hr).
- **Hyperosmolar (+12 mmol/L Na):** ADH↑ (1.0 → 1.35) → antidiuresis (urine 1.0 → 0.48 mL/kg/hr),
  RAAS stays quiet (osmolality drives only ADH).
- Stable over long physiologic-`tc` runs (no oscillation/railing).

## Simplifications / limitations (current scope)
- **Aldosterone's volume effect is muted:** the engine's water transport follows the water fraction,
  not osmotically coupled to Na, so aldosterone shows mainly as ↓FENa / ↓urine-Na rather than large
  volume shifts. ADH (water) and AngII (vasoconstriction) carry the volume/pressure defense.
- With **physiologic** `aldosterone_tc` (~30 min), aldosterone barely moves in short scenarios —
  expected; compress `aldosterone_tc` for interactive demos.
- While enabled, `Hormones` **owns** `Circulation.svr_factor_*`, `KID_CAP_KID_VEN.r_factor_ps`, and
  the Kidneys hormone factors — manual edits to those channels are overridden (same precedent as
  autoregulation owning `KID_ART.r_factor_ps`). The clean "off" switch is `hormones_running = false`
  (or per-pathway `raas_enabled` / `adh_enabled`), which releases the channels back to neutral.
- Not modeled: ANP / natriuretic peptides, thirst / fluid intake, direct osmotic water-follows-Na
  coupling. Severe (>~15%) acute hemorrhage can drive the circulation model to non-physiologic
  (negative) pressures — a pre-existing circulation limitation, independent of this layer.
