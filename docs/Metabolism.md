# Metabolism

The Metabolism model is the tissue **oxygen sink and CO₂ source**. Every step it removes oxygen from
and adds carbon dioxide to a configured set of blood compartments, driving the arterio-venous gas
gradient that the rest of the circulation transports and the lungs/placenta clear.

It is the counterpart to gas exchange (`GasExchanger`, `BloodDiffusor`): exchange *loads* O₂ and
*unloads* CO₂ at the lung/membrane; metabolism *unloads* O₂ and *loads* CO₂ at the tissues.

## What it models

A single whole-body oxygen consumption `vo2` (ml O₂ / kg / min) is distributed across several blood
compartments according to a per-compartment **fractional oxygen use** `fvo2`. CO₂ production follows
from the **respiratory quotient** `resp_q` (CO₂ produced / O₂ consumed).

```
vo2 (ml/kg/min)  ──split by fvo2──►  per-compartment O₂ draw  ──×resp_q──►  per-compartment CO₂ release
```

## Step calculation (`calc_model`)

Runs every model step when `met_active` is true.

1. **Whole-body O₂ use for this step**, converted ml → mmol and per-minute → per-step:
   ```
   vo2_step = (0.039 · vo2 · vo2_factor · weight) / 60 · Δt        [mmol]
   ```
   - `0.039` mmol/ml is the O₂ molar density at 37 °C, 1 atm (≈ 1 / 25.4 L·mol⁻¹).
   - `weight` is the engine body weight (kg); `vo2_factor` lets other models (e.g. MOB, temperature)
     scale consumption; `Δt` is the model step size.

2. **For each entry in `metabolic_active_models` (`{ compartment: fvo2 }`):**
   - Resolve the compartment. If it is a `MicroVascularUnit`, metabolism is applied to its
     capillary sub-compartment `<name>_CAP` instead (gas exchange with tissue happens there).
   - O₂ removed and CO₂ added this step:
     ```
     dto2  = vo2_step · fvo2
     dtco2 = vo2_step · fvo2 · resp_q
     to2  := max(0, (to2·vol − dto2) / vol)
     tco2 :=        (tco2·vol + dtco2) / vol
     ```
     i.e. a fixed amount of O₂/CO₂ is exchanged with the compartment's blood volume; the new
     concentration follows from the compartment volume. `to2` is floored at 0 so a compartment cannot
     go O₂-negative.

`fvo2` are meant to be **fractions of the whole-body VO₂** and should sum to ≈ 1.0 across all entries.

## Configuration (model-definition fields)

| Field | Meaning |
|---|---|
| `met_active` | master on/off switch |
| `vo2` | whole-body O₂ consumption (ml/kg/min) |
| `vo2_factor` | external multiplier on VO₂ (set by other models) |
| `resp_q` | respiratory quotient (CO₂/O₂), typically ~0.8 |
| `metabolic_active_models` | `{ compartmentName: fvo2 }` — where O₂ is consumed and CO₂ produced |

`set_metabolic_active_model(site, new_fvo2)` adds/updates one site's fraction at runtime.

Example (term neonate): `vo2 = 8.1`, `resp_q = 0.8`, with `fvo2` spread over `BR_CAP` (0.453,
brain — the largest sink), `RLB`/`RUB` (lower/upper body), `INT_CAP`, `LS_CAP`, `KID_CAP`, and small
fractions on `AA`/`AD`.

## Notes & caveats

- **`fvo2` should sum to ~1.0.** If the configured fractions sum to more (or less) than 1, the
  effective whole-body VO₂ is correspondingly higher (or lower) than the `vo2` setting — this is a
  definition concern, not enforced by the model.
- **O₂ floor breaks strict conservation.** When `to2` would go negative it is clamped to 0, but the
  matching CO₂ is still produced in full. At physiological gradients this never triggers; under
  extreme O₂ debt it would slightly over-produce CO₂ (a simplification — anaerobic metabolism is not
  modelled).
- **Empty / missing compartments are skipped** (volume ≤ 0 or an unresolved name) so they neither
  divide by zero nor halt processing of the remaining compartments.
