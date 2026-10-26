# HeartValve

A `HeartValve` is a [`Resistor`](./Resistor.md) under its own `model_type`. It adds no code: the valve behaviour comes from its configuration (`no_back_flow: true`). The type is a label that marks the heart valves in a scenario.

```js
export class HeartValve extends Resistor {
  static model_type = "HeartValve";
}
```

## Physiology

The four heart valves keep blood moving one way: tricuspid (right atrium → right ventricle), pulmonary (right ventricle → pulmonary artery), mitral (left atrium → left ventricle) and aortic (left ventricle → aorta). A valve opens when the pressure upstream exceeds the pressure downstream and closes as soon as it reverses.

In Explain a valve is an ideal one-way resistance:
- It opens and closes instantly at zero pressure difference.
- It never leaks.
- Its small forward resistance gives a pressure drop proportional to flow.

That is why the valves set the timing of the cardiac cycle: the moments the mitral and aortic valves open and close divide the beat into filling, isovolumic contraction, ejection and isovolumic relaxation. `Heart` uses exactly those moments (the mitral and aortic flows starting and stopping) to measure end-diastolic and end-systolic volumes.

Valve disease is set up through configuration:
- **Atresia:** `no_flow: true`, or the valve disabled.
- **Regurgitation:** `no_back_flow: false` with a finite `r_back`.
- **Stenosis:** a higher `r_for`, or the turbulent `r_k`.

## Inheritance

```
BaseModelClass
  └── Resistor
        └── HeartValve
```

## Properties

All props and their defaults are `Resistor`'s: see [Resistor → Properties](./Resistor.md#properties). The ones that make a resistor a valve:

| Property | Typical value | Role |
|---|---|---|
| `no_back_flow` | `true` | One-way: no flow when the downstream pressure is higher. |
| `r_for` | 55 mmHg·s/L | Forward resistance of the open valve (all valves, all scenarios; to be retuned, see [limitations](#assumptions-and-limitations)). |
| `r_back` | 55 mmHg·s/L | Only acts if `no_back_flow` is turned off (regurgitation). |
| `no_flow` / `is_enabled` | `false` / `true` | Atresia, or an alternative connection switched off. |
| `implicit` | `true` on the outflow valves `LV_AA`, `RV_AA` | Stable flow into the stiff aorta (see [Resistor](./Resistor.md#implicit-flow-implicit)). |

## Calculation

Exactly [`Resistor`'s](./Resistor.md#calculation): forward flow `Δp / r_for_eff` (or the turbulent solve when `r_k > 0`); no flow backward while `no_back_flow`. Flow, volume transfer and composition mixing happen as in any resistor.

## Factor system

`Resistor`'s additive `r_factor` layers (see [Resistor → Factor system](./Resistor.md#factor-system)). No model writes them on the valves in the shipped scenarios.

## Inputs and outputs

- **Reads / writes:** the pressures of the two chambers or vessels it joins; their volumes and composition (as any resistor).
- **Read by:** `Heart` (`LA_LV` and the active LV outflow valve: their flow starting and stopping marks end-diastole and end-systole for the per-beat analysis), `Monitor` and `DataCollector` watchers.
- **Written by:** the scenario generators for congenital lesions (`no_flow`, `is_enabled`, `no_back_flow`, `r_back`; e.g. `_make_dtga.mjs`, `_make_hlhs.mjs`, `_make_ta.mjs`, `_make_paivs.mjs`).

## Assumptions and limitations

- **Ideal valves.** Instant opening and closing, no leaflet dynamics, no closing backflow, no regurgitation unless configured.
- **One resistance for every valve, and too high at term.** All valves have `r_for` 55 mmHg·s/L in all scenarios. At term that gives peak open-valve gradients of mitral 7.8, aortic 7.1, tricuspid 5.3 and pulmonary 4.7 mmHg. Normal neonatal velocities (about 0.5–0.7 m/s across the atrioventricular valves, 0.8–1.0 m/s across the outflow valves; ΔP ≈ 4v²) suggest roughly 1–2 and 3–4 mmHg. In the 1 kg preterm the gradients are 1.4–5.3 mmHg. A linear resistance also gives a gradient proportional to flow, where a real valve's grows with flow². The valve resistances are to be retuned per scenario in the scenario re-validation session.
- **The type is a label.** The UI shows the same fields for `HeartValve` and `Resistor`. Nothing in the engine branches on the type.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Heart.components.LV_AA` (trimmed to the config props):

```json
{
  "name": "LV_AA",
  "model_type": "HeartValve",
  "is_enabled": true,
  "comp_from": "LV",
  "comp_to": "AA",
  "r_for": 55,
  "r_back": 55,
  "r_k": 0,
  "no_flow": false,
  "no_back_flow": true,
  "implicit": true
}
```

## Usage in the scenarios

Seven valves in term_neonate_72h, all owned by `Heart`:

| Valve | Connection | State |
|---|---|---|
| Tricuspid | `RAIVCI_RV`, `RASVC_RV` (one per right-atrial half) | enabled |
| Mitral | `LA_LV` | enabled |
| Pulmonary | `RV_PA` | enabled |
| Aortic | `LV_AA` | enabled, implicit |
| Alternative outflows | `RV_AA`, `LV_PA` | disabled; switched on by the transposition generator (`_make_dtga.mjs`) |

## References

No literature-derived values. The valve resistance is a scenario parameter.
