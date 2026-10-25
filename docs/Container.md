# Container

A `Container` is an elastic compartment that encloses other compartments. Its volume is the sum of what it contains, and its pressure is added to the outside pressure of every compartment inside it. The model uses it for the thorax and the pericardium.

## Physiology

The heart and lungs don't sit in open space. The lungs, the great vessels and the heart sit inside the chest (the *thorax*), and the heart sits inside its own sac (the *pericardium*). The pressure in these spaces acts on everything inside:

- **Thorax.** When the breathing muscles contract, the pressure in the chest falls below atmospheric. That suction expands the lungs and draws blood into the intrathoracic veins and the right heart. Chest compressions and positive-pressure ventilation raise the same pressure.
- **Pericardium.** At normal filling the pericardium is slack and doesn't squeeze the heart. Once the heart (or fluid in the sac) fills it beyond its reserve, the sac becomes very stiff very quickly (a J-shaped pressure–volume curve). It then limits filling of all four chambers together. That is the mechanism of **cardiac tamponade** and pericardial constraint.

Containers nest: the pericardium sits inside the thorax, so a fall in chest pressure reaches the heart chambers through both.

## Inheritance

```
BaseModelClass
  └── Container
```

`Container` extends `BaseModelClass` directly, not `Capacitance`. It repeats the `u_vol`/`el_base`/`el_k` elastance machinery and factor layers, but it holds no fluid, so nothing flows into or out of it.

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `u_vol` | L | 0.0 | Unstressed volume: below it the container exerts no recoil. For the pericardium this is the reserve volume. |
| `el_base` | mmHg/L | 0.0 | Linear elastance. |
| `el_k` | mmHg/L² | 0.0 | Non-linear elastance; acts only above `u_vol`. Volumes are in litres, so 10 mL of stretch is 0.01 L and `el_k` = 10⁵ gives 10 mmHg. |
| `vol_extra` | L | 0.0 | Volume added to the contained sum, e.g. pericardial fluid (written by `Heart` from `pc_extra_volume`). |
| `contained_components` | string[] | `[]` | Names of the enclosed models. |
| `u_vol_factor`, `el_base_factor`, `el_k_factor` | – | 1.0 | Non-persistent factors, reset to 1 every step. |
| `u_vol_factor_ps`, `el_base_factor_ps`, `el_k_factor_ps` | – | 1.0 | Persistent factors. |
| `u_vol_factor_scaling_ps`, `el_base_factor_scaling_ps`, `el_k_factor_scaling_ps` | – | 1.0 | Persistent scaling factors (`ModelScaler`). |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `vol` | L | 0.0 | `vol_extra` + the volumes of the enabled contained models. |
| `pres_in` | mmHg | 0.0 | Recoil pressure of the container wall. |
| `pres` | mmHg | 0.0 | `pres_in + pres_ext`: the pressure passed to the contents. |
| `el_eff`, `el_k_eff`, `u_vol_eff` | as above | 0.0 | Effective values after the factor layers. |

### Set by other models

| Property | Unit | Default | Description |
|---|---|---|---|
| `pres_ext` | mmHg | 0.0 | External pressure for this step, reset to 0 after use. Written by: `Breathing` (muscle pressure, subtracted from THORAX), `Resuscitation` (chest compressions, added to THORAX), the THORAX on the PERICARDIUM (its own `pres`). |

## Calculation

`calc_model()` runs `calc_elastances()` → `calc_volumes()` → `calc_pressure()`.

1. **`calc_elastances`**: `el_eff` and `el_k_eff` from the base value and the three factor layers, composed additively (see [Factor system](#factor-system)). Then the non-persistent factors are reset.
2. **`calc_volumes`**:

   ```
   vol       = vol_extra + Σ vol of the contained models that exist and are enabled
   u_vol_eff = u_vol · (additive factor layers)
   ```

3. **`calc_pressure`**, with `S = vol − u_vol_eff`:

   ```
   pres_in = (S > 0 ? el_k_eff · S² : 0) + el_eff · S
   pres    = pres_in + pres_ext
   for every contained model that exists and is enabled:  model.pres_ext += pres
   pres_ext = 0
   ```

   The non-linear term only acts on a stretched container, because `S²` is also positive below `u_vol`, where it would push the wrong way: a slack pericardium must not squeeze an under-filled heart. The contained models add their `pres_ext` to their own pressure and reset it in their own `calc_pressure`, so the contributions don't accumulate.

**Step order and lag.** Each model steps once per step, in insertion order (see [BaseModelClass](./BaseModelClass.md#composite-models-components)). In the shipped scenarios the order is: `Breathing` → heart chambers → `PERICARDIUM` → lungs and vessels → `THORAX`. So:
- the lungs and intrathoracic vessels feel the thorax pressure **one step** late;
- the heart chambers feel it **two steps** late (through the pericardium);
- the chambers feel the pericardial pressure one step late.

At the 0.5 ms step size this is 0.5–1 ms, negligible against a 400 ms heartbeat.

## Factor system

`u_vol`, `el_base` and `el_k` carry the three layers (`_factor`, `_factor_ps`, `_factor_scaling_ps`) and compose **additively**, as in [`Capacitance`](./Capacitance.md):

```
p_eff = p + (factor − 1)·p + (factor_ps − 1)·p + (factor_scaling_ps − 1)·p
```

The only model that writes a factor is `Heart`: its `pc_el_factor` (pericardial stiffness) moves `PERICARDIUM.el_base_factor_ps` and `el_k_factor_ps` together. See [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

## Inputs and outputs

- **Reads:** `vol` and `is_enabled` of each contained model.
- **Writes:** `pres_ext` of each contained model, every step.
- **Written by:**
  - `Breathing` and `Resuscitation` (THORAX `pres_ext`);
  - `Heart` (PERICARDIUM `vol_extra` from `pc_extra_volume`, and the stiffness factors from `pc_el_factor`);
  - `ModelScaler` (scaling factors).
- **Read by:** `Breathing` (THORAX elastance, to size the respiratory effort), `DataCollector` watchers.

## Assumptions and limitations

- **Uniform pressure.** The whole container has one pressure. Regional differences (e.g. pleural pressure gradients from apex to base) aren't modelled.
- **Membership is by name.** Missing or disabled members are skipped for both the volume and the pressure. Skipping disabled members also stops a disabled compartment, which never resets its `pres_ext`, from accumulating pressure.
- **Pericardium calibration** (`scripts/_fix_pericardium.mjs`):
  - `u_vol` is 1.15 × the maximal (end-diastolic) heart volume at rest, so the pericardium is slack at rest (term: 30.7 mL in it against 35.2 mL).
  - `el_k` gives +10 mmHg at 10 mL beyond that reserve (10⁵ mmHg/L²).
  - `el_base` is 0.
  - So `pc_el_factor` has no effect at rest and only acts once the pericardium is stretched (e.g. by `pc_extra_volume`).
- **The pericardial wall scales with the heart.** `el_k` = 10⁵ mmHg/L² × (35.2 mL / reserve)² (`scripts/_scale_pericardium.mjs`), so every scenario gets the same pressure for the same fractional stretch beyond its reserve: from 10⁵ at term to 2.6·10⁶ at 25 weeks. An effusion of 50 % of the reserve lowers LVO by 10 % at term and 6–7 % at 25–28 weeks.
- **The thorax elastance** (`el_base` 50 mmHg/L term, 150 at 25 weeks) represents the chest wall. Its `u_vol` and `el_base` are scenario-calibrated values.

## Example definition (JSON)

From `term_neonate.json`, `models.Heart.components.PERICARDIUM` (trimmed to the config props):

```json
{
  "name": "PERICARDIUM",
  "model_type": "Container",
  "is_enabled": true,
  "u_vol": 0.03525,
  "el_base": 0,
  "el_k": 100000,
  "vol_extra": 0,
  "contained_components": ["RAIVCI", "RASVC", "RV", "LA", "LV", "COR"]
}
```

## Usage in the scenarios

term_neonate has two containers:

| Instance | Owner | Contains | Role |
|---|---|---|---|
| `THORAX` | `Respiration` | `ALL`, `ALR` (lungs), `PERICARDIUM`, `AA`, `AAR`, `PA`, `PAAL`, `PAAR`, `PV`, `IVCI`, `SVC`, lung arteries/capillaries/veins (`LL_*`, `RL_*`) | Chest wall and pleural pressure; target of the breathing muscles and of chest compressions. |
| `PERICARDIUM` | `Heart` | `RAIVCI`, `RASVC`, `RV`, `LA`, `LV`, `COR` | Pericardial constraint and tamponade. |

## References

No literature-derived values in this class. The pericardial reserve and wall stiffness are calibration choices documented in `scripts/_fix_pericardium.mjs`.
