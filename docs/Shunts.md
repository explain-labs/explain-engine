# Shunts

The `Shunts` model is a thin coordinator (like `Pda`) that drives the resistances of the **non-ductal
shunts** from a small set of geometric inputs. It does not hold volume or pressure itself — it owns no
sub-models but writes each step onto five pre-existing `Resistor`s.

It covers three shunt families:

| Shunt | Resistors driven | Path |
|---|---|---|
| **Foramen ovale (FO)** | `LA_RAIVCI`, `LA_RASVC` | LA ↔ the two right-atrial streams (RAIVCI, RASVC) |
| **Ventricular septal defect (VSD)** | `VSD` | LV ↔ RV |
| **Intrapulmonary shunts (IPS)** | `IPSL`, `IPSR` | arterial → venous within each lung (LL_ART→LL_VEN, RL_ART→RL_VEN) |

(The ductus arteriosus is handled separately by the `Pda` model.)

## What it models

The FO and VSD are openings whose resistance follows the **Hagen-Poiseuille** law from their diameter,
the septal thickness (length), and blood viscosity. `diameter_relative`-style closure is expressed
directly via `diameter_fo` / `diameter_vsd` (0 mm = closed → `no_flow`). The intrapulmonary shunts are
a small *fixed* resistance representing anatomic right-to-left lung shunting; they are **not**
diameter-driven.

## Calculation cycle (`calc_model`)

1. **Resolve references once.** `_resolve_refs()` caches `LA_RAIVCI`, `LA_RASVC`, `VSD`, `IPSL`,
   `IPSR`. If any is missing it logs a single warning and `calc_model` returns early every step (so a
   partial wiring degrades gracefully instead of throwing).
2. **Clamp diameters** to their `*_max`.
3. **Flow gating** — set `no_flow = (diameter === 0)` on the FO and VSD resistors.
4. **Resistances** — `res_fo`, `res_vsd` from `calc_resistance(diameter, septal_width, viscosity)`.
5. **Push resistances** to the resistors (see asymmetry below); IPS resistors get the constant
   `ips_res`.
6. **Read back flows** and compute orifice velocities (`Q/A`).

## Foramen ovale: flap-valve asymmetry and the split path

The FO is driven through **two** resistors (`LA_RAIVCI`, `LA_RASVC`) because the model splits the
right atrium into an IVC-stream and an SVC-stream. Each resistor receives:

```
r_for  = res_fo · fo_lr_factor      (LA → RA, restricted)
r_back = res_fo                     (RA → LA, easy)
```

`fo_lr_factor` (default 10, often higher in scenarios — e.g. 25) makes left-to-right flow much harder
than right-to-left, reproducing the **flap-valve** behaviour: in fetal/transitional physiology the FO
shunts right-to-left, and reverses only under raised left-atrial pressure.

> **Modelling note.** Because the FO is represented as two *parallel* resistors that each carry the
> full `res_fo`, the orifice's effective resistance is `res_fo / 2`. `velocity_fo` is therefore
> computed from the **combined** flow (`LA_RAIVCI.flow + LA_RASVC.flow`) over the single-orifice area
> from `diameter_fo`.

## Velocity outputs

```
area   = π · (diameter_mm · 1e-3 / 2)²          [m²]
velocity = (flow_L/s · 1e-3) / area             [m/s]   (0 when area = 0)
```

`velocity_fo` uses the summed FO flow; `velocity_vsd` uses the VSD flow.

## Resistance formula — `calc_resistance(diameter, length, viscosity)`

Standard Hagen-Poiseuille for a uniform cylinder:

```
R = (8 · μ · L) / (π · r⁴)        in Pa·s/m³   →  × 0.00000750062  →  mmHg·s/L
```

with diameter/length in mm and viscosity in cP. Returns the sentinel `1e8` (no flow) when
`diameter ≤ 0` or `length ≤ 0`. (This is a private copy of the same formula `Pda` uses.)

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `diameter_fo`, `diameter_fo_max` | foramen ovale diameter and ceiling (mm) |
| `diameter_vsd`, `diameter_vsd_max` | ventricular septal defect diameter and ceiling (mm) |
| `atrial_septal_width` | FO channel length (mm) |
| `ventricular_septal_width` | VSD channel length (mm) |
| `fo_lr_factor` | left-to-right resistance multiplier on the FO (flap valve) |
| `ips_res` | fixed intrapulmonary shunt resistance (mmHg·s/L) |
| `viscosity` | blood viscosity (cP) used in the resistance formula |

A healthy term neonate runs with `diameter_fo = 0` and `diameter_vsd = 0` (closed); congenital
scenarios open them.

## Notes & caveats

- **References resolve only once.** After the five resistors are cached, they are never re-resolved;
  a model added/removed at runtime would not be picked up. Missing wiring at first call is reported
  with a single console warning.
- **`viscosity` is a static input here** — unlike `Pda` (which pulls it from its capacitance each
  step), `Shunts.viscosity` is whatever the definition sets and does not track hematocrit.
- **IPS resistance is fixed.** `IPSL`/`IPSR` always receive `ips_res`; there is no diameter or
  flow-gating on them.
