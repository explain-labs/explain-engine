# Metabolism

The Metabolism model is the whole-body tissue **oxygen sink and CO₂ source**. Every model step it
removes oxygen from, and adds carbon dioxide to, a configured set of blood compartments, driving the
arterio-venous gas gradient that the rest of the circulation transports and the lungs/placenta clear.
It is the counterpart to gas exchange ([`GasExchanger`](./GasExchanger.md), `BloodDiffusor`):
exchange *loads* O₂ and *unloads* CO₂ at the lung/membrane; metabolism *unloads* O₂ and *loads* CO₂ at
the tissues.

## Inheritance

```
BaseModelClass
  └── Metabolism   (whole-body O₂ consumption / CO₂ production)
```

Metabolism extends `BaseModelClass` directly. It is a *process* model: it holds no compartment of its
own and instead writes `to2`/`tco2` onto the blood compartments named in `metabolic_active_models`.

## What it models

A single whole-body oxygen consumption `vo2` (ml O₂ / kg / min) is distributed across several blood
compartments according to a per-compartment **fractional oxygen use** `fvo2`. CO₂ production follows
from the **respiratory quotient** `resp_q` (CO₂ produced / O₂ consumed). Temperature dependence is
applied through a Q10 factor (`vo2_temp_factor`) owned by [`Thermoregulation`](./Thermoregulation.md).

```
vo2 (ml/kg/min) ──split by fvo2──► per-compartment O₂ draw ──×resp_q──► per-compartment CO₂ release
```

## Properties

### Configuration (independent)

| Property | Unit | Description |
|---|---|---|
| `met_active` | bool | Master on/off switch; when false `calc_model` returns immediately |
| `vo2` | ml/kg/min | Whole-body oxygen consumption |
| `vo2_factor` | unitless | External multiplier on VO₂ (set by other models / interventions); `1.0` = no effect |
| `vo2_temp_factor` | unitless | Q10 temperature multiplier on VO₂, written by [`Thermoregulation`](./Thermoregulation.md); `1.0` at 37 °C / when that model is absent or disabled |
| `resp_q` | unitless | Respiratory quotient (CO₂ produced / O₂ consumed), typically ~0.8 |
| `metabolic_active_models` | object | `{ compartmentName: fvo2 }` — where O₂ is consumed and CO₂ produced; `fvo2` are fractions of the whole-body VO₂ and should sum to ≈ 1.0 |

### Computed / internal

Metabolism publishes no dependent read-out properties; its only outputs are the mutations it writes
to each target compartment's `to2` and `tco2`. The per-step O₂ draw `vo2_step` is a local variable
recomputed each step (not stored on the instance).

## Q10 temperature dependence

`vo2_temp_factor` is a **persistent channel written by `Thermoregulation`** (it is not reset each
step like a non-persistent factor). It encodes the Q10 rule — metabolic rate rises/falls with body
temperature — and multiplies into `vo2_step` alongside `vo2_factor`. It defaults to `1.0`, which is
its value at 37 °C and whenever the `Thermoregulation` model is absent or disabled, so a scenario
without thermoregulation is unaffected.

## Step calculation (`calc_model`)

Runs every model step when `met_active` is true.

1. **Whole-body O₂ use for this step**, converted ml → mmol and per-minute → per-step:

   ```
   vo2_step = (0.039 · vo2 · vo2_factor · vo2_temp_factor · weight) / 60 · Δt        [mmol]
   ```

   - `0.039` mmol/ml is the O₂ molar density at 37 °C, 1 atm (≈ 1 / 25.4 L·mol⁻¹).
   - `weight` is the engine body weight (kg); `Δt` (`this._t`) is the model step size.

2. **For each entry in `metabolic_active_models` (`{ compartment: fvo2 }`):**
   - Resolve the compartment. If it is a `MicroVascularUnit`, metabolism is applied to its capillary
     sub-compartment `<name>_CAP` instead (tissue gas exchange happens in the capillary).
   - Skip silently (via `continue`) if the compartment is missing or its volume is ≤ 0, so the
     remaining compartments are still processed.
   - O₂ removed and CO₂ added this step (distributed by `fvo2`):

     ```
     dto2  = vo2_step · fvo2
     dtco2 = vo2_step · fvo2 · resp_q
     to2  := max(0, (to2·vol − dto2) / vol)
     tco2 :=        (tco2·vol + dtco2) / vol
     ```

     A fixed amount of O₂/CO₂ is exchanged with the compartment's blood volume; the new concentration
     follows from the compartment volume. `to2` is floored at 0 so a compartment cannot go O₂-negative.

`set_metabolic_active_model(site, new_fvo2)` adds or updates one site's fraction at runtime.

## Notes & caveats

- **`fvo2` should sum to ~1.0.** If the configured fractions sum to more (or less) than 1, the
  effective whole-body VO₂ is correspondingly higher (or lower) than the `vo2` setting — a definition
  concern, not enforced by the model.
- **O₂ floor breaks strict conservation.** When `to2` would go negative it is clamped to 0, but the
  matching CO₂ is still produced in full. At physiological gradients this never triggers; under
  extreme O₂ debt it would slightly over-produce CO₂. Anaerobic metabolism is not modelled here — see
  [`Lactate`](./Lactate.md), which captures the same O₂ debt as lactate production.
- **Empty / missing compartments are skipped** (volume ≤ 0 or an unresolved name) so they neither
  divide by zero nor halt processing of the remaining compartments.

## Example definition (JSON)

From `term_neonate.json`:

```json
{
  "name": "Metabolism",
  "description": "Metabolism model",
  "is_enabled": true,
  "model_type": "Metabolism",
  "components": {},
  "met_active": true,
  "vo2": 8.1,
  "vo2_factor": 1,
  "vo2_temp_factor": 1.0,
  "resp_q": 0.8,
  "metabolic_active_models": {
    "RLB": 0.15,
    "INT_CAP": 0.15,
    "LS_CAP": 0.1,
    "KID_CAP": 0.1,
    "RUB": 0.1,
    "AA": 0.005,
    "AD": 0.01,
    "BR_CAP": 0.453
  }
}
```

Here the whole-body VO₂ of 8.1 ml/kg/min is spread over the brain capillary `BR_CAP` (0.453, the
largest sink), lower/upper body (`RLB`/`RUB`), gut/liver/kidney capillaries (`INT_CAP`/`LS_CAP`/
`KID_CAP`), and small fractions on the aortic compartments `AA`/`AD`. (The adult `adult_female.json`
scenario uses `vo2: 3.5` with a slightly different split.)

## Usage in the model

- One Metabolism instance per scenario; it is the sole driver of resting tissue O₂ extraction and CO₂
  generation, and thus of the venous desaturation that gas exchange must reverse.
- [`Lactate`](./Lactate.md) reuses Metabolism's `metabolic_active_models` map and `vo2`/`vo2_factor`/
  `vo2_temp_factor` to compute hypoxia-driven lactate, and must be inserted in the scenario `models`
  map immediately after Metabolism.
- [`Thermoregulation`](./Thermoregulation.md) modulates consumption by writing `vo2_temp_factor`.
- The myocardium has its own dedicated balance, [`Mob`](./Mob.md); the heart is therefore not listed
  in `metabolic_active_models`.
