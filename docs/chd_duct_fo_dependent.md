# Duct- and Foramen-Ovale-Dependent Congenital Heart Disease

*A clinical reference and engine-mapping for the Explain neonatal simulator.*

This document catalogs the **congenital heart defects (CHD) that dominate the neonatal intensive care unit because they depend on the ductus arteriosus and/or the foramen ovale (atrial septum) for survival**. These are the lesions in which a neonate is stable in utero and for the first hours-to-days of life, then collapses — with profound cyanosis or cardiogenic shock — as the duct and/or foramen ovale physiologically close. That transition, and the way it is governed by the pulmonary-to-systemic flow ratio (Qp:Qs) and the PVR/SVR balance, is exactly the physiology a simulator can teach.

It is organized in four parts:

1. **[Physiological taxonomy](#1-physiological-taxonomy)** — the four dependency categories.
2. **[Lesion catalog](#2-lesion-catalog)** — the curated NICU-core set, each mapped to the engine's levers.
3. **[Engine-lever summary & limitations](#3-engine-lever-summary--limitations)** — what is buildable today, what needs rewiring, what the engine cannot represent.
4. **[Build roadmap](#4-build-roadmap)** and **[bibliography](#5-bibliography)**.

> Scope note: this is the *curated NICU-core set* (~14 lesions across all four categories), not an exhaustive enumeration of every duct/FO-dependent variant.

---

## 1. Physiological taxonomy

The clinical organizing principle is **what the patent channel is keeping alive**:

| Category | What the duct/FO supplies | Closure event → presentation |
|---|---|---|
| **A. Duct-dependent pulmonary blood flow** | Lungs (systemic→pulmonary flow via PDA) | Duct closes → profound, O₂-resistant **cyanosis** |
| **B. Duct-dependent systemic blood flow** | Body (right→left flow via PDA) | Duct closes → **cardiogenic shock** (mimics sepsis) |
| **C. Duct- *and* FO-dependent mixing** (d-TGA) | Inter-circulatory mixing (parallel circuits) | Inadequate mixing → cyanosis; needs PDA **and** atrial shunt |
| **D. FO / atrial-septum-dependent** | Obligatory atrial-level shunt | Restrictive/intact atrial septum → emergency |

The unifying teaching concept is the **balanced parallel circulation**. In a duct-dependent lesion the systemic and pulmonary circuits run in parallel (rather than in series), sharing output across the duct and/or a septal communication; the patient's stability is set by the Qp:Qs ratio, which is in turn governed by the relative resistances of the two beds (PVR vs SVR). Lowering PVR (extra O₂, hyperventilation, alkalosis) floods the lungs at the expense of systemic flow in duct-dependent *systemic* lesions, and conversely helps in duct-dependent *pulmonary* lesions. This PVR/SVR lever is precisely what the engine exposes, which is why these lesions are well-suited to simulation (Khalil/Schranz 2019 [#1]; Martins 2008 [#16]).

**Prostaglandin E1 (alprostadil, PGE1)** maintains or reopens ductal patency and is the shared pharmacological rescue across categories A, B, and C; the highest-tier evidence is the Cochrane review (Akkinapally 2018 [#4]). Category D lesions add a second rescue — **balloon atrial septostomy** (the Rashkind procedure, first described 1966 [#17]) — to enlarge the atrial communication. Pulse-oximetry screening for critical CHD (pre- and post-ductal SpO₂) is the population-level safety net (Mahle 2009 AHA/AAP statement [#6]).

---

## 2. Lesion catalog

For each lesion: the **dependency**, the **mechanism**, and the **engine levers** that reproduce it. All cited engine identifiers were verified against the current tree:

- Ductus → `Pda` model, resistor `AAR_DA` wired `AAR → PA`, levers `diameter_relative` / `length` / `discharge_coeff` (bidirectional; see [`Pda.js`](../component_models/Pda.js) and [`docs/Pda.md`](./Pda.md) if present).
- Foramen ovale → `Shunts.diameter_fo` (LA↔RA via the split resistors `LA_RAIVCI` / `LA_RASVC`, with flap-valve asymmetry `fo_lr_factor`); restrictive/intact = `diameter_fo → 0`.
- VSD → `Shunts.diameter_vsd` (LV↔RV). Intrapulmonary shunt → `Shunts.ips_res`. See [`Shunts.js`](../component_models/Shunts.js).
- Valves are `Resistor`s in `Heart.components`: `LA_LV` (mitral), `RA_RV` (tricuspid), `RV_PA` (pulmonary), `LV_AA` (aortic). **Atresia** = `no_flow: true`; **stenosis** = raise `r_for`.
- **TGA outflow tracts are pre-wired but disabled** in `term_neonate.json`: `RV_AA` (RV→AA, `is_enabled: false`) and `LV_PA` (LV→PA, `is_enabled: false`), alongside the normal `RV_PA` and `LV_AA`.

### A. Duct-dependent pulmonary blood flow

In these lesions the right-heart outflow to the lungs is obstructed or absent, so pulmonary blood flow arrives **backwards through the duct** (aorta → PDA → pulmonary artery). Ductal closure causes profound, oxygen-resistant cyanosis.

- **A1 — Pulmonary atresia with intact ventricular septum (PA-IVS).** *Also FO-dependent.* The RV outflow is blind; lungs are fed only by the PDA, and all systemic venous return must cross the foramen ovale right→left to reach the left heart. RV and tricuspid valve are hypoplastic; ~10% have an RV-dependent coronary circulation, the key risk modifier (Chikkabyrappa 2018 [#9]; Jaggers AATS consensus 2025 [#10]).
  *Engine:* `RV_PA.no_flow = true`; `Pda.diameter_relative > 0`; `Shunts.diameter_fo > 0` (R→L); RV hypoplasia via `Heart.components.RV` `el_min`↑ / `u_vol`. **Fully buildable.**
  **✅ BUILT** as `pa_ivs` — `scripts/_make_paivs.mjs` → `reseed_paivs.mjs` → `probe_paivs.mjs`. Calibrated: **zero antegrade flow** (atretic `RV_PA`), the **duct is the sole pulmonary supply** (≈ 590 mL/min, aorta→PA L→R), a **suprasystemic hypertensive blind RV** (peak ≈ 70 mmHg) that decompresses only through a restrictive **tricuspid-regurgitation jet** (≈ 500 mL/min — its single outlet), and an **obligate R→L FO** (≈ 500 mL/min = the whole systemic venous return) feeding the LV-only output → cyanosis (SpO₂ ≈ 74%, pO₂ ≈ 32 mmHg), MAP preserved at 50. Levers: `RV_PA.no_flow` (atresia, not stenosis — contrast `critical_ps`), `diameter_vsd: 0` (intact septum), RV hypoplasia (`el_min: 2500`, `u_vol: 0.002`), **tricuspid regurgitation** (`RAIVCI_RV`/`RASVC_RV` `no_back_flow: false`, `r_back: 5000` — a restrictive r_back lets the blind RV pressurize to suprasystemic levels yet stay volume-stable; free TR leaves it flaccid at ~12 mmHg, no TR traps volume), `diameter_fo: 6` (left at baseline `fo_lr_factor: 25` — R→L easy), `Pda.diameter_relative: 1.0`. Left heart structurally normal → no engine change. RV-dependent coronary circulation (sinusoids, ~10% of cases) not modeled.

- **A2 — Pulmonary atresia with VSD.** Lungs fed by the PDA and/or major aortopulmonary collateral arteries (MAPCAs). With a VSD the RV decompresses into the LV/aorta (Soquet 2019 [#11]; Presnell 2015 [#12]).
  *Engine:* `RV_PA.no_flow = true`; `Shunts.diameter_vsd > 0`; `Pda` open. **Buildable without MAPCAs** — collateral vessels are not modelable (see [limitations](#3-engine-lever-summary--limitations)).
  **✅ BUILT** as `pa_vsd` — `scripts/_make_pavsd.mjs` → `reseed_pavsd.mjs` → `probe_pavsd.mjs`. Calibrated: **zero antegrade flow** (atretic `RV_PA`), a large VSD lets the **RV decompress into the LV/aorta** (`diameter_vsd: 5`, VSD flow RV→LV ≈ 450 mL/min, **RV/LV peaks equilibrated at 71/70 mmHg** — *not* a blind hypertensive RV, contrast PA-IVS), so the atrial septum stays intact (`diameter_fo: 0` — **not** FO-dependent); the **duct is the sole pulmonary supply** (`Pda.diameter_relative: 1.0`, fat 4 mm duct, ≈ 750 mL/min, no MAPCAs), mixed aortic blood → cyanosis (SpO₂ ≈ 78%, pO₂ ≈ 34), MAP 47. **Profoundly duct-dependent** — closing the duct crashes SpO₂ to ≈ 14% (the duct is the *only* pulmonary flow). *Calibration:* both ventricles eject into one aortic outlet, which the lumped model over-pumps, so `Heart.cont_factor_left/right: 0.6` normalizes the combined systemic output (a geometry compensation, not intrinsic weakness). Left heart normal → no engine change. **Limitation:** MAPCAs (a real alternative pulmonary supply) are not modelable — so duct closure here is more catastrophic than a MAPCA-supplied patient.

- **A3 — Critical pulmonary stenosis.** Severe but not complete RVOT obstruction; duct-dependent when critical. A right→left atrial "pop-off" across the FO offloads the pressured RA (Latson 2001 [#13]; Aggarwal 2018 [#14]).
  *Engine:* `RV_PA.r_for`↑ (stenosis, keep some antegrade flow); `Pda` open; `Shunts.diameter_fo` for the atrial pop-off. **Fully buildable.**
  **✅ BUILT** as `critical_ps` — `scripts/_make_cps.mjs` → `reseed_cps.mjs` → `probe_ps.mjs`. Calibrated: **suprasystemic, pressure-loaded RV** (peak ≈ 110 mmHg) with an 84 mmHg trans-valvular gradient and a low post-stenotic PA; antegrade flow is a trickle (≈ 180 mL/min) while the **duct supplies the majority of pulmonary flow** (≈ 310 mL/min, aorta→PA L→R — close it and pulmonary flow halves); a **right→left FO pop-off** (≈ 340 mL/min) drives cyanosis (SpO₂ ≈ 77%, pO₂ ≈ 33 mmHg), systemic MAP preserved. Levers: `RV_PA.r_for: 8000` (patent — not atretic), `Heart.cont_factor_right: 0.6` (the pressure-loaded RV beginning to fail — keeps the peak realistic and deepens the pop-off), `Pda.diameter_relative: 0.7`, `diameter_fo: 5`. *Note:* the FO is left at the baseline `fo_lr_factor: 25` — its fetal-flap asymmetry already makes R→L easy, exactly the direction this lesion needs (contrast HLHS/TGA, which need `fo_lr_factor ≈ 1`). Left heart structurally normal → no engine change. *Modeling caveat:* the linear-resistance valve + time-varying-elastance RV trade peak pressure against antegrade flow, so the realistic peak comes via a mildly failing RV rather than a 200 mmHg hypercontractile one.

- **A4 — Tricuspid atresia (with pulmonary stenosis/atresia).** *Also FO-dependent.* The tricuspid valve is absent, so **all** systemic venous return is obligated right→left across the FO into the LA; the functionally single LV then supplies the body, while pulmonary flow comes via a VSD and/or the duct (Sumal 2020 [#15]). A restrictive atrial septum is poorly tolerated.
  *Engine:* `RA_RV.no_flow = true`; `Shunts.diameter_fo` (obligate R→L); `Shunts.diameter_vsd`; RV hypoplasia; `Pda` if pulmonary atresia / severe PS. **Buildable** (functionally single LV).
  **✅ BUILT** as `tricuspid_atresia` (type Ib — normally related great arteries, restrictive VSD + pulmonary stenosis, the cyanotic reduced-pulmonary-flow form) — `scripts/_make_ta.mjs` → `reseed_ta.mjs` → `probe_ta.mjs`. Calibrated: **obligate FO R→L** (≈ 500 mL/min = the whole systemic venous return), the **single LV** as the only pump (CO ≈ 0.78 L/min), pulmonary flow reaching the lungs only via the **VSD→RV→PA route** (≈ 465 mL/min — the hypoplastic RV acts as a conduit, so VSD flow ≈ antegrade Qp) **supplemented duct-dependently** (duct L→R ≈ 300 mL/min; closing the duct drops SpO₂ 80→74%), cyanosis (SpO₂ ≈ 80%, pO₂ ≈ 35 mmHg), MAP 49 / PAP 33. Levers: the split tricuspid `RAIVCI_RV` + `RASVC_RV` `no_flow` (atresia), RV hypoplasia (`el_min: 2200`, `u_vol: 0.0025`, VSD-fed), `diameter_fo: 6` (baseline `fo_lr_factor: 25` → R→L easy), `diameter_vsd: 2` (restrictive) + `RV_PA.r_for: 800` (pulmonary stenosis) + `Pda.diameter_relative: 0.8`. Left heart normal → no engine change (single LV uses the normal cycle path). Cross-listed as a Category-D (FO-dependent) teaching case.

- **A5 — Tetralogy of Fallot with pulmonary atresia / severe RVOT obstruction.** Large VSD with an overriding aorta; in the pulmonary-atresia form, pulmonary flow is duct- (±MAPCA-) dependent (Miller AATS consensus 2022 [#18]; Bailliard 2009 [#19]).
  *Engine:* large `Shunts.diameter_vsd`; `RV_PA.no_flow` or high `r_for`; high PVR; `Pda` open. **Partially buildable** — *aortic override* (the aorta straddling both ventricles) is not directly representable; approximate the right-to-left streaming through the VSD.

- **A6 — Severe (neonatal) Ebstein anomaly with functional pulmonary atresia.** Massive tricuspid regurgitation plus high PVR leaves the RV unable to open the pulmonary valve, so pulmonary flow becomes duct-dependent; much of the RV is "atrialized" (Luxford 2017 [#20]; Linnenbank 2025 [#21]).
  *Engine:* `RA_RV.r_back`↓ (tricuspid regurgitation), `Heart` RV contractility↓, `RV_PA` functionally closed, `Pda` open. **Partially buildable** — the *atrialized RV* cannot be represented as a separate chamber (fixed chamber set); approximate with TR + a weak RV.

### B. Duct-dependent systemic blood flow

Here the left-heart outflow to the body is obstructed or absent, so systemic perfusion arrives **right→left through the duct** (pulmonary artery → PDA → descending aorta). Ductal closure causes cardiogenic shock that mimics sepsis.

- **B1 — Hypoplastic left heart syndrome (HLHS).** *Also FO-dependent.* The LV cannot support the systemic circulation; the entire cardiac output is delivered by the RV → PDA → aorta, perfusing the arch and coronaries **retrograde**. Pulmonary venous return is obligated left→right across the FO. An intact or highly restrictive atrial septum is a lethal combination requiring emergent decompression (Connor 2007 [#22]; Schranz duct-stenting 2024 [#23]; Vlahos 2004 [#26]; Generali 2022 [#27]).
  *Engine:* `LV_AA.no_flow` or severe `r_for`↑ + LV hypoplasia (reuse the `cdh_lv_dysfunction` LV levers: `Heart.cont_factor_left`, LV `el_min` / `u_vol`); `LA_LV.no_flow` or high `r_for` (mitral atresia/stenosis); `Shunts.diameter_fo` L→R; `Pda` carrying R→L (PA→AAR; the `AAR_DA` resistor is bidirectional). The *restrictive/intact-septum* variant (`diameter_fo → 0`) is a high-value teaching toggle.
  **✅ BUILT** as `hlhs` (mitral + aortic atresia → LV fully excluded) — `scripts/_make_hlhs.mjs` → `reseed_hlhs.mjs` → `probe_hlhs.mjs`. Calibrated single-RV parallel circulation: RV output ≈ 1.2 L/min split **Qp:Qs ≈ 1.7** (mild pulmonary over-circulation, the typical balance), systemic Qs ≈ 0.46 L/min via the duct (PA→aorta, R→L), **retrograde aortic-arch and coronary perfusion** (AAR→AA), obligate FO L→R ≈ 0.75 L/min, moderate cyanosis (SpO₂ ≈ 78%, pO₂ ≈ 34 mmHg), PAP > MAP (RV is the systemic pump). Levers: mitral+aortic atresia, `diameter_fo: 6` / `fo_lr_factor: 1`, `Pda.diameter_relative: 1.0` with a fat 4 mm duct, hypoplastic AA (`u_vol ×0.6`, `el_base ×1.4`), **pulmonary arteriolar resistance ×2 to balance Qp:Qs** (at baseline PVR the lungs steal the output → Qp:Qs ≈ 3.5, systemic hypoperfusion — itself a teaching failure mode). A second engine generalization was needed: `Heart.calc_model` now derives the cardiac cycle from the ventricular activation window when the LV has *no* outflow (aortic atresia → both `LV_AA` and `LV_PA` disabled), so the single-RV physiology keeps a valid cycle (and `HeartFunction` inputs); identity for any heart with a working LV outflow (normal, TGA, tricuspid atresia, PA-IVS).
  **✅ Restrictive/intact-septum variant BUILT** as `hlhs_restrictive` (same builder, only the atrial lever differs: `diameter_fo: 1`). The atrial communication is too small to pass the whole pulmonary venous return, so the LA cannot decompress: **LA pressure rises to ≈ 21 mmHg** (vs 4.5 open — a ≈ 19 mmHg trans-septal gradient = severe pulmonary venous hypertension), the obligate shunt is choked (≈ 420 vs 750 mL/min), single-RV preload/output fall (≈ 0.8 vs 1.2 L/min), and hypoxaemia is severe (**SpO₂ ≈ 64%, pO₂ ≈ 28 mmHg, pH ≈ 7.30**) — the lethal emergency needing immediate atrial decompression (balloon/blade septostomy or stenting). It remains a stable steady state because the septum is restrictive, not fully intact (`diameter_fo → 0` would trap the LA entirely and collapse). Alveolar oedema is not separately modeled — the hypoxaemia arises from the reduced pulmonary flow + obligatory mixing.

- **B2 — Critical aortic stenosis.** The LV cannot eject across the valve, so systemic perfusion becomes duct-dependent; high LV wall stress impairs coronary perfusion and drives LV dysfunction (Affolter 2014 [#24]).
  *Engine:* `LV_AA.r_for`↑; LV strain via the existing `HeartFunction` load-induced contractility model; `Pda` open. **Fully buildable.**
  **✅ BUILT** as `critical_as` — `scripts/_make_cas.mjs` → `reseed_cas.mjs` → `probe_as.mjs`. Calibrated (left-sided mirror of `critical_ps`): **pressure-loaded, failing LV** (peak ≈ 127 mmHg, 83 mmHg trans-valvular gradient — a low-flow/low-gradient state) with reduced antegrade aortic flow (≈ 190 mL/min) while the **duct supplies ~40% of systemic flow** (R→L ≈ 125 mL/min, PA→aorta — close it → systemic shock); **differential cyanosis** (pre-ductal SpO₂ ≈ 96% from the LV-fed upper body vs post-ductal ≈ 85% from the duct-fed lower body); mild LA congestion (≈ 7.5 mmHg) decompressing L→R across the FO; low MAP (≈ 39) with compensatory tachycardia — the decompensating low-output picture. Levers: `LV_AA.r_for: 8000` (patent — not atretic, contrast HLHS), `Heart.cont_factor_left: 0.4` (failing LV — keeps the peak realistic ~110–130 not ~190 and deepens duct-dependence + differential cyanosis), `Pda.diameter_relative: 1.0`, `diameter_fo: 2.5` / `fo_lr_factor: 4` (modest L→R LA decompression). Aortic valve patent → no engine change. *Same modeling caveat as critical PS:* the realistic LV peak comes via a failing LV rather than a 190 mmHg hypercontractile one.

- **B3 — Critical coarctation of the aorta.** A discrete narrowing at the isthmus; the lower body is perfused by right→left ductal flow into the descending aorta, and abrupt ductal closure causes shock (Ganigara 2019 [#25]; Egan 2009 [#28]).
  *Engine:* `AAR_AD.r_for`↑ (or `no_flow` for near-atretic); `Pda` open feeding the lower body. **Buildable with a wiring note** — see B3/B4 caveat in [§3](#3-engine-lever-summary--limitations).
  **✅ BUILT** as `coarctation` — `scripts/_make_coarc.mjs` → `reseed_coarc.mjs` → `probe_coarc.mjs`. Calibrated: a tight but patent isthmus gives the hallmark **pre/post-ductal pressure gradient** (upper body 101/55 vs lower 30/16, ≈ 55 mmHg mean — upper-body hypertension / weak femorals), a duct-dependent lower body (an antegrade isthmus trickle ≈ 130 mL/min plus the duct R→L ≈ 15 mL/min), and **differential cyanosis** (pre-ductal 97% vs post-ductal 87%). *Two engine facts resolved the wiring note (both JSON-only, no code change):* (1) re-point the duct to the descending aorta — `Pda.components.AAR_DA.comp_from: "AD"` (the `Pda` model drives whatever endpoints its resistor names, so the duct desaturates only the lower body → correct differential cyanosis); (2) the isthmus lever is **`Circulation.components.AD.r_for`** (= 30000 here), *not* `AAR_AD.r_for` — the `AD` BloodVessel adopts its same-named input resistor `AAR_AD` and overwrites `r_for` with `AD.r_for_eff` every step, so a direct edit to `AAR_AD.r_for` is wiped.

- **B4 — Interrupted aortic arch (IAA).** The aortic arch is discontinuous; the descending aorta is perfused entirely through the duct. Almost always with a VSD and a strong association with 22q11 deletion (DiGeorge). PGE1 "revolutionized" its management (Jonas 2015 [#29]; Burbano-Vera 2018 [#30]).
  *Engine:* `AAR_AD.no_flow = true`; `Shunts.diameter_vsd`; ductal lower-body path. **Buildable with rewire** (same caveat as B3).
  **✅ BUILT** as `iaa` (same builder as `coarctation`) — interruption is **`Circulation.components.AD.no_flow = true`** (the `AD` vessel propagates `no_flow` to the `AAR_AD` isthmus resistor). The lower body is **entirely duct-dependent** (isthmus flow = 0, duct R→L ≈ 210 mL/min into the descending aorta), with the characteristic **VSD** (`diameter_vsd: 4`, L→R ≈ 780 mL/min) and **differential cyanosis** (pre-ductal 97% vs post-ductal 84%). Same duct re-point as B3. 22q11/DiGeorge association is clinical context only (not modeled).

### C. Duct- and FO-dependent mixing

- **C1 — d-Transposition of the great arteries (d-TGA).** The aorta arises from the RV and the pulmonary artery from the LV, creating **two circulations in parallel** rather than in series. Survival is impossible without mixing — at the atrial level (FO/ASD), through the duct, and/or via a VSD. Cyanosis is inversely proportional to the amount of mixing. The classic neonatal rescue is PGE1 plus balloon atrial septostomy (Rashkind), pending the arterial switch (Martins 2008 [#16]; Rashkind 1966 [#17]; Cucerea 2024 [#33]; Beitzke 1983 [#35]).
  *Engine:* enable `RV_AA` + `LV_PA` and disable `RV_PA` + `LV_AA` (**all four already pre-wired in `term_neonate.json`**); mixing via `Shunts.diameter_fo` + `Pda` (+ optional `diameter_vsd`). A septostomy is demonstrable by ramping `diameter_fo` via the event scheduler.
  **✅ BUILT** as `dtga` (intact ventricular septum) — `scripts/_make_dtga.mjs` → `reseed_dtga.mjs` → `probe_dtga.mjs`. Calibrated to a stable parallel circulation (Qp:Qs ≈ 1, balanced ~0.8 L/min outputs) with cyanosis (SpO₂ ≈ 59%, pO₂ ≈ 25 mmHg). Mixing levers: `diameter_fo: 6`, `fo_lr_factor: 1` (a true ASD/septostomy hole is symmetric — a high flap factor would throttle the LA→RA flow that oxygenates the systemic circuit), `Pda.diameter_relative: 1.0`, `diameter_vsd: 0`. *Note:* FO ≥ ~7 mm at `fo_lr_factor 1` makes the Hagen-Poiseuille atrial resistance so low the explicit solver oscillates — keep septostomy demos at/below 6 mm or raise `atrial_septal_width`. One small engine generalization was needed: `Heart.calc_model` now detects end-systole from whichever LV outflow valve is active (`LV_AA` if enabled, else `LV_PA`), so the cardiac-cycle analysis and `HeartFunction` wall-stress inputs stay valid with the great arteries transposed (identity for normal anatomy).

### D. Foramen-ovale / atrial-septum-dependent

These lesions depend on an **obligatory atrial-level shunt**; a restrictive or intact atrial septum turns them into an emergency.

- **D1 — Total anomalous pulmonary venous connection (TAPVC), especially obstructed.** The pulmonary veins drain to the systemic venous side instead of the LA, so an obligatory right→left atrial shunt across the FO is the only way to fill the left heart. The obstructed form presents with severe cyanosis and low output, is **unresponsive to prostaglandin**, and is one of the few true neonatal cardiac-surgical emergencies (Ross 2017 [#36]; Vanderlaan 2018 [#37]; Campbell 2022 [#38]).
  *Engine:* reroute the pulmonary venous return (`PV_LA`) so it enters the right side, adding the anomalous connection with high `r_for` for the obstructed variant; `Shunts.diameter_fo` obligate R→L. **Buildable with a pulmonary-venous rewire.**
  **✅ BUILT** as `tapvc` (unobstructed) + `tapvc_obstructed` — `scripts/_make_tapvc.mjs` → `reseed_tapvc.mjs` → `probe_tapvc.mjs`. The reroute is **JSON-only**: `PV_LA.comp_to: "SVC"` (the pulmonary veins drain to the SVC — supracardiac, the commonest type). `PV_LA` is a free-standing Resistor (the `LA` HeartChamber doesn't adopt it), so its `comp_to` *and* `r_for` set directly — the channel `r_for` is the obstruction lever. The FO is opened (`diameter_fo: 6`, baseline `fo_lr_factor: 25` → R→L easy) to carry the obligate shunt that fills the *entire* left heart; the duct stays closed (TAPVC is FO-dependent, not duct-dependent → PGE1-unresponsive). Calibrated — **unobstructed** (`PV_LA.r_for: 335`): full mixing in the RA, normal PV pressure ≈ 10 mmHg, CO ≈ 0.6 L/min, mild cyanosis (SpO₂ ≈ 87%, pO₂ ≈ 42). **Obstructed** (`PV_LA.r_for: 5000`): **pulmonary venous hypertension** (PV pressure ≈ 37 mmHg, vs a near-normal LA — the pathology is upstream, not in the left atrium), secondary **suprasystemic PAP** (≈ 51 ≥ MAP), low output (CO ≈ 0.43 L/min, MAP ≈ 44), severe cyanosis (SpO₂ ≈ 73%, pO₂ ≈ 31) — the surgical emergency. Alveolar oedema not separately modeled (the hypoxaemia arises from the reduced pulmonary flow + complete mixing).

> Cross-listed: **A1 (PA-IVS)**, **A4 (tricuspid atresia)**, and the **B1 (HLHS) restrictive-septum variant** are equally FO-dependent and double as Category-D teaching cases.

---

## 3. Engine-lever summary & limitations

**Directly available — JSON-only, no engine code change:**

| Defect feature | Lever |
|---|---|
| Ductus arteriosus | `Pda.diameter_relative` / `length` / `discharge_coeff` (AAR↔PA, bidirectional) |
| Foramen ovale | `Shunts.diameter_fo` (LA↔RA, flap-valve asymmetry via `fo_lr_factor`); restrictive/intact = `→0` |
| VSD | `Shunts.diameter_vsd` (LV↔RV) |
| Valve atresia | `RV_PA` / `LV_AA` / `LA_LV` / `RA_RV` → `no_flow: true` |
| Valve stenosis | same valves → raise `r_for` |
| Valve regurgitation | lower `r_back` (e.g. tricuspid for Ebstein) |
| TGA outflow swap | enable `RV_AA` + `LV_PA`, disable `RV_PA` + `LV_AA` (pre-wired) |
| Chamber hypoplasia / dysfunction | `Heart.cont_factor_left/right`, `relax_factor_*`, chamber `el_min` / `u_vol`; `HeartFunction` load-induced contractility |
| Arch obstruction | `Circulation` `AAR_AD` / `AA_AAR` → `r_for`↑ or `no_flow` |
| Qp:Qs / PVR-SVR balance | pulmonary (`PAAL` / `PAAR` / `LL_ART` / `RL_ART`) and systemic bed resistances |

**Needs minor rewiring (JSON, possibly one small helper):**

- ~~**Descending-aorta ductal path (B3 coarctation, B4 IAA).**~~ **RESOLVED — JSON-only, no helper needed.** Re-point the duct with `Pda.components.AAR_DA.comp_from: "AD"` (the `Pda` model drives whatever endpoints its resistor names). The isthmus lever is `Circulation.components.AD.r_for` (coarctation) / `AD.no_flow` (IAA), because the `AD` BloodVessel adopts its same-named input resistor `AAR_AD` and overwrites it each step. Both `coarctation` and `iaa` are built this way.
- ~~**Anomalous pulmonary venous drainage (D1 TAPVC).**~~ **RESOLVED — JSON-only.** `PV_LA.comp_to: "SVC"` (free-standing resistor; the `LA` chamber doesn't adopt it, so `comp_to` and `r_for` both set directly). Built as `tapvc` / `tapvc_obstructed`.

**Genuine engine limitations — document and scope separately:**

- **MAPCAs** (A2, A5) — there is no collateral-vessel model; pulmonary supply must come from the duct alone.
- **Aortic override** (A5 TOF) — a single aortic root straddling both ventricles is not representable; approximate the right-to-left streaming through the VSD.
- **Atrialized RV** (A6 Ebstein) — the chamber set is fixed at build time; approximate with severe TR (`RA_RV.r_back`↓) plus a weak RV.

---

## 4. Build roadmap

Each scenario follows the established workflow used for the CDH and PDA families: a `_make_*.mjs` deriver (load `term_neonate.json`, apply a lever table, write JSON) → a `reseed_*.mjs` warm-to-steady-state pass → a `probe_*.mjs` validator. Tiering is by engine friction × clinical importance × reuse of existing assets.

**Tier 1 — build first (JSON-only, highest yield):**
- **d-TGA** (C1) — ✅ **built** (`dtga`); outflow swap pre-wired; flagship.
- **HLHS** (B1) — ✅ **built** (`hlhs`, mitral+aortic atresia) + ✅ **restrictive-septum variant** (`hlhs_restrictive`).
- **Critical pulmonary stenosis** (A3) — ✅ **built** (`critical_ps`).
- **PA-IVS** (A1) — ✅ **built** (`pa_ivs`).
- **Critical aortic stenosis** (B2) — ✅ **built** (`critical_as`).

**Tier 2 — build after a small rewire helper:**
- **Coarctation** (B3) + **IAA** (B4) — ✅ **built** (`coarctation`, `iaa`); the descending-aorta ductal path turned out JSON-only (re-point `AAR_DA.comp_from` to `AD`).
- **TAPVC** (D1) — ✅ **built** (`tapvc` + `tapvc_obstructed`); the pulmonary-venous rewire was JSON-only (`PV_LA.comp_to`).
- **Tricuspid atresia** (A4) — ✅ **built** (`tricuspid_atresia`).
- **PA + VSD** (A2) — ✅ **built** (`pa_vsd`, without MAPCAs).

**Tier 3 — needs an engine extension or accepts an approximation:**
- **TOF with pulmonary atresia** (A5) — aortic-override approximation.
- **Severe neonatal Ebstein** (A6) — atrialized-RV approximation.

**Shared tooling to add alongside Tier 1:**
- `probe_chd.mjs` — extend the `probe_cdh.mjs` pattern to report shunt directions and volumes (ductal, atrial), atrial pressures, the pre-/post-ductal SpO₂ split, and the Qp:Qs ratio.
- A **"close the duct" / "open the septum" event demo** using the existing event scheduler (`TaskScheduler`) to show decompensation as the duct closes and rescue as PGE1 reopens it or septostomy enlarges the FO.

---

## 5. Bibliography

All PMIDs were retrieved and confirmed via PubMed metadata; Rashkind 1966 [#17] and Martins 2008 [#16] were additionally confirmed to resolve. No single dedicated "parallel vs series circulation" paper exists — that concept is anchored to Martins 2008 [#16] and Khalil/Schranz 2019 [#1]. No standalone AHA/AAP PGE1 guideline surfaced; the Cochrane review [#4] is the highest-tier PGE1 source.

### Overarching — ductal-dependent circulation, PGE1, screening
1. Khalil M, … Schranz D. *Transl Pediatr* 2019. PMID 31161078 — classifies critical CHD into duct-dependent systemic / pulmonary / TGA; balanced parallel circulation and PVR/SVR management.
2. Strobel AM. *Emerg Med Clin North Am* 2015. PMID 26226862 — cyanosis-vs-shock presentation framework.
3. Barata IA. *Emerg Med Clin North Am* 2013. PMID 23915599 — early neonatal CHD = ductal-dependent presentations.
4. Akkinapally S, et al. *Cochrane Database Syst Rev* 2018. PMID 29486048 — **PGE1 for ductal patency** (top-tier evidence).
5. Gordon CM, et al. *J Pediatr Pharmacol Ther* 2024. PMID 38332962 — alprostadil dosing / effectiveness.
6. Mahle WT, et al. *Pediatrics* 2009. PMID 19581259 — **AHA/AAP pulse-ox CCHD screening statement**.
7. Mahle WT, et al. *Pediatrics* 2012. PMID 22201143 — AAP/AHA/ACC endorsement adopting CCHD pulse-ox screening.
8. Martin GR, et al. *Pediatrics* 2013. PMID 23776113 — implementation of the screening algorithm.

### Group A — duct-dependent pulmonary
9. Chikkabyrappa SM, et al. *Semin Cardiothorac Vasc Anesth* 2018. PMID 29411679 — PA-IVS preoperative physiology / imaging / management.
10. Jaggers J, et al. *J Thorac Cardiovasc Surg* 2025. PMID 40320005 — 2025 AATS consensus on PA-IVS.
11. Soquet J, Barron DJ, d'Udekem Y. *Ann Thorac Surg* 2019. PMID 30831109 — PA/VSD/MAPCAs management.
12. Presnell LB, et al. *World J Pediatr Congenit Heart Surg* 2015. PMID 26467877 — overview of PA and MAPCAs.
13. Latson LA. *J Interv Cardiol* 2001. PMID 12053395 — critical pulmonary stenosis.
14. Aggarwal V, et al. *Am J Cardiol* 2018. PMID 29681368 — balloon valvuloplasty outcomes in critical PS.
15. Sumal AS, et al. *J Card Surg* 2020. PMID 32484582 — tricuspid atresia review.
18. Miller JR, et al. *J Thorac Cardiovasc Surg* 2022. PMID 36522807 — AATS consensus on TOF in neonates/infants.
19. Bailliard F, Anderson RH. *Orphanet J Rare Dis* 2009. PMID 19144126 — Tetralogy of Fallot (open access).
20. Luxford JC, et al. *Semin Thorac Cardiovasc Surg* 2017. PMID 28823330 — neonatal Ebstein, 30-year review.
21. Linnenbank P, et al. *Children (Basel)* 2025. PMID 40564740 — Starnes→Cone strategy in severe Ebstein.

### Group B — duct-dependent systemic
22. Connor JA, Thiagarajan R. *Orphanet J Rare Dis* 2007. PMID 17498282 — HLHS (open access).
23. Schranz D. *Pediatr Cardiol* 2024. PMID 38664298 — duct stenting in duct-dependent systemic flow.
24. Affolter JT, Ghanayem NS. *Cardiol Young* 2014. PMID 25647388 — critical aortic stenosis, preoperative management.
25. Ganigara M, et al. *Semin Cardiothorac Vasc Anesth* 2019. PMID 31535945 — coarctation, preoperative physiology.
28. Egan M, Holzer RJ. *Expert Rev Cardiovasc Ther* 2009. PMID 19900023 — coarctation treatment comparison.
29. Jonas RA. *Semin Thorac Cardiovasc Surg* 2015. PMID 26686446 — management of interrupted aortic arch.
30. Burbano-Vera N, et al. *Semin Cardiothorac Vasc Anesth* 2018. PMID 29742969 — IAA perioperative considerations.

### Group C — duct/FO-dependent mixing (d-TGA)
16. Martins P, Castela E. *Orphanet J Rare Dis* 2008. PMID 18851735 — **parallel circulations, mixing** (open access).
17. Rashkind WJ, Miller WW. *JAMA* 1966;196(11):991-2. PMID 4160716 — **balloon atrial septostomy** (founding paper).
31. Séguéla PE, et al. *Arch Cardiovasc Dis* 2016. PMID 28024917 — tailored preoperative management of TGA.
32. Zaleski KL, et al. *Pediatr Cardiol* 2021. PMID 33492430 — selective/elective BAS does not eliminate PGE1 need.
33. Cucerea M, et al. *Biomedicines* 2024. PMID 39335532 — PGE1/BAS effects on cerebral oxygenation in d-TGA.
34. Gilg S, et al. *Pediatr Investig* 2024. PMID 38910849 — BAS and continued PGE1 to repair.
35. Beitzke A. *Br Heart J* 1983. PMID 6572529 — prostaglandin raises PaO₂ before septostomy in TGA.

### Group D — FO / atrial-septum-dependent
36. Ross FJ, et al. *Semin Cardiothorac Vasc Anesth* 2017. PMID 27694572 — TAPVC physiology; obstructed = PGE1-unresponsive emergency.
37. Vanderlaan RD, et al. *Semin Thorac Cardiovasc Surg Pediatr Card Surg Annu* 2018. PMID 29425529 — surgical approaches to TAPVC.
38. Campbell MJ, et al. *J Am Soc Echocardiogr* 2022. PMID 35863543 — fetal Doppler predicts severe postnatal obstruction.
39. White BR, et al. *Ann Thorac Surg* 2019. PMID 30885849 — risk factors for postoperative pulmonary venous obstruction.
40. Bravo-Valenzuela NJM, et al. *J Clin Ultrasound* 2021. PMID 33398887 — prenatal diagnosis of TAPVC.
41. Rychik J, et al. *Circulation* 2019. PMID 31256636 — AHA Fontan scientific statement (single-ventricle context).
26. Vlahos AP, et al. *Circulation* 2004. PMID 15136496 — HLHS with intact/restrictive atrial septum; emergent septostomy.
27. Generali T, et al. *World J Pediatr Congenit Heart Surg* 2022. PMID 35446214 — HLHS restrictive/intact septum; left-atrial decompression.
42. Mustafa HJ, et al. *Prenat Diagn* 2023. PMID 37596875 — fetal cardiac intervention in HLHS with restrictive septum (meta-analysis).
43. Arai S, et al. *Asian Cardiovasc Thorac Ann* 2015. PMID 26405018 — surgical outcome of HLHS with intact atrial septum.
44. Sukhavasi A, et al. *J Thorac Cardiovasc Surg* 2022. PMID 35414413 — PA-IVS strategies / long-term outcomes.
45. LaPar DJ, et al. *Semin Thorac Cardiovasc Surg Pediatr Card Surg Annu* 2019. PMID 31027561 — PA-IVS with borderline tricuspid valve.
46. Cheung EW, et al. *Ann Thorac Surg* 2023. PMID 36070807 — PA-IVS neonatal procedural outcomes (19-center study).

*Bibliographic data retrieved from PubMed; DOI links available per article.*
