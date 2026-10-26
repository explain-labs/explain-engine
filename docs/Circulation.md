# Circulation

`Circulation` is the coordinator of the blood vessels. It holds no blood itself. It groups the vessels by anatomical class, passes the autonomic vascular tone and the system-wide resistance settings (SVR, PVR) on to them, and reports how the blood volume is distributed. It also owns the circulation's vessels and connectors as sub-models.

## Physiology

Blood pressure and organ flow are set largely by the tone of the small arteries and arterioles, and venous return by the tone of the veins. Several things change that tone at once:
- **Sympathetic nervous system:** the baroreflex constricts the vessels when pressure falls.
- **Hormones:** angiotensin II and vasopressin constrict them.
- **Drugs:** e.g. noradrenaline through α1 receptors.
- **The clinician:** a vasodilator or vasopressor, or pulmonary vasodilators such as inhaled NO.

Circulation applies each of these to the right vessel class: the systemic or pulmonary arterioles for resistance (SVR, PVR), and the venules for venous resistance. It also reports where the blood is (systemic, pulmonary, heart), the way a clinician thinks of blood volume distribution.

## Inheritance

```
BaseModelClass
  └── Circulation
```

## Properties

### Config: groups (names of models)

| Property | Default | Description |
|---|---|---|
| `heart_chambers` | `[]` | Heart chambers, for the volume report. |
| `coronaries` | `[]` | Coronary bed, counted in the systemic volume. |
| `systemic_arteries`, `systemic_arterioles`, `systemic_capillaries`, `systemic_venules`, `systemic_veins` | `[]` | Systemic vessels by class. The arterioles are the SVR site, the venules the venous resistance site. |
| `pulmonary_arteries`, `pulmonary_arterioles`, `pulmonary_capillaries`, `pulmonary_venules`, `pulmonary_veins` | `[]` | Pulmonary vessels by class. The arterioles are the PVR site. |

### Config: resistance channels

Each channel is a multiplier around 1, applied to its vessel group. A change is added as a delta to the vessels' `r_factor_ps` (see [Calculation](#calculation)).

| Property | Default | Vessels | Owner |
|---|---|---|---|
| `svr_factor_art` | 1.0 | systemic arterioles | the user / scenario |
| `svr_factor_ven` | 1.0 | systemic venules | the user / scenario |
| `pvr_factor_art` | 1.0 | pulmonary arterioles | the user / scenario |
| `pvr_factor_ven` | 1.0 | pulmonary venules | the user / scenario |
| `svr_factor_drug` | 1.0 | systemic arterioles | `Drugs` (α1 vasoconstriction) |
| `svr_factor_hormones_art` | 1.0 | systemic arterioles | `Hormones` (angiotensin II, ADH) |
| `svr_factor_hormones_ven` | 1.0 | systemic venules | `Hormones` (angiotensin II) |

### Set by other models

| Property | Default | Written by |
|---|---|---|
| `ans_activity` | 1.0 | The `EF_SVR` efferent (baroreflex/chemoreflex vascular tone); passed to every vessel in the groups. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `total_blood_volume` | L | Systemic + pulmonary + heart volume (every 1 s). |
| `syst_blood_volume`, `pulm_blood_volume`, `heart_blood_volume` | L | Volumes per part; systemic includes the coronaries. Disabled vessels (placenta, ECLS) are not counted. |
| `syst_blood_volume_perc`, `pulm_blood_volume_perc`, `heart_blood_volume_perc` | % | Shares of the total (0 while the total is 0). |

### Internal state (public names, saved with the state)

| Property | Description |
|---|---|
| `prev_ans_activity`, `prev_svr_factor_art`, `prev_svr_factor_ven`, `prev_svr_factor_drug`, `prev_svr_factor_hormones_art`, `prev_svr_factor_hormones_ven`, `prev_pvr_factor_art`, `prev_pvr_factor_ven` | The values last applied; a difference triggers the update. `prev_ans_activity` starts at 0, so the first update always pushes `ans_activity`. |

## Calculation

`calc_model()` runs two throttled loops.

**Every 15 ms**, only for inputs that changed since the last tick:
- `ans_activity` → written onto every vessel in the groups (each `BloodVessel` applies it through its `ans_sens`, see [BloodVessel](./BloodVessel.md)).
- Each resistance channel → its change is added to the persistent factor of every vessel in its group:
  ```
  delta = new_value − prev_value
  r_factor_ps += delta        (each vessel of the group, clamped at 0)
  ```
  The user, Drugs and Hormones channels all add into the same `r_factor_ps`, together with anything else that writes it (scenario tuning, the `Calibrator`). Because they add, simultaneous channels combine additively: SVR ×2 plus a drug ×2 gives ×3, not ×4. The vessel's other layers (scaling, ANS, viscosity) then multiply on top.

**Every 1 s:** `calc_blood_volumes()` sums the enabled vessels and chambers into the volume outputs.

## Factor system

None of its own; it writes `BloodVessel.r_factor_ps` (see [BloodVessel → Factor system](./BloodVessel.md#factor-system)). Through the α-coupling, every resistance channel also stiffens the vessels it acts on.

## Inputs and outputs

- **Reads:** the vessels' and chambers' volumes (volume report).
- **Writes:** `ans_activity` and `r_factor_ps` of the vessels in its groups.
- **Written by:**
  - `EF_SVR` (`ans_activity`);
  - `Drugs` (`svr_factor_drug`), `Hormones` (`svr_factor_hormones_*`);
  - the user and scenarios (`svr_factor_art/_ven`, `pvr_factor_art/_ven`).

  The UI's SVR and PVR common tasks use `ModelScaler`'s resistance groups instead (the scaling layer).
- **Read by:** `Monitor` and `DataCollector` watchers (volume report).

## Assumptions and limitations

- **One autonomic signal for all vessels.** Regional differences come only from each vessel's `ans_sens`.
- **Channels add.** See [Calculation](#calculation). The clamp at 0 makes a channel irreversible past it: a delta that hits 0 is partly lost.
- **Membership is by name.** Only vessel names belong in the groups (a resistor name is skipped). `RUB`/`RLB` (the lumped upper and lower body, 36 % of systemic organ flow at term) belong in `systemic_arterioles`.
- **Renal autoregulation acts on the inflow connector.** `Kidneys` adjusts `AD_KID_ART` (the renal arteriole's inflow resistor), so KID_ART receives the systemic channels like the other arterioles and autoregulation counters them on top. Before this, an absolute write to KID_ART erased every SVR change there.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Circulation` (trimmed; `components` holds the vessels and connectors):

```json
{
  "name": "Circulation",
  "model_type": "Circulation",
  "is_enabled": true,
  "heart_chambers": ["LA", "RAIVCI", "RASVC", "RV", "LV"],
  "coronaries": ["COR"],
  "systemic_arteries": ["AA", "AAR", "AD"],
  "systemic_arterioles": ["INT_ART", "KID_ART", "LS_ART", "BR_ART", "RUB", "RLB"],
  "systemic_capillaries": ["INT_CAP", "KID_CAP", "LS_CAP", "BR_CAP"],
  "systemic_venules": ["INT_VEN", "KID_VEN", "LS_VEN", "BR_VEN"],
  "systemic_veins": ["IVCI", "SVC", "VLB", "VUB"],
  "pulmonary_arteries": ["PA", "PAAL", "PAAR"],
  "pulmonary_arterioles": ["LL_ART", "RL_ART"],
  "pulmonary_capillaries": ["LL_CAP", "RL_CAP"],
  "pulmonary_venules": ["LL_VEN", "RL_VEN"],
  "pulmonary_veins": ["PV"],
  "svr_factor_art": 1,
  "svr_factor_ven": 1,
  "pvr_factor_art": 1,
  "pvr_factor_ven": 1
}
```

## Usage in the scenarios

One instance in every scenario. Its `components` are the 31 circulation vessels and 3 free resistors (`PV_LA`, `IVCI_RAIVCI`, `SVC_RASVC`); the vessels' own inflow connectors are created by the vessels. At rest the term blood volume is 286 mL: 81 % systemic, 11 % pulmonary, 8 % in the heart. The placenta (`Placenta`) and ECLS (`Ecls`) vessels belong to their own owners and are not in the groups.

## References

No literature-derived values: the groups and channels are model structure.
