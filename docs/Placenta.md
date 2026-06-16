# Placenta

The `Placenta` model is a **coordinator** for the fetal placental circulation and gas exchange. Like
`Pda` and `Shunts`, it owns no physics of its own — it drives a set of pre-built sub-models (umbilical
and fetal-placental resistors, the maternal blood pool, and a blood-blood gas diffusor) from a single
set of parameters, and switches the whole unit on or off.

## What it models

Fetal blood leaves the descending aorta, runs through the umbilical arteries to the fetal side of the
placenta, exchanges O₂/CO₂ with maternal blood across the placental membrane, and returns via the
umbilical vein to the inferior vena cava.

```
DA ──[PL_UMB_ART]──► PL_FETAL_ART ─► PL_FETAL_CAP ─► PL_FETAL_VEN ──[PL_UMB_VEN]──► IVCI
                                          │
                                    [PL_GASEX: BloodDiffusor]
                                          │
                                       PL_MAT  (maternal pool, fixed composition)
```

| Reference | Model | Role |
|---|---|---|
| `_umb_art` / `_umb_ven` | `PL_UMB_ART` / `PL_UMB_VEN` | umbilical artery / vein resistors |
| `_plf_art` / `_plf_cap` / `_plf_ven` | `PL_FETAL_ART/CAP/VEN` | fetal-placental resistors |
| `_plm` | `PL_MAT` | maternal blood pool — a `fixed_composition` reservoir held at `mat_to2`/`mat_tco2` |
| `_gas_exchanger` | `PL_GASEX` | `BloodDiffusor` exchanging O₂/CO₂ between fetal capillary and maternal pool |

## Calculation cycle (`calc_model`)

Every `_update_interval` (0.015 s):

1. **Sync enabled state** — every sub-model's `is_enabled` is set to `placenta_running`. This runs on
   every tick (not only while running) so that *stopping* the placenta actually disables flow and gas
   exchange.
2. **Only while running:**
   - **Clamp** — set `no_flow = umb_clamped` on the umbilical and fetal resistors.
   - **Resistances** — `umb_art_res · factor`, `umb_ven_res · factor`, `plf_res · factor` onto the
     respective resistors.
   - **Maternal gases** — hold `PL_MAT.to2 = mat_to2`, `PL_MAT.tco2 = mat_tco2` (the maternal pool is
     `fixed_composition`, so the diffusor draws from it without depleting it).
   - **Diffusion constants** — push `dif_o2`, `dif_co2` to the gas exchanger.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `placenta_running` | master on/off (drives `is_enabled` of all sub-models) |
| `umb_clamped` | clamp the umbilical/fetal vessels (no flow) while running |
| `umb_art_res`, `umb_ven_res`, `plf_res` (+ `*_factor`) | resistances and their multipliers (mmHg·s/L) |
| `mat_to2`, `mat_tco2` | maternal total O₂ / CO₂ content (mmol/L) held on `PL_MAT` |
| `dif_o2`, `dif_co2` | diffusion constants for the placental gas exchanger (mmol/mmHg·s) |

(The umbilical-cord dimensional references in the source header document the physiological basis for
the default volumes/resistances.)

## Notes & caveats

- **Two independent off-switches.** `placenta_running = false` disables every sub-model (flow *and*
  gas exchange stop). `umb_clamped = true` stops flow only (via `no_flow`) while the placenta keeps
  running — useful to model cord occlusion with the unit otherwise intact.
- **Maternal pool is an infinite reservoir.** `PL_MAT` is `fixed_composition`, so the diffusor
  exchanges gases with it without changing its composition; the Placenta also re-asserts
  `mat_to2`/`mat_tco2` each tick.
- **`mat_to2`/`mat_tco2` are total contents (mmol/L), not partial pressures** — the gas exchange
  itself is partial-pressure driven inside `PL_GASEX`, which derives pCO₂/pO₂ from these contents.
- **Sub-model references are required.** They are the Placenta's own `components`; `calc_model` skips
  the tick if any is missing rather than dereferencing null.
- **The umbilical-vein → body return is an autonomous resistor under Placenta control.** The return
  segment `PL_UMB_VEN → IVCI` is the resistor `PL_UMB_VEN_IVCI`, declared as a standalone `Resistor`
  in the model definition — deliberately **not** an entry in `IVCI.inputs`. If it were an IVCI input,
  `IVCI` (a `BloodVessel`) would auto-create and co-manage it, re-asserting its `is_enabled`/`no_flow`
  every step and leaving it outside the placenta's two off-switches (a one-way leak of placental blood
  into the fetal IVC whenever the unit was stopped or clamped). As a free resistor, nothing else owns
  it: the `Placenta` resolves it by name in `init_model` (`_umb_ven_ret`) and drives its `is_enabled`
  (= `placenta_running`) and `no_flow` (= `umb_clamped`) alongside the rest of the unit. Its
  resistance is left at the scenario value, so running-unclamped hemodynamics are unchanged.
  **When wiring a new placenta scenario, connect the umbilical vein to the IVC with a standalone
  `PL_UMB_VEN_IVCI` resistor — do not add `PL_UMB_VEN` to `IVCI.inputs`,** or the off-switches break.
