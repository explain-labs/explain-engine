# Circulation

`Circulation` is **not a physical compartment** — it is a coordinator that groups the circulatory
models and applies whole-tree adjustments to them. It does two jobs: it propagates **autonomic
vascular tone** onto the vessels, and it tallies the **blood-volume distribution** across the
systemic, pulmonary and cardiac compartments for reporting.

It holds no volume, pressure or flow of its own; it only reads from and writes onto the vessels and
chambers named in its lists.

## What it groups

The model definition populates lists of model **names** by anatomical class:

- Systemic: `systemic_arteries`, `systemic_arterioles`, `systemic_capillaries`, `systemic_venules`,
  `systemic_veins`
- Pulmonary: `pulmonary_arteries`, `pulmonary_arterioles`, `pulmonary_capillaries`,
  `pulmonary_venules`, `pulmonary_veins`
- `heart_chambers`, `coronaries`

`init_model` flattens these into `_bloodvessel_list` (all), `_systemic_bloodvessel_list` and
`_pulmonary_bloodvessel_list` for fast iteration.

## Calculation cycle (`calc_model`)

Two throttled loops:

- **Fast (every 0.015 s)** — apply tone changes *only when an input changed* (each guarded by a
  `prev_*` comparison so the work is skipped when nothing moved):
  - `ans_activity` → written onto every vessel's `ans_activity` (drives the BloodVessel α-coupled
    vasoreactivity).
  - `svr_factor_art` / `svr_factor_ven` → systemic arteriolar / venular resistance.
  - `pvr_factor_art` / `pvr_factor_ven` → pulmonary arteriolar / venular resistance.
- **Slow (every 1.0 s)** — `calc_blood_volumes()` tallies the volume distribution.

## Vascular tone: the `set_*_factor` methods

Resistance tone is applied through each vessel's **persistent** resistance factor `r_factor_ps` —
the layer that survives steps and accumulates contributions from several models (Circulation, ANS,
MOB). Because it is cumulative, Circulation applies the **delta** since the last call, not the
absolute value:

```
delta = new_factor − prev_factor
for each vessel in the group:  r_factor_ps += delta   (clamped at 0)
prev_factor := new_factor
```

The delta is computed **once** so every vessel in the group receives the same change, and
`r_factor_ps` is clamped at 0 (a negative resistance factor is non-physical). The four methods differ
only in which vessel list and which `*_factor` they drive:

| Method | Vessel list | Factor |
|---|---|---|
| `set_svr_factor_art` | `systemic_arterioles` | systemic arteriolar resistance |
| `set_svr_factor_ven` | `systemic_venules` | systemic venular resistance |
| `set_pvr_factor_art` | `pulmonary_arterioles` | pulmonary arteriolar resistance |
| `set_pvr_factor_ven` | `pulmonary_venules` | pulmonary venular resistance |

> Resistance tone is applied at the **arteriolar and venular** levels only — the dominant resistance
> sites — not on the large arteries/veins or capillaries.

## Blood-volume tally (`calc_blood_volumes`)

Sums `vol` over enabled members of each group:

```
syst_blood_volume  = Σ systemic vessels + Σ coronaries
pulm_blood_volume  = Σ pulmonary vessels
heart_blood_volume = Σ heart chambers
total_blood_volume = syst + pulm + heart
*_perc = 100 · part / total          (0 when total = 0)
```

Coronary volume is counted into the **systemic** total. Disabled models and missing names are
skipped, and the percentages are guarded against a zero total.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `systemic_*` / `pulmonary_*` / `heart_chambers` / `coronaries` | lists of model names by class |
| `ans_activity` | autonomic tone propagated to all vessels (1.0 = no effect) |
| `svr_factor_art`, `svr_factor_ven` | systemic arteriolar / venular resistance targets |
| `pvr_factor_art`, `pvr_factor_ven` | pulmonary arteriolar / venular resistance targets |

## Notes & caveats

- **Tone factors are cumulative and shared.** `r_factor_ps` is written by several models; Circulation
  only adds its delta. If a vessel's factor is driven to the 0 clamp (extreme dilation) it stops
  tracking further decreases until the target rises again — an inherent property of the per-vessel
  persistent-factor model.
- **Group membership is name-based.** A vessel only receives tone / is counted if its name appears in
  the appropriate list; the lists must be kept in sync with the circulation topology.
- **The volume tally runs once per second** (performance), so `*_blood_volume*` lag fast transients
  by up to a second.
