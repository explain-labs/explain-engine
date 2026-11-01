# Interstitium

`Interstitium` is the extracellular fluid outside the blood: one well-mixed pool, filled by Starling filtration from the systemic capillary beds and drained by lymph back into the veins. It holds no blood: the pool is plain state (volume, solutes, albumin), so it stays out of the blood-pool loops (warming, lactate clearance, glucose, drugs, the [Circulation](./Circulation.md) volume sums). It is neutral at rest: filtration equals lymph flow, so a scenario behaves the same with or without it until the blood volume or the plasma albumin changes.

## Physiology

- **Starling filtration.** Across each capillary wall, water moves with the hydrostatic pressure difference (capillary − interstitial) minus the reflected oncotic pressure difference (plasma − interstitial). The filtration coefficient Kf sets how much flows per mmHg.
- **The interstitium** is a large, compliant space (about 0.36 L/kg in the newborn, ECF minus plasma). Above its resting volume it swells easily; below it, it is stiff, so a dehydrated interstitium gives up little fluid.
- **Lymph** returns the filtrate and the leaked albumin to the veins (the thoracic duct into the subclavian vein). It rises with the interstitial pressure and falls when the venous outflow pressure rises.
- **What it does clinically:**
  - **a crystalloid bolus** leaves the blood within minutes (most of it is in the interstitium by 30 min);
  - **a colloid** (albumin) stays longer, because the capillary wall reflects albumin;
  - **after a haemorrhage**, the lower capillary pressure draws interstitial fluid back into the blood (transcapillary refill), restoring part of the shed volume within half an hour and diluting the haemoglobin.

## Inheritance

```
BaseModelClass
  └── Interstitium
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `isf_volume_per_kg` | L/kg | 0.36 | Resting interstitial volume (ECF ~0.40 minus the plasma). |
| `pif_rest` | mmHg | −1.0 | Resting interstitial fluid pressure. |
| `compliance_above`, `compliance_below` | mL/mmHg/kg | 40, 4 | Interstitial compliance above and below the resting volume. |
| `kf_per_kg` | mL/min/mmHg/kg | 0.08 | Whole-body capillary filtration coefficient (fitted, see [Assumptions](#assumptions-and-limitations)). |
| `sigma` | – | 0.85 | Albumin reflection coefficient. |
| `oncotic_base`, `albumin_ref` | mmHg, g/L | 18, 25 | Oncotic pressure at the reference albumin (the [Kidneys](./Kidneys.md) law). |
| `isf_albumin_ratio` | – | 0.6 | Resting interstitial / plasma albumin. |
| `lymph_flow_rest` | mL/min/kg | 0.1 | Resting lymph flow (= resting net filtration). |
| `lymph_gain`, `lymph_gain_below` | /mmHg | 1.0, 0.3 | Fractional change of lymph flow per mmHg of interstitial pressure above / below rest. |
| `lymph_pv_gain` | /mmHg | 0.127 | Fractional fall of lymph flow per mmHg of outflow (venous) pressure above rest. |
| `lymph_max_ratio` | – | 3.4 | Lymph flow ceiling (× rest). |
| `lymph_site` | – | `"SVC"` | Venous compartment the lymph drains into. |
| `pc_art_fraction` | – | 0.2 | Lumped beds: share of the arteriovenous pressure drop downstream of the capillaries. |
| `seed_delay` | s | 30 | Warm-up averaging before the resting balance is seeded. |
| `filtration_sites` | list | RUB/VUB 0.4, RLB/VLB 0.4, INT_CAP 0.12, LS_CAP 0.08 | Filtering beds: compartment, its vein for a lumped bed (else `""`), share of Kf. |
| `filterable_solutes` | list | Na, K, Ca, Cl, lactate, Mg, phosphates, UMA | Small solutes that travel with the water. |
| `kf_factor`, `kf_factor_ps`, `kf_factor_scaling_ps` | – | 1.0 | The factor layers on Kf. |

### State (saved with the state)

| Property | Unit | Description |
|---|---|---|
| `isf_volume`, `isf_volume_rest` | L | Pool volume and the volume the interstitial pressure is referenced to (≤ 0 → seeded at `isf_volume_per_kg · weight`). |
| `isf_solutes` | mmol/L (albumin g/L) | Pool composition (empty → seeded from the first site's blood). |
| `p_offsets` | mmHg | Per-site offsets that make rest neutral (empty → seeded after the warm-up). |
| `pv_rest` | mmHg | Resting lymph outflow pressure. |
| `albumin_ps` | L/s | Diffusive albumin exchange that holds the resting pool at `isf_albumin_ratio · plasma`. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `pif` | mmHg | Interstitial fluid pressure. |
| `oncotic_if` | mmHg | Interstitial oncotic pressure. |
| `net_filtration` | mL/min | Blood → interstitium (negative = refill). |
| `lymph_flow` | mL/min | Interstitium → blood. |
| `isf_volume_ml_kg` | mL/kg | Pool volume. |

## Calculation

**Every 15 ms:**

1. **Warm-up (first `seed_delay` s after build, or when `p_offsets` is empty):** each site's Starling drive and the lymph outflow pressure are averaged, then the offsets are seeded so every site filters its share of `lymph_flow_rest`, and `albumin_ps` is set so the pool's albumin balance closes at `isf_albumin_ratio`. Nothing moves during the warm-up.
2. **Filtration, per site:**
   ```
   Pc     = the bed's pressure (a *_CAP compartment), or for a lumped bed
            Pv + (Pa − Pv) · pc_art_fraction                              (Pappenheimer)
   π      = oncotic_base · albumin / albumin_ref                          (plasma and pool)
   Jv_i   = Kf_eff · share_i · [(Pc − Pif) − σ(πp − πif) − p_offset_i]
   ```
   - **Out of the blood** (Jv > 0): water carries the small solutes at the bed's concentration, and albumin crosses by (1 − σ) convection. Haemoglobin, glucose, the drugs and the blood gases stay behind and concentrate.
   - **Back into the blood** (Jv < 0): pool water and small solutes return, with albumin at (1 − σ) of the pool's.
   - **Albumin diffusion:** `albumin_ps · share · (Cp − Cif)` per site.
   - Neither side is ever drained by more than half its volume in one update.
3. **Interstitial pressure:** `Pif = pif_rest + (V − V_rest)/C`, with `C = compliance_above` above the resting volume and `compliance_below` under it.
4. **Lymph** into `lymph_site`, with the pool's composition (no gases):
   ```
   Q = lymph_flow_rest · (1 + gain·(Pif − pif_rest)) · (1 − lymph_pv_gain·(Pv − pv_rest))
   gain = lymph_gain above the resting pressure, lymph_gain_below under it;  0 ≤ Q ≤ lymph_max_ratio · rest
   ```

## Factor system

Kf has the usual additive layers: `Kf_eff = kf + (kf_factor − 1)·kf + (kf_factor_ps − 1)·kf + (kf_factor_scaling_ps − 1)·kf`, with `kf_factor` reset every update.

## Inputs and outputs

- **Reads:** the filtration beds' and their veins' `pres` and `solutes.albumin`; `lymph_site.pres`; `model.weight`.
- **Writes:** the beds' volume and composition (directly when filtering out, through `volume_in` when refilling); `lymph_site` through `volume_in`.
- **Written by:** the user (Kf factors, gains).
- **Read by:** `DataCollector` watchers.

## Assumptions and limitations

- **Kf is fitted for the 72 h term neonate** (0.08 mL/min/mmHg/kg), between the fetal lamb (0.4 for bleeding, Brace & Gold 1984) and the adult limb (~0.05), to these targets (`scripts/probe_interstitium.mjs`):

  | Test | Model | Target |
  |---|---|---|
  | 20 mL/kg normal saline over 10 min, retained at the end of the infusion | 73 % | 50–75 % (adult, Hahn) |
  | same, retained at 30 min | 21 % | 15–25 % (fetal 7 %, adult 20–40 %) |
  | 14 % bleed over 5 min, volume restored at 30 min | 45 % | 35–50 % (fetal 53 %, Brace 1983) |

- **No newborn data for the lymph response below rest.** `lymph_gain_below` (0.3/mmHg) is weaker than above rest so lymph keeps flowing when a bleed draws the interstitium down; with the symmetric gain it stopped at −2 mmHg.
- **One pool, four beds.** The lungs, brain, kidneys and heart don't filter into it (the lungs have no interstitial compartment; the kidneys have their own [filtration](./Kidneys.md)). Glucose keeps its own interstitial pool ([Glucose](./Glucose.md)).
- **No venous stress relaxation.** In a 60-min colloid load the CVP rises linearly (Merrill 1995 protocol: +11.6 mmHg vs +5.6 in conscious lambs). Making the systemic veins 2.5× more compliant closed most of that gap but buffered a haemorrhage so well that the newborn barely responded to blood loss, so it was reverted; the slow venous relaxation that would explain both is not modelled.
- **No insensible loss:** the pool exchanges only with the blood.
- **The read-outs are pulsatile** (they follow the beds' pressures); average them over a few beats.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Interstitium` (trimmed):

```json
{
  "name": "Interstitium",
  "model_type": "Interstitium",
  "is_enabled": true,
  "isf_volume_per_kg": 0.36,
  "pif_rest": -1,
  "compliance_above": 40,
  "compliance_below": 4,
  "kf_per_kg": 0.08,
  "sigma": 0.85,
  "lymph_flow_rest": 0.1,
  "lymph_gain": 1,
  "lymph_gain_below": 0.3,
  "lymph_site": "SVC",
  "filtration_sites": [
    { "bed": "RUB", "vein": "VUB", "share": 0.4 },
    { "bed": "RLB", "vein": "VLB", "share": 0.4 },
    { "bed": "INT_CAP", "vein": "", "share": 0.12 },
    { "bed": "LS_CAP", "vein": "", "share": 0.08 }
  ]
}
```

## Usage in the scenarios

term_neonate_72h only. The ToF scenarios have none, so a fluid bolus there stays in the blood (see [Fluids](./Fluids.md)).

## References

- Brace & Gold 1984, fetal sheep (doi:10.1152/ajpregu.1984.247.5.R800): interstitial compliance 45 mL/mmHg/kg, vascular compliance 3.0–3.5, Kf 0.4–0.8.
- Brace 1983, fetal sheep haemorrhage (doi:10.1161/01.res.52.6.730): ~53 % of the shed volume restored at 30 min.
- Brace 1983, fetal sheep saline and dextran (PMID 6196973): saline retained 15/9/7 % at 10/20/30 min.
- Hahn, volume kinetics of crystalloids in adults (grade B): 50–75 % retained at the end of an infusion, distribution half-life ~16 min.
- Merrill 1995, conscious lambs 3–7 d (doi:10.1152/ajpheart.1995.268.3.H1343): conscious lambs, 42 mL/kg dextran over 60 min, RAP +5.6 mmHg.
- Sola 1981: plasma colloid osmotic pressure at term 19.4 mmHg.
