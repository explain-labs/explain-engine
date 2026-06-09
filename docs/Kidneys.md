# Kidneys

The `Kidneys` model turns the otherwise passive renal vascular bed
(`KID_ART → KID_CAP → KID_VEN`) into an active filtration unit. It is a
**controller/process model** (like [`Placenta`](./Placenta.md)) — it holds no
blood itself, it operates on the existing glomerular capillary `KID_CAP` and a
new `URINE` bladder compartment it owns.

**Scope: fluid balance & urine output, per-solute reabsorption, and optional GFR autoregulation**
(myogenic + TGF, see below). Reabsorption fractions are static (no hormonal control yet); no
clearance/acid-base or RAAS/ADH — those are future phases.

## What it does each step

```
oncotic = oncotic_base · (KID_CAP.solutes.albumin / albumin_ref)   # rises with hemoconcentration
NFP     = max(0, KID_CAP.pres − p_bowman − oncotic)                 # Starling net filtration pressure
GFR     = kf_eff · NFP                                              # glomerular filtration rate (L/s)
Vf      = GFR · dt                                                  # filtrate volume this step (L)
Uw      = Vf · (1 − reabsorption_fraction)                          # net urine WATER leaving the blood
```

### Per-solute reabsorption (mass balance)

Each filterable solute is reabsorbed by **its own** fraction, so urine need not be
iso-osmotic with plasma. `_transfer(Vf, wr)` does a conservative **mass balance** (NOT
`volume_in`, which would copy *all* solutes incl. albumin/Hb and cause artifactual
proteinuria). With water fraction `wr` and per-solute fraction `fr[s]`:

```
fr[s]  = reabsorption_fractions[s]  (else wr)         # clamped [0, 0.9999]
Mf[s]  = Vf · C_plasma[s]                             # filtered solute mass
Mx[s]  = min(Mf[s] · (1 − fr[s]), C[s]·V)             # excreted mass (clamped to available)
C'[s]  = (C[s]·V − Mx[s]) / (V − Uw)                  # new blood conc (reabsorbed stays in blood)
URINE.solutes[s] = (URINE.solutes[s]·Uvol + Mx[s]) / (Uvol + Uw)
```

Only the **net** excreted water (`Uw`) and solute mass (`Mx`) leave `KID_CAP`; the
reabsorbed remainder is simply never removed (it returns to blood). `albumin` & `hemoglobin`
are **not** filtered — total mass conserved, concentration scaled by `vol_before/vol_after`
(hemoconcentration). Volume is guarded with a `1e-9` floor.

- **Backward compatible:** if `fr[s] = wr` for every solute (e.g. an empty
  `reabsorption_fractions`), then `Mx[s] = C[s]·Uw` and `C'[s] = C[s]` — urine is iso-osmotic
  with plasma and output is identical to the old single-fraction model.
- `fr[s] > wr` → solute concentrates in blood / **dilutes** in urine; `fr[s] < wr` →
  **concentrates** in urine.

Net effect: diuresis slowly lowers circulating blood volume; `URINE.vol` accumulates total
diuresis; the kidney now handles water and each solute independently (e.g. Na/Cl avidly
reabsorbed, phosphate/urate spilled).

> **Modulation hook (RAAS-ready).** `reabsorption_fractions` is a dict, so the `TaskScheduler`
> can tween an individual key via a nested `prop2` write (`setPropValue("Kidneys.reabsorption_fractions.na", …)`)
> — the substrate a future RAAS/ADH layer will drive. It is **not** UI-editable yet (the
> registry has no dict `InterfaceField` type); the scalar `reabsorption_fraction` (water) and
> `fe_na` read-out are. The water fraction keeps its `reabs_factor`/`_ps`/`_scaling_ps` stack;
> explicit per-solute overrides are independent of that stack (solutes with no override track
> it via the `wr` fallback).

## Read-outs
| Property | Unit | Meaning |
|---|---|---|
| `gfr` | mL/min | glomerular filtration rate |
| `urine_flow` | mL/min | net urine output |
| `nfp` | mmHg | net filtration pressure |
| `urine_volume` | mL | cumulative diuresis (= `URINE.vol × 1000`) |
| `fe_na` | % | fractional excretion of Na (= `(1 − fr_na)·100`) |

Per-solute urine concentrations live in `URINE.solutes`.

## Configuration
| Param | Meaning |
|---|---|
| `kidneys_running` | master gate (false → GFR/urine = 0, bladder holds) |
| `kf` | glomerular filtration coefficient (L/s·mmHg) — **the dominant, scenario-specific calibration knob** |
| `p_bowman` | Bowman's capsule pressure (mmHg) |
| `oncotic_base`, `albumin_ref` | plasma oncotic pressure at the reference albumin |
| `reabsorption_fraction` | **water** reabsorption fraction (urine water = GFR·(1−FR)) |
| `reabsorption_fractions` | per-solute reabsorption dict `{na, k, …}`; absent → uses the water fraction |
| `filterable_solutes` | small solutes filtered into urine (albumin/Hb excluded) |

`kf` carries the additive 3-layer factor stack (`kf_factor` / `_ps` / `_scaling_ps`),
`reabsorption_fraction` a multiplicative one (clamped to [0, 0.9999]). Shipped first-pass
per-solute fractions (both scenarios, **need clinical tuning**): `na 0.995, cl 0.995, lact 0.99,
ca 0.98, mg 0.95, k 0.92, uma 0.90, phosphates 0.85` — vs water (0.985 neonate / 0.99 adult), so
urine is dilute in Na/Cl and concentrated in phosphate/urate. Neonatal FENa is physiologically
higher (lower Na reabsorption) — revisit in tuning.

The `URINE` compartment is a `BloodCapacitance` declared in the Kidneys
`components` block (auto-instantiated by the base `init_model`), a pure sink with
no resistor connections (it never feeds back into the circulation).

> **Wiring note.** `KID_CAP` is a component of the `Circulation` model and may be
> instantiated *after* `Kidneys` in build order, so `_kid_cap` is resolved **lazily**
> on the first `calc_model` step (the `URINE` own-component is resolved in `init_model`).

## Calibration
`kf` differs ~5× between scenarios because baseline `KID_CAP.pres` differs
(neonate ≈ 35, adult ≈ 79 mmHg). Back-solve `kf ≈ target_GFR(L/s) / NFP_baseline`.
Targets: neonate GFR ~1.5–3 mL/min & urine ~1–3 mL/kg/hr; adult GFR ~90–120 mL/min
& urine ~0.5–1.5 mL/kg/hr. Keep `p_bowman + oncotic_base` well below `KID_CAP.pres`
(the neonate NFP margin is thin, ~5 mmHg) or filtration stops.

## GFR autoregulation (myogenic + TGF)

Optional closed-loop autoregulation (`autoregulation_enabled`, **default `false`** → the
model is byte-identical to the no-autoregulation behaviour until toggled on). When enabled, a
controller adjusts the **afferent arteriole** — the `KID_ART` `BloodVessel` (`aff_vessel_name`)
— by writing its `r_factor_ps`. A `BloodVessel` owns its input resistor and pushes its computed
resistance into it every step, so this modulates the renal supply resistor `AD_KID_ART`.
Constricting it (`r_factor_ps > 1`) cuts renal inflow → lowers `KID_CAP.pres` → NFP → GFR (and
α-couples a small elastance stiffening); dilating (`< 1`) raises them. Renal blood flow
autoregulates alongside GFR. The controller runs on a 15 ms tick (`u`); each limb and the
applied factor are first-order lagged (`x += u·(1/tc)·(−x + target)`).

> **Why control the afferent vessel (upstream of the sensor), not the glomerular inflow.** The
> myogenic limb senses `KID_ART.pres`, which sits *downstream* of `AD_KID_ART`. Constricting
> `AD_KID_ART` lowers `KID_ART.pres` (more drop upstream), so the loop is **negative feedback**
> (sense high → constrict → pressure falls → self-correcting). Controlling the downstream
> `KID_ART_KID_CAP` resistor instead would *raise* the sensed pressure when it constricts —
> positive feedback that rails the operating point. `AD_KID_ART` is also the dominant series
> resistance, so a firm plateau needs only modest gain.

**Myogenic limb (fast, `myogenic_tc ≈ 4 s`)** — senses the pressure the afferent feels
(`myogenic_input_model.myogenic_input_prop`, default `KID_ART.pres`). Piecewise-linear,
saturating outside the autoregulatory window `[p_min, p_max]`:

```
act = clamp(p_in, p_min, p_max) − p_set                 # deviation, saturated at the shoulders
gain = (p_in >= p_set) ? gain_up : gain_down
myo_target = 1 + gain·act                               # at setpoint → 1.0; rise → constrict
```

**TGF limb (slow, `tgf_tc ≈ 30 s`)** — senses distal NaCl delivery
`tgf_signal = GFR × KID_CAP.solutes.na` (`tgf_use_nacl`; falls back to `GFR` alone). When
`tgf_setpoint ≤ 0` it **auto-seeds**: the signal is smoothed by an EMA and the setpoint is
captured only after a `tgf_seed_delay` (default 30 s) warm-up, so it reflects the steady
state rather than the startup transient (seeding too early biases it low → standing
constriction at rest). The TGF limb stays neutral (`tgf_factor = 1`) until seeded.

```
err = (tgf_signal − tgf_setpoint) / tgf_setpoint
tgf_target = 1 + tgf_gain·err                           # high delivery → constrict
```

**Combine → clamp → lag → write** (`afferent_apply_tc ≈ 6 s`):

Each limb target is floored at a small positive (`_limb_factor_floor`) so a large downward
deviation × high gain can't drive a factor negative. Then:

```
combined = myogenic_factor · tgf_factor                 # multiplicative
combined = clamp(combined, afferent_factor_min, afferent_factor_max)
afferent_factor ← lag(afferent_factor → combined)       # then re-clamp
KID_ART.r_factor_ps = afferent_factor                   # vessel propagates to AD_KID_ART
```

As perfusion pressure (`AD.pres`) rises, the afferent constricts and holds GFR / renal blood
flow ~flat; beyond the window the factor saturates and GFR follows pressure again (the classic
shoulders). The three lags + hard clamp keep the loop well-damped and `r_for_eff > 0`.

| Read-out | Meaning |
|---|---|
| `myogenic_factor` / `tgf_factor` | per-limb afferent multipliers |
| `afferent_factor` | applied (lagged, clamped) `r_factor_ps` on the afferent |
| `sensed_pressure` | pressure driving the myogenic limb (mmHg) |
| `tgf_signal` | current TGF signal (`GFR×Na` or `GFR`) |

> **Ordering / one-step sensor delay.** `Kidneys` is a top-level model, so it steps before the
> `Circulation` sub-compartments (`KID_ART`, `AD_KID_ART`, …) that are created during the build's
> init pass. It therefore writes `KID_ART.r_factor_ps` **before** `KID_ART` steps and composes it
> into the resistance it pushes to `AD_KID_ART` — same step, no effector lag (and `r_factor_ps`
> persists, so ordering is non-fatal regardless). `Kidneys` reads `KID_ART.pres` from the previous
> step's pass — a deliberate one-step sensor delay the lags absorb. Disabling mid-run writes
> `KID_ART.r_factor_ps` back to `1.0` once, restoring linear behaviour.

**Calibration.** Set `myogenic_p_set` to each scenario's baseline `KID_ART.pres` so the
controller is near-neutral at steady state (the negative feedback makes this a fine-centering,
not a stability requirement). Both scenarios ship **enabled**:

| param | neonate | adult |
|---|---|---|
| `autoregulation_enabled` | **true** | **true** |
| `myogenic_p_set` / `_p_min` / `_p_max` | 40 / 25 / 65 | 83 / 55 / 140 |
| `myogenic_gain_up` / `_down` | 0.18 | 0.25 |
| `myogenic_tc` | 4 s | 4 s |
| `tgf_gain` / `tgf_tc` | 2.0 / 30 s | 3.0 / 30 s |
| `afferent_apply_tc` | 6 s | 6 s |
| `afferent_factor_min` / `max` | 0.5 / 10.0 | 0.5 / 20.0 |
| `tgf_setpoint` | 0 (auto-seed) | 0 (auto-seed) |

Validated headless (build the scenario, disable `Ans`, cycle-average, sweep preload to vary the
upstream perfusion pressure `AD.pres`). Measured against `AD.pres` (the controller regulates
`KID_ART.pres`, so it cannot be the x-axis): autoregulation cuts GFR variation **~77%** (neonate)
and **~79%** (adult) vs off, stable, with ANS-on baseline `afferent_factor` ≈ 1.0 (neonate 1.02,
adult 0.88) — no railing.

## Simplifications (current scope)
- Autoregulation is **opt-in**; with it off, GFR rides directly on `KID_CAP.pres` (linear in
  perfusion pressure).
- Oncotic pressure is linear in albumin (not Landis-Pappenheimer).
- Reabsorption is per-solute (each solute its own fraction), but **static** — no tubular load /
  transport-maximum / secretion kinetics, and not yet hormonally driven (RAAS/ADH is the next phase).
- `URINE` never empties on its own (a future `void_bladder()` function can reset it).
