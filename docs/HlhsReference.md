# HLHS reference (hlhs, 48 h, PGE1)

`model_definitions/hlhs.json` is a stable term neonate (3.5 kg, 48 h) with **hypoplastic left heart syndrome, mitral + aortic atresia**, the duct held open on PGE1, before Norwood palliation. It is generated from `term_neonate_72h` by `scripts/_make_hlhs.mjs` (lever table and calibration notes in its header) and validated with `scripts/probe_hlhs.mjs hlhs`.

The targets are classic textbook values for a stable, balanced pre-Norwood HLHS (no study-specific reference set, by choice, 2026-11-10).

| Quantity | Target | Model (probe_hlhs, 120 s warm-up) |
|---|---|---|
| SpO₂ pre / post | 75–85 %, equal (fully mixed) | 76.8 / 76.6 % |
| Qp:Qs | ~1 (0.8–1.5) | 1.31 (Qp 706, Qs 537 ml/min) |
| Single RV output | ~2× normal | 1243 ml/min (≈ 355 ml/kg/min) |
| MAP | ~45 (40–55) mmHg | 48 |
| PAP mean | ≈ systemic | 49 |
| Lactate | < 2 mmol/l | 1.6 |
| pH / BE | normal | 7.44 / −2.4 |
| Atrial septum | non-restrictive, LA − RA < 3 mmHg | LA 6.0, RA 3.8; LA→RA 712 ml/min |
| Duct | wide, systemic R→L | PA→aorta 537 ml/min, systolic gradient ~3 mmHg |
| Arch and coronaries | retrograde, duct-fed | arch AAR→AA 252 ml/min; coronaries 34 ml/min |

## Levers and why

| Lever | Value | Why |
|---|---|---|
| Mitral + aortic atresia | `LA_LV`, `LV_AA` disabled | LV excluded; `Heart` keeps a valid cycle from the ventricular activation window |
| Atrial septum | `diameter_fo` 6 mm, `fo_lr_factor` 1 | the whole pulmonary venous return must cross LA→RA |
| Duct | 7 mm, `diameter_relative` 0.5 + PGE1 0.02 mcg/kg/min | 4 mm (the archived build) restricted Qs with a 12–13 mmHg systolic gradient; PGE1 (patency ×2.1) holds the duct fully open, and stopping it narrows the duct to 50 % |
| Hypoplastic ascending aorta | AA `u_vol` ×0.6, `el_base` ×1.4 | filled retrograde |
| PVR | pulmonary arterioles ×2.5 | ×1/2/3 gave Qp:Qs 2.5/1.6/1.2 |
| Systemic RV | `wall_frac_rv` = LV's; RV `el_max` ×3 | the term baby's RV (a third of the LV's contractility) delivered ~300 ml/kg/min with Qs ~125 and lactate 2.7 |

**Read-out caveat:** in HLHS `Monitor.svo2` (the PA saturation) is mixed blood (= SaO₂); the systemic venous saturation is the SVC's (≈ 56 %).

The diagram is the ToF-style teaching diagram: the LV and its valves hidden, a narrow ascending aorta, the duct and the atrial septum (captioned ASD) in the shunt style.
