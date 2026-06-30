# Circulation

`Circulation` is **not a physical compartment** — it is a high-level coordinator that groups the
circulatory models by anatomical class and applies whole-tree adjustments to them. It does two jobs:
it propagates **autonomic vascular tone** and **resistance-factor targets** onto the vessels, and it
tallies the **blood-volume distribution** across the systemic, pulmonary and cardiac compartments for
reporting. It holds no volume, pressure or flow of its own — it only reads from and writes onto the
vessels and chambers named in its lists.

## Inheritance

```
BaseModelClass
  └── Circulation   (group coordinator — no physics of its own)
```

Unlike `Capacitance`/`Resistor` descendants, `Circulation` extends `BaseModelClass` directly. It has
no `el_base`/`r_for`/`vol`; `calc_model()` instead iterates over named members and writes onto their
factor layers. It is the systemic/pulmonary counterpart to `Respiration` (which coordinates the
respiratory tree the same way).

## What it models

It groups every blood-carrying model and exposes a small set of system-wide levers:

- **Autonomic tone** — `ans_activity` is copied onto every vessel's own `ans_activity`, which drives
  the α-coupled vasoreactivity computed inside each `BloodVessel`.
- **Resistance tone** — `svr_factor_art`/`svr_factor_ven` and `pvr_factor_art`/`pvr_factor_ven` set
  the systemic and pulmonary arteriolar/venular resistance; `svr_factor_drug` is an independent
  channel owned by the Drugs PK/PD model that composes additively with `svr_factor_art`.
- **Volume bookkeeping** — `calc_blood_volumes()` sums compartment volumes into systemic / pulmonary /
  heart totals and percentages.

Group membership is **name-based**: a vessel only receives tone or is counted if its name appears in
the appropriate list, so the lists must be kept in sync with the circulation topology.

## Properties

### Configuration (set in the model definition)

| Property | Default | Description |
|---|---|---|
| `heart_chambers` | `[]` | names of all heart chambers (LA/RA/LV/RV streams) |
| `coronaries` | `[]` | names of coronary compartments (counted into the systemic total) |
| `systemic_arteries` | `[]` | systemic artery names |
| `systemic_arterioles` | `[]` | systemic arteriole names (the SVR tone site) |
| `systemic_capillaries` | `[]` | systemic capillary names |
| `systemic_venules` | `[]` | systemic venule names (the venous tone site) |
| `systemic_veins` | `[]` | systemic vein names |
| `pulmonary_arteries` | `[]` | pulmonary artery names |
| `pulmonary_arterioles` | `[]` | pulmonary arteriole names (the PVR tone site) |
| `pulmonary_capillaries` | `[]` | pulmonary capillary names |
| `pulmonary_venules` | `[]` | pulmonary venule names |
| `pulmonary_veins` | `[]` | pulmonary vein names |
| `ans_activity` | `1.0` | autonomic tone propagated to all vessels (1.0 = no effect) |
| `svr_factor_art` | `1.0` | systemic **arteriolar** resistance target |
| `svr_factor_ven` | `1.0` | systemic **venular** resistance target |
| `svr_factor_drug` | `1.0` | independent systemic-arteriolar channel owned by the Drugs model |
| `pvr_factor_art` | `1.0` | pulmonary **arteriolar** resistance target |
| `pvr_factor_ven` | `1.0` | pulmonary **venular** resistance target |

### Computed / reported (outputs)

| Property | Unit | Description |
|---|---|---|
| `total_blood_volume` | L | systemic + pulmonary + heart volume |
| `syst_blood_volume` | L | systemic vessels + coronaries |
| `pulm_blood_volume` | L | pulmonary vessels |
| `heart_blood_volume` | L | heart chambers |
| `syst_blood_volume_perc` | % | systemic share of total (0 when total = 0) |
| `pulm_blood_volume_perc` | % | pulmonary share of total |
| `heart_blood_volume_perc` | % | heart share of total |

### Local (internal)

`_bloodvessel_list`, `_systemic_bloodvessel_list`, `_pulmonary_bloodvessel_list` are flattened name
lists built in `init_model`. `prev_*` shadow each target so a change can be detected and applied as a
delta. `_update_interval` (0.015 s) / `_update_interval_slow` (1.0 s) throttle the two loops.

> Definition files may also carry stale `svr_factor`/`pvr_factor`/`prev_svr_factor`/`prev_pvr_factor`
> fields left over from an earlier single-factor scheme. The **current** source reads only the
> `*_art`/`*_ven` (and `*_drug`) factors above; the bare `svr_factor`/`pvr_factor` keys are ignored.

## Calculation cycle (`calc_model`)

Two throttled loops:

- **Fast (every 0.015 s)** — apply tone changes *only when an input changed* (each guarded by a
  `prev_*` comparison so the work is skipped when nothing moved):
  - `ans_activity` → written onto every vessel's `ans_activity`.
  - `svr_factor_art` / `svr_factor_ven` → `set_svr_factor_art` / `set_svr_factor_ven`.
  - `svr_factor_drug` → `set_svr_factor_drug`.
  - `pvr_factor_art` / `pvr_factor_ven` → `set_pvr_factor_art` / `set_pvr_factor_ven`.
- **Slow (every 1.0 s)** — `calc_blood_volumes()` tallies the volume distribution (throttled for
  performance, so `*_blood_volume*` lag fast transients by up to a second).

## Vascular tone: the `set_*_factor` methods

Resistance tone is applied through each vessel's **persistent** resistance factor `r_factor_ps` — the
layer that survives steps and accumulates contributions from several models (Circulation, ANS, Drugs,
Hormones). Because it is cumulative, Circulation applies the **delta** since the last call, not the
absolute value:

```
delta = new_factor − prev_factor
for each vessel in the group:  r_factor_ps += delta   (clamped at 0)
this.<factor> := new_factor
```

The delta is computed **once** so every vessel in the group receives the same change, and
`r_factor_ps` is clamped at 0 (a negative resistance factor is non-physical). The five methods differ
only in which list they drive:

| Method | Vessel list | Role |
|---|---|---|
| `set_svr_factor_art` | `systemic_arterioles` | systemic arteriolar resistance |
| `set_svr_factor_drug` | `systemic_arterioles` | independent drug channel (composes additively with art) |
| `set_svr_factor_ven` | `systemic_venules` | systemic venular resistance |
| `set_pvr_factor_art` | `pulmonary_arterioles` | pulmonary arteriolar resistance |
| `set_pvr_factor_ven` | `pulmonary_venules` | pulmonary venular resistance |

> Resistance tone is applied at the **arteriolar and venular** levels only — the dominant resistance
> sites — not on the large arteries/veins or capillaries. `ans_activity`, by contrast, is broadcast to
> *every* vessel in `_bloodvessel_list`.

## Blood-volume tally (`calc_blood_volumes`)

Sums `vol` over **enabled** members of each group:

```
syst_blood_volume  = Σ systemic vessels + Σ coronaries
pulm_blood_volume  = Σ pulmonary vessels
heart_blood_volume = Σ heart chambers
total_blood_volume = syst + pulm + heart
*_perc = 100 · part / total          (0 when total = 0)
```

Coronary volume is counted into the **systemic** total. Disabled models and missing names are skipped,
and the percentages are guarded against a zero total (NaN avoidance before the circulation fills).

## Example definition (JSON)

From `term_neonate.json` (lists trimmed for brevity):

```json
{
  "name": "Circulation",
  "description": "high level circulation model",
  "model_type": "Circulation",
  "is_enabled": true,
  "heart_chambers": ["LA", "RAIVCI", "RASVC", "RV", "LV"],
  "coronaries": ["COR"],
  "systemic_arteries": ["AA", "AAR", "AD"],
  "systemic_arterioles": ["INT_ART", "KID_ART", "LS_ART", "BR_ART"],
  "systemic_capillaries": ["INT_CAP", "KID_CAP", "LS_CAP", "BR_CAP"],
  "systemic_venules": ["INT_VEN", "KID_VEN", "LS_VEN", "BR_VEN"],
  "systemic_veins": ["IVCI", "SVC", "VLB", "VUB", "RLB", "RUB"],
  "pulmonary_arteries": ["PA", "PAAL", "PAAR"],
  "pulmonary_arterioles": ["LL_ART", "RL_ART"],
  "pulmonary_capillaries": ["LL_CAP", "RL_CAP"],
  "pulmonary_venules": ["LL_VEN", "RL_VEN"],
  "pulmonary_veins": ["PV", "PV_LA"],
  "ans_activity": 1.0,
  "svr_factor_art": 1.0,
  "svr_factor_ven": 1.0,
  "svr_factor_drug": 1.0,
  "pvr_factor_art": 1.0,
  "pvr_factor_ven": 1.0
}
```

## Usage in the model

- The **ANS** effector writes `Circulation.ans_activity`; Circulation fans it out to every
  `BloodVessel` so the per-vessel α-coupled vasoreactivity uses one shared activity level.
- The **Hormones** (RAAS/ADH) and **Drugs** models adjust `svr_factor_art` / `svr_factor_drug` /
  `pvr_factor_*` to raise or lower regional resistance; Circulation translates each target into a
  shared delta on the relevant `r_factor_ps`.
- `scaleModel`/`ModelScaler` does **not** go through Circulation — it writes the `*_scaling_ps` layer
  on each vessel directly. Circulation only ever touches `r_factor_ps`.
- The `*_blood_volume*` outputs feed monitoring/diagnostics (volume distribution between systemic,
  pulmonary and cardiac compartments).

See also [Respiration](./Respiration.md) (the respiratory-tree counterpart) and
[BloodVessel](./BloodVessel.md) (the per-vessel resistance/ANS coupling that Circulation drives).
