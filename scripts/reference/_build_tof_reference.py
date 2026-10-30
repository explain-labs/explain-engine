# Builds scripts/reference/tof_pink.json, tof.json, tof_severe.json and tof_pa.json (docs/TofReference.md):
# borrowed rows from term_neonate_72h.json plus the ToF rows agreed with the user on 2026-10-30.
# Usage: python3 scripts/reference/_build_tof_reference.py .   (from the engine root)
import json, sys, copy
ENG = sys.argv[1]
term = json.load(open(f"{ENG}/scripts/reference/term_neonate_72h.json"))
tv = {v["key"]: v for v in term["variables"]}

SOURCES = {
  "rudolph2009": {"cite": "Rudolph AM. Congenital Diseases of the Heart: Clinical-Physiological Considerations, 3rd ed. Wiley-Blackwell 2009; ch 14 (Figs 14.2-14.4, catheterization section)", "doi": None, "pmid": None},
  "reddy1995": {"cite": "Reddy VM et al. Ann Thorac Surg 1995;60:S592-6", "doi": "10.1016/0003-4975(95)00732-6", "pmid": "8604943"},
  "arya2014": {"cite": "Arya B et al. Pediatr Cardiol 2014;35:810-6", "doi": "10.1007/s00246-013-0857-3", "pmid": "24352665"},
  "vetten2025": {"cite": "Vetten Z et al. Prenat Diagn 2025;45:743-51 (PMC12137033)", "doi": "10.1002/pd.6796", "pmid": "40286196"},
  "hirji2010": {"cite": "Hirji A et al. Can J Cardiol 2010;26:e1-6 (PMC2827225)", "doi": "10.1016/s0828-282x(10)70330-5", "pmid": "20101358"},
  "mini2024": {"cite": "Mini N et al. Front Cardiovasc Med 2024;11:1489413 (PMC11602471)", "doi": "10.3389/fcvm.2024.1489413", "pmid": "39610973"},
  "matter2012": {"cite": "Matter et al. Pediatr Cardiol 2012 (ductal stenting in duct-dependent pulmonary blood flow)", "doi": "10.1007/s00246-012-0608-x", "pmid": None},
  "li2023": {"cite": "Li et al. Zhong Nan Da Xue Xue Bao Yi Xue Ban 2023 (RVOT stenting in ToF)", "doi": "10.11817/j.issn.1672-7347.2023.230105", "pmid": None},
  "jo2018": {"cite": "Jo et al. Korean J Pediatr 2018 (PMC6106685)", "doi": None, "pmid": None},
  "echo_convention": {"cite": "Doppler RVOT obstruction bands (mild <3 m/s, moderate 3-4 m/s, severe >4 m/s), pedecho.org ToF page", "doi": None, "pmid": None},
}

BORROW_NOTE = "Borrowed from term_neonate_72h (no ToF-specific neonatal data; compensated-neonate assumption, user decision 2026-10-30). "
def borrow(key, **over):
    r = copy.deepcopy(tv[key])
    r["grade"] = "C (borrowed: " + r["grade"] + ")"
    r["notes"] = BORROW_NOTE + (r.get("notes") or "")
    r.update(over)
    return r

def row(key, group, label, unit, mean, low, high, sources, grade, readout, notes, range_type="target range", method="", age="72 h (by assumption)", sd=None, n=None):
    return dict(key=key, group=group, label=label, unit=unit, mean=mean, sd=sd, low=low, high=high, range_type=range_type,
                method=method, age=age, n=n, sources=sources, grade=grade, model_readout=readout, notes=notes)

def shared():
    rows = [borrow(k) for k in ["hr", "sbp", "dbp", "map"]]
    rows.append(row("cvp", "hemodynamics", "Right atrial mean pressure", "mmHg", 5, 2, 8, ["rudolph2009"], "B/C",
        "Monitor.minmax.cvp_pres_mean", "Rudolph: RA mean usually normal (a6 v4 m5 in Figs 14.2-14.4); a wave may rise to 8-10.", method="catheter, textbook figure"))
    rows.append(row("rv_lv_peak", "tof", "RV minus LV peak systolic pressure", "mmHg", 0, -5, 5, ["rudolph2009"], "B",
        "per-beat max RV.pres - per-beat max LV.pres", "Non-restrictive VSD: RV and LV systolic pressures identical, square-topped RV contour (Rudolph, catheterization section). Tests that the VSD is non-restrictive.", method="catheter rule"))
    rows += [borrow("ph"), borrow("pco2", notes=BORROW_NOTE + "Rudolph: PCO2 usually normal or decreased to ~35 mmHg in cyanotic infants (hyperventilation)."),
             borrow("glucose"), borrow("lactate"), borrow("hb"), borrow("hct"), borrow("temp")]
    rows.append(row("qs", "flows", "Systemic output (Qs)", "mL/kg/min", 196, 108, 284, ["rudolph2009", "agata1994"], "C",
        "(LV_AA + RV_AA flow) - ductal Ao->PA flow, per kg",
        "Rudolph: systemic flow usually normal, up to 5-6 L/min/m2 (~1.2 L/min at 0.22 m2) when hypoxaemia is marked. Range borrowed from the term LVO row."))
    rows.append(row("override", "tof", "RV share of aortic inflow (override)", "%", None, None, None, [], "-",
        "RV_AA flow / (RV_AA + LV_AA flow)", "No quantitative source found. Reported only; RV_AA.r_for is a structural lever."))
    rows.append(row("vsd_size", "tof", "VSD", "mm", None, None, None, ["rudolph2009"], "-",
        "Shunts.diameter_vsd", "Large malaligned, non-restrictive by definition; no neonatal mm data. Judged by rv_lv_peak, not by diameter."))
    return rows

def ph(name, d):
    out = []
    out.append(row("spo2", "gases", "SpO2 (pre-ductal)", "%", d["spo2"][0], d["spo2"][1], d["spo2"][2], d["spo2_src"], d["spo2_grade"], "Monitor.sao2_pre", d["spo2_note"], method="pulse oximetry / catheter"))
    out.append(row("svo2_ven", "gases", "Systemic venous O2 saturation", "%", *d["svo2"], ["rudolph2009"], "B/C",
        "RAIVCI/RASVC so2 weighted by their tricuspid flows (Monitor.svo2 reads the PA, which is not mixed venous blood in ToF)", d["svo2_note"], method="catheter, textbook figure"))
    out.append(row("pa_so2", "gases", "PA O2 saturation", "%", *d["pa_so2"], ["rudolph2009"], "B/C", "PA.so2", d["pa_so2_note"], method="catheter, textbook figure"))
    out.append(row("qp_qs", "tof", "Qp:Qs", "-", *d["qpqs"], ["rudolph2009"], "C (derived)", "pulmonary venous return (LL_VEN_PV + RL_VEN_PV) / qs", d["qpqs_note"], method="Fick from figure saturations"))
    out.append(row("pap_s", "hemodynamics", "PA systolic pressure", "mmHg", *d["pap_s"], ["rudolph2009"], d.get("pap_grade", "B/C"), "Monitor.minmax.pap_pres_max", d["pap_note"], method="catheter, textbook figure"))
    out.append(row("pap_m", "hemodynamics", "PA mean pressure", "mmHg", *d["pap_m"], ["rudolph2009"], d.get("pap_grade", "B/C"), "Monitor.minmax.pap_pres_mean", d["pap_note"], method="catheter, textbook figure"))
    out.append(row("rvot_grad", "tof", "RVOT peak-to-peak gradient", "mmHg", *d["grad"], d["grad_src"], d["grad_grade"], "per-beat max RV.pres - per-beat max PA.pres", d["grad_note"], method="catheter / Doppler"))
    out.append(row("rvot_v", "tof", "RVOT peak velocity (derived)", "m/s", *d["v"], ["echo_convention"], "C (derived)", "sqrt(rvot_grad / 4) (RV_PA is a linear resistor without a Doppler read-out)", d["v_note"], method="modified Bernoulli from the gradient"))
    out.append(row("rv_step_up", "tof", "O2 step-up at RV (RV so2 - svo2)", "%", *d["step"], ["rudolph2009"], "B/C", "RV.so2 - Monitor.svo2", d["step_note"], method="catheter, textbook figure"))
    out.append(row("vsd_net", "shunts", "Net ventricular shunt (L->R positive)", "mL/kg/min", *d["vsd"], ["rudolph2009"], "B/C",
        "(RV_PA flow - tricuspid inflow RAIVCI_RV + RASVC_RV) per kg", d["vsd_note"] + " Model: R->L blood reaches the aorta through RV_AA (the override), so the shunt is RV->PA output minus systemic venous inflow, not the VSD resistor flow alone.", method="direction rule"))
    out.append(row("vsd_flow", "shunts", "VSD resistor flow LV->RV", "mL/kg/min", None, None, None, [], "-", "Shunts.flow_vsd per kg", "Reported: the model's LV->RV resistor alone.", method="reported"))
    out.append(row("rvpa", "shunts", "Antegrade RVOT flow", "mL/kg/min", *d["rvpa"], ["rudolph2009"], "C", "RV_PA.flow per kg", d["rvpa_note"], method="reported"))
    out.append(row("duct", "shunts", "Ductal flow (Ao->PA positive)", "mL/kg/min", *d["duct"], d["duct_src"], "B/C", "Pda.flow per kg (Ao->PA positive)", d["duct_note"], method="structural / direction"))
    out.append(row("pv_z", "tof", "Pulmonary valve annulus z-score", "z", *d["pvz"], d["pvz_src"], "B (fetal)", "none (structural; RV_PA lumps valve + infundibulum)", d["pvz_note"], method="fetal echo 25-32 wk"))
    for r in d.get("closed", []): out.append(r)
    return out

P = {
 "tof_pink": dict(
   pa_so2=(80, 75, 85), pa_so2_note="Fig 14.2: PA 80 % (VSD L->R raises it above venous 65-70 %).",
   title="Tetralogy of Fallot, mild RVOT obstruction (pink tetralogy)",
   desc="Term neonate 3.545 kg at 72 h with ToF and mild RVOT obstruction: net L->R VSD shunt, Qp > Qs, acyanotic; ductus closed.",
   spo2=(93, 90, 97), spo2_src=["reddy1995", "rudolph2009"], spo2_grade="A (definition)", spo2_note="Pink = SaO2 > 90 % (Reddy 1995). Rudolph Fig 14.2: aortic 95 %. Neonatal PVR limits the L->R shunt in the first days (Rudolph), so not fully saturated.",
   svo2=(70, 65, 75), svo2_note="Fig 14.2: SVC 65, IVC 70 %.",
   qpqs=(1.5, 1.2, 2.0), qpqs_note="Fig 14.2 Fick: (Ao 95 - venous ~67)/(PV 98 - PA 80) = 1.55. Pink = Qp > Qs (Rudolph text).",
   pap_s=(35, 30, 40), pap_m=(25, 20, 30), pap_note="Fig 14.2: PA 40/20 m28 with aortic systolic 90; 'mildly or moderately elevated' (Rudolph). Scaled to systolic ~74 at 72 h.",
   grad=(42, 35, 50), grad_src=["rudolph2009", "echo_convention"], grad_grade="C", grad_note="Fig 14.2: RV 90 - PA 40 = 50 at aortic 90; at our systolic ~74 -> ~35-50. Neonatal gradients underestimate the obstruction (high PVR).",
   v=(3.2, 3.0, 3.5), v_note="From the gradient band; 'mild/moderate' Doppler band 3-3.5 m/s.",
   step=(8, 3, 15), step_note="Fig 14.2: RV 75 vs venous 65-70 = small L->R step-up.",
   vsd=(None, 0, None), vsd_note="Net L->R (positive). Small in the first days because PVR is still high.",
   rvpa=(None, None, None), rvpa_note="Reported; = Qp with the duct closed.",
   duct=(0, 0, 0), duct_src=["rudolph2009"], duct_note="Ductus closed (Pda.diameter_relative 0).",
   pvz=(None, None, None), pvz_src=["rudolph2009", "vetten2025"], pvz_note="Annulus often normal in mild obstruction (Rudolph); later-intervention group fetal PV z -2.6 +/- 1.6 (Vetten 2025)."),
 "tof": dict(
   pa_so2=(None, None, None), pa_so2_note="Reported.",
   title="Tetralogy of Fallot, moderate RVOT obstruction",
   desc="Term neonate 3.545 kg at 72 h with ToF and moderate RVOT obstruction: bidirectional VSD shunt, Qp ~ Qs, mild-moderate cyanosis; not duct-dependent, ductus closed.",
   spo2=(84, 75, 90), spo2_src=["reddy1995", "rudolph2009"], spo2_grade="A (definition)", spo2_note="Reddy 1995 'adequate pulmonary blood flow' group: SaO2 75-90 %. Rudolph: moderate stenosis is only mildly cyanotic after birth.",
   svo2=(65, 60, 70), svo2_note="Between Fig 14.2 (65-70) and Fig 14.3 (55-60).",
   qpqs=(1.0, 0.8, 1.2), qpqs_note="Interpolated between Fig 14.2 (1.5) and Fig 14.3 (0.6); bidirectional shunting at ventricular level in milder stenosis (Rudolph).",
   pap_s=(25, 20, 30), pap_m=(18, 14, 22), pap_note="Interpolated between Fig 14.2 (40/20 m28) and Fig 14.3 (20/10 m15).", pap_grade="C",
   grad=(52, 45, 60), grad_src=["rudolph2009", "mini2024", "echo_convention"], grad_grade="B/C", grad_note="Mini 2024 cyanotic infants (median 35 d) mean gradient 50 (32-72); moderate Doppler band 36-64 mmHg.",
   v=(3.6, 3.4, 3.9), v_note="From the gradient band (moderate 3-4 m/s).",
   step=(2, 0, 5), step_note="Bidirectional shunt: little net step-up.",
   vsd=(0, -30, 30), vsd_note="Bidirectional, net near zero (band is a C-grade choice: +/-30 mL/kg/min).",
   rvpa=(None, None, None), rvpa_note="Reported; = Qp with the duct closed.",
   duct=(0, 0, 0), duct_src=["rudolph2009"], duct_note="Ductus closed (not duct-dependent).",
   pvz=(-2.6, -4.2, -1.0), pvz_src=["vetten2025", "hirji2010", "mini2024"], pvz_note="Fetal later-intervention group -2.6 +/- 1.6 (Vetten 2025); postnatal cyanotic infants -3.7 (-6.1 to -1.3) (Mini 2024)."),
 "tof_severe": dict(
   pa_so2=(None, None, None), pa_so2_note="Reported. Fig 14.3 shows 58 % (= RV); a PGE1 duct adds aortic blood.",
   title="Tetralogy of Fallot, severe RVOT obstruction on PGE1",
   desc="Term neonate 3.545 kg at 72 h with ToF and severe RVOT obstruction: little antegrade flow, R->L VSD shunt, duct-dependent pulmonary flow; ductus held open on PGE1 (2.5 mm).",
   spo2=(82, 75, 90), spo2_src=["rudolph2009", "li2023", "matter2012"], spo2_grade="B", spo2_note="Rudolph Fig 14.3 (newborn, duct patent): aortic 80 %; text: the duct may lift SaO2 to 85-92 %. Li 2023 before RVOT stent 75 +/- 17 %.",
   svo2=(60, 55, 65), svo2_note="Fig 14.3: SVC 55, IVC 60 %.",
   qpqs=(0.8, 0.6, 1.1), qpqs_note="Fig 14.3 Fick: (80 - 57)/(96 - 58) = 0.6; a 2.5 mm PGE1 duct gives somewhat more. Rudolph: Qp:Qs down to 0.5 with marked hypoxaemia.",
   pap_s=(20, 15, 25), pap_m=(15, 12, 18), pap_note="Fig 14.3: PA 20/10 m15; low PA pressure with a flat trace when hypoxaemic (Rudolph).",
   grad=(55, None, None), grad_src=["rudolph2009"], grad_grade="C", grad_note="Reported only: Fig 14.3 RV 85 - PA 20 = 65 at aortic 85, ~55 at our ~74. With a non-restrictive VSD the gradient is capped by systemic pressure and is a poor severity measure here.",
   v=(3.7, None, None), v_note="Reported only.",
   step=(0, -3, 3), step_note="Fig 14.3: RV 58 = venous 55-60, no L->R step-up.",
   vsd=(None, None, 0), vsd_note="Net R->L (negative).",
   rvpa=(None, None, None), rvpa_note="Reported: little antegrade flow (antegrade + duct = Qp).",
   duct=(None, 0, None), duct_src=["matter2012", "rudolph2009"], duct_note="Ao->PA (positive). Structural: 2.5 mm on PGE1 (user decision; Matter 2012 narrowest pre-stent 1.9 +/- 0.6 mm, length 12.2 mm; ToF ducts are small, Rudolph).",
   pvz=(-5.3, -7.7, -2.9), pvz_src=["vetten2025", "arya2014"], pvz_note="Fetal: PGE1-dependent/intervention <= 7 d -5.3 +/- 2.4 (Vetten 2025); duct-dependent -5.38 +/- 2.95 (Arya 2014).",
   closed=[
     row("spo2_closed", "test", "SpO2 after duct closure", "%", 50, 35, 60, ["rudolph2009"], "B/C", "probe --close-duct: Monitor.sao2_pre", "Fig 14.4 (severe, duct closed): aortic 50 %; rapid closure -> 35-40 %, PO2 20-30, acidaemia (Rudolph). Jo 2018: severe = SpO2 < 70 %.", method="textbook figure"),
     row("qp_qs_closed", "test", "Qp:Qs after duct closure", "-", 0.2, 0.1, 0.35, ["rudolph2009"], "C (derived)", "probe --close-duct", "Fig 14.4 Fick: (50 - 40)/(96 - 40) = 0.18. PA 15/10 m12.", method="Fick from figure saturations"),
   ]),
 "tof_pa": dict(
   pa_so2=(None, None, None), pa_so2_note="Reported: = aortic saturation (the duct is the only inflow).",
   title="Tetralogy of Fallot with pulmonary atresia on PGE1",
   desc="Term neonate 3.545 kg at 72 h with ToF and pulmonary atresia (no MAPCAs): no antegrade flow, all RV output R->L through the VSD, ductus (2.5 mm, PGE1) is the sole pulmonary supply.",
   spo2=(80, 70, 88), spo2_src=["matter2012", "rudolph2009"], spo2_grade="B", spo2_note="Matter 2012 pre-stent (on PGE1) 75.1 +/- 13.2 %. Complete mixing in the aorta: SaO2 is set by Qp:Qs (Rudolph); Qp:Qs ~1 gives ~80 %.",
   svo2=(60, 55, 65), svo2_note="By analogy with Fig 14.3.",
   qpqs=(1.0, 0.8, 1.3), qpqs_note="C: complete-mixing relation with SaO2 80 % (PV 97, venous 60).",
   pap_s=(20, 15, 28), pap_m=(15, 10, 20), pap_note="C: by analogy (restrictive 2.5 mm duct as sole supply). No data.", pap_grade="C",
   grad=(None, None, None), grad_src=[], grad_grade="-", grad_note="Not applicable (atresia).",
   v=(None, None, None), v_note="Not applicable.",
   step=(None, None, None), step_note="Not applicable.",
   vsd=(None, None, 0), vsd_note="R->L: the whole RV output leaves through the VSD.",
   rvpa=(0, 0, 0), rvpa_note="Atresia: no antegrade flow.",
   duct=(None, 0, None), duct_src=["matter2012"], duct_note="Ao->PA, = Qp. Structural 2.5 mm on PGE1 (Matter 2012 narrowest 1.9 +/- 0.6 mm).",
   pvz=(None, None, None), pvz_src=[], pvz_note="Not applicable (atresia).",
   closed=[
     row("spo2_closed", "test", "SpO2 after duct closure", "%", None, None, 40, ["rudolph2009"], "C", "probe --close-duct: Monitor.sao2_pre", "Sole pulmonary supply: closure is not survivable without MAPCAs (Rudolph). Expect collapse.", method="rule"),
   ]),
}

for name, d in P.items():
    rows = shared() + ph(name, d)
    used = sorted({s for r in rows for s in r["sources"]})
    src = {k: (SOURCES.get(k) or term["sources"][k]) for k in used}
    out = {"name": name, "title": d["title"], "description": d["desc"], "state": "calm, mixed sleep/awake",
           "compiled": "2026-10-30", "doc": "docs/TofReference.md", "base": "term_neonate_72h",
           "grades": "A = neonatal ToF primary data/definition; B = infant ToF, textbook figure or fetal; C = derived, interpolated or borrowed from term_neonate_72h",
           "sources": src, "variables": rows}
    json.dump(out, open(f"{ENG}/scripts/reference/{name}.json", "w"), indent=1, ensure_ascii=False)
    print(name, len(rows), "rows,", len(src), "sources")
