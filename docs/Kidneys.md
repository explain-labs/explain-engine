# Kidneys

The `Kidneys` model turns the otherwise passive renal vascular bed
(`KID_ART → KID_CAP → KID_VEN`) into an active filtration unit. It is a
**controller/process model** (like [`Placenta`](./Placenta.md)) — it holds no
blood itself, it operates on the existing glomerular capillary `KID_CAP` and a
new `URINE` bladder compartment it owns.

**Scope (MVP): fluid balance & urine output only.** No electrolyte homeostasis,
clearance/acid-base, RAAS/ADH or GFR autoregulation yet — those are future phases.

## What it does each step

```
oncotic = oncotic_base · (KID_CAP.solutes.albumin / albumin_ref)   # rises with hemoconcentration
NFP     = max(0, KID_CAP.pres − p_bowman − oncotic)                 # Starling net filtration pressure
GFR     = kf_eff · NFP                                              # glomerular filtration rate (L/s)
urine   = GFR · (1 − reabsorption_fraction)                        # net water leaving the blood (L/s)
```

Each step the net urine (`urine · dt`) is moved from `KID_CAP` into `URINE` by a
**custom conservative transfer** (`_transfer`), NOT `volume_in` (which would copy
*all* solutes and cause artifactual proteinuria):

1. snapshot the **filterable** small-solute plasma concentrations (`na, k, ca, cl,
   lact, mg, phosphates, uma`);
2. remove the water from `KID_CAP.vol` (guarded ≥ 0, with a `1e-9` floor);
3. mass-mix water + those solutes into `URINE.vol` / `URINE.solutes`;
4. **hemoconcentration correction** — `albumin` & `hemoglobin` stay in the blood
   (total mass conserved), so their concentration is scaled up by
   `vol_before / vol_after`.

Net effect: diuresis slowly lowers the circulating blood volume; `URINE.vol`
accumulates the total diuresis; blood albumin/Hb concentrate rather than being lost.

## Read-outs
| Property | Unit | Meaning |
|---|---|---|
| `gfr` | mL/min | glomerular filtration rate |
| `urine_flow` | mL/min | net urine output |
| `nfp` | mmHg | net filtration pressure |
| `urine_volume` | mL | cumulative diuresis (= `URINE.vol × 1000`) |

## Configuration
| Param | Meaning |
|---|---|
| `kidneys_running` | master gate (false → GFR/urine = 0, bladder holds) |
| `kf` | glomerular filtration coefficient (L/s·mmHg) — **the dominant, scenario-specific calibration knob** |
| `p_bowman` | Bowman's capsule pressure (mmHg) |
| `oncotic_base`, `albumin_ref` | plasma oncotic pressure at the reference albumin |
| `reabsorption_fraction` | fraction of GFR reabsorbed (urine = GFR·(1−FR)) |
| `filterable_solutes` | small solutes carried into urine (albumin/Hb excluded) |

`kf` carries the additive 3-layer factor stack (`kf_factor` / `_ps` / `_scaling_ps`),
`reabsorption_fraction` a multiplicative one (clamped to [0, 0.9999]).

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

## Simplifications (current scope)
- GFR rides directly on `KID_CAP.pres` — no autoregulation (myogenic/TGF clamp is a
  later RAAS phase).
- Oncotic pressure is linear in albumin (not Landis-Pappenheimer).
- Reabsorption is a single scalar fraction (no tubular load / Na handling).
- `URINE` never empties on its own (a future `void_bladder()` function can reset it).
