# Blood

The `Blood` model is a **manager**, not a compartment. It seeds the circulating blood properties onto
every blood-containing compartment at build, exposes setters to change them at runtime, and
periodically samples representative compartments to publish arterial/venous blood gases.

## What it does

- **Bootstrap (`init_model`).** For every model whose type is in `blood_containing_modeltypes`
  (`BloodVessel`, `HeartChamber`, `BloodCapacitance`, `BloodTimeVaryingElastance`, `BloodPump`,
  `MicroVascularUnit`): propagate the Haldane coefficient, and — **only for freshly-constructed
  compartments (empty solutes)** — copy the reference `to2`, `tco2`, `solutes`, `temp` and
  `viscosity`. Guarding on empty solutes (rather than `to2/tco2 == 0`) preserves a restored saved
  state, where compartments already carry their own composition.
- **Publish blood gases (`calc_model`, every 1 s).** Run `calc_blood_composition` on the ascending
  aorta (`AA`, pre-ductal), descending aorta (`AD`, post-ductal) and the venae cavae (`IVCI`, `SVC`),
  and copy `ph`/`pco2`/`po2`/`hco3`/`be`/`so2` into `preductal_art_bloodgas`, `art_bloodgas` and the
  venous read-outs.

## Setters

`set_temperature`, `set_viscosity`, `set_haldane_coeff`, `set_to2`, `set_tco2`, `set_solute` — each
applies to all blood compartments (or a single named site). They update the corresponding property on
the compartments; `set_solute` (no site) sets the requested solute on every compartment and on the
reference.

## Configuration (model-definition fields)

`viscosity`, `temp`, `to2`, `tco2`, `solutes` (the circulating solute set), `P50_0` (O₂-haemoglobin
P50 baseline), `haldane_coeff` (Haldane-effect strength, 0 = off).

## Notes

- The actual gas chemistry lives in [`BloodComposition`](./BloodComposition.md); `Blood` only sets the
  inputs and reads the outputs.
- The reference `to2`/`tco2` are seeds; after build the simulation uses the per-compartment values
  (updated by flow mixing, diffusion and metabolism).
