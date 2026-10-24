# Capacitance

A `Capacitance` is the basic elastic compartment of the engine: it holds a volume and turns the volume above its unstressed volume into a pressure. Every blood and gas compartment is built on it. It is also the reference implementation of the additive [factor pattern](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

## Physiology

A blood vessel, a heart chamber at rest, or an air space in the lung each behave like an elastic bag:

- **Unstressed volume.** Up to a certain volume the wall is slack, and filling it costs no pressure. In veins this is most of the blood they hold; it is the reserve the body mobilises by venoconstriction.
- **Elastance.** Above the unstressed volume, every extra millilitre raises the pressure. The stiffer the wall, the higher the *elastance* (mmHg per litre). Elastance is the inverse of *compliance*.
- **Stiffening.** Many walls get stiffer as they are stretched further (arteries at high pressure, a full pericardium). An optional non-linear term models this.

Blood or gas moves between compartments only through separate connectors (`Resistor`s). A Capacitance on its own just stores volume and reports a pressure.

## Inheritance

```
BaseModelClass
  └── Capacitance
        ├── BloodCapacitance      (+ blood composition mixing)
        │     └── BloodVessel     (+ own resistance, ANS; composes its factors multiplicatively)
        └── GasCapacitance        (+ gas composition, atmospheric pressure, humidity, heat)
```

`Container` and `TimeVaryingElastance` repeat the same elastance code but extend `BaseModelClass` directly.

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `u_vol` | L | 0.0 | Unstressed volume: the pressure from the wall is zero at this volume. |
| `el_base` | mmHg/L | 0.0 | Linear elastance (1 / compliance). |
| `el_k` | mmHg/L² | 0.0 | Non-linear elastance; adds `el_k·(vol − u_vol)²` above the unstressed volume only. 0 in most compartments. |
| `fixed_composition` | boolean | `false` | `true` makes the compartment an infinite reservoir: `volume_in`/`volume_out` don't change `vol` (and the subclasses don't mix its composition). |
| `vol` | L | 0.0 | Volume. Set in the definition as the starting volume, then changed by the connected resistors. |
| `u_vol_factor`, `el_base_factor`, `el_k_factor` | – | 1.0 | Non-persistent factors, reset to 1 every step. |
| `u_vol_factor_ps`, `el_base_factor_ps`, `el_k_factor_ps` | – | 1.0 | Persistent factors. |
| `u_vol_factor_scaling_ps`, `el_base_factor_scaling_ps`, `el_k_factor_scaling_ps` | – | 1.0 | Persistent scaling factors. |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `pres_in` | mmHg | 0.0 | Recoil pressure of the wall. |
| `pres` | mmHg | 0.0 | Total pressure: `pres_in + pres_ext`. This is what the resistors read. |
| `el_eff`, `el_k_eff` | mmHg/L, mmHg/L² | 0.0 | Effective elastances after the factor layers. |
| `u_vol_eff` | L | 0.0 | Effective unstressed volume after the factor layers, floored at 0. |

### Set by other models

| Property | Unit | Default | Description |
|---|---|---|---|
| `pres_ext` | mmHg | 0.0 | External pressure for this step, reset to 0 after use. Written by a [`Container`](./Container.md) (thorax, pericardium) on its members, and by `Resuscitation` on its targets. A saved state carries the last step's value, which acts once on the first step. |

## Calculation

`calc_model()` runs `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

1. **`calc_elastances`**
   ```
   el_eff   = el_base · (1 + (el_base_factor − 1) + (el_base_factor_ps − 1) + (el_base_factor_scaling_ps − 1))
   el_k_eff = el_k    · (1 + (el_k_factor − 1)    + (el_k_factor_ps − 1)    + (el_k_factor_scaling_ps − 1))
   ```
   then `el_base_factor` and `el_k_factor` are reset to 1.
2. **`calc_volumes`**
   ```
   u_vol_eff = max(0, u_vol · (1 + (u_vol_factor − 1) + (u_vol_factor_ps − 1) + (u_vol_factor_scaling_ps − 1)))
   ```
   then `u_vol_factor` is reset to 1. The floor exists because the layers add: two writers lowering them at once (Surfactant derecruitment and atelectasis on the same lung) could otherwise give a negative unstressed volume.
3. **`calc_pressure`**, with `S = vol − u_vol_eff`:
   ```
   pres_in = (S > 0 ? el_k_eff · S² : 0) + el_eff · S
   pres    = pres_in + pres_ext
   pres_ext = 0
   ```
   The non-linear term acts only above the unstressed volume. `S²` is also positive below it, where it would push against the linear term and bend the curve back up. For example, the term_neonate aorta (`el_k` 1.5·10⁶) emptied 6 mL below `u_vol` would read about +13 mmHg instead of −41 mmHg. Both terms are 0 and flat at `S = 0`, so the curve is smooth there.

**Volume transfer.** The connected resistors call these after computing a flow:

- **`volume_in(dvol)`** adds `dvol` to `vol`, unless `fixed_composition`. Blood and gas subclasses extend it to mix the incoming composition.
- **`volume_out(dvol)`** removes `dvol` from `vol`, unless `fixed_composition`. If that would make `vol` negative, `vol` is set to 0 and the amount that could not be removed is returned. The resistor then delivers only what was really available, so volume is conserved and never created from an empty compartment.

## Factor system

`u_vol`, `el_base` and `el_k` each carry three layers, composed **additively** against the base (see [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern)). Who writes them in the current code:

| Layer | Writers |
|---|---|
| `_factor` (reset every step) | `Surfactant` (lung `u_vol`/`el_base`); `BloodVessel` and `HeartChamber` internally |
| `_factor_ps` | `Respiration` (`set_el_lung_factor`, thorax elastance, lung `u_vol`); `Heart` (pericardium); the `Calibrator`; the user and scenarios via `setPropValue` |
| `_factor_scaling_ps` | `ModelScaler`; `Uterus` (uterine vessel `u_vol`, pregnancy) |

`BloodVessel` overrides this composition and multiplies its layers (plus the ANS terms); `HeartChamber` adds drug, load and ANS terms. Check those pages before relying on the additive rule for them.

## Inputs and outputs

- **Reads:** nothing from other models; only its own props and `pres_ext`.
- **Written by:**
  - the connected `Resistor`s (`volume_in`/`volume_out`);
  - `Container`s and `Resuscitation` (`pres_ext`);
  - the factor writers above.
- **Read by:** every `Resistor` connected to it (`pres`), `Container`s (`vol`), `Breathing`, `Monitor`, `DataCollector` watchers, and the subclasses.

## Assumptions and limitations

- **Linear below the unstressed volume.** Below `u_vol` the pressure goes negative along the same linear elastance. Real veins collapse there instead, with a small negative pressure and a rising resistance. The model has no collapse behaviour.
- **Lumped compartment.** One pressure per compartment: no wave propagation, no spatial gradients.
- **Explicit volume update.** Pressure is computed from the volume at the start of the step. Very stiff compartments joined by very low resistances can make the explicit step unstable; `Resistor.implicit` handles this for the aorta (see [Resistor](./Resistor.md)).
- **No visco-elasticity.** The wall responds instantly; there is no stress relaxation or hysteresis.

## Example definition (JSON)

No scenario uses a plain `Capacitance`; every compartment is a subclass. These are the props this class contributes, from `term_neonate.json`, `models.PV` (a `BloodVessel`, trimmed to the Capacitance props):

```json
{
  "name": "PV",
  "model_type": "BloodVessel",
  "vol": 0.01035,
  "u_vol": 0.00815,
  "el_base": 4507.3,
  "el_k": 0,
  "fixed_composition": false
}
```

## Usage in the scenarios

Through its subclasses it is every compartment that holds blood or gas: in term_neonate 39 `BloodVessel`s, 10 `GasCapacitance`s and 3 `BloodCapacitance`s. Six of these are `fixed_composition` reservoirs:
- `MOUTH` (room air);
- `VENT_GASIN` and `VENT_GASOUT` (ventilator supply and exhaust);
- `ECLS_GAS_SOURCE` and `ECLS_GAS_OUT` (sweep gas);
- `PL_MAT` (maternal blood).

## References

No literature-derived values in this class: it is the standard lumped-compliance (Windkessel) element. The elastance and unstressed-volume values are scenario parameters, documented with the scenarios ([`TermNeonateReference`](./TermNeonateReference.md) and the other `*Reference.md` pages).
