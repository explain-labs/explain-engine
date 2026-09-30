// Diagram TITLE labels for the generated scenarios, keyed by scenario name. Every generated scenario
// starts from a copy of a baseline JSON, whose diagram_definition.components.TITLE.label ("NORMAL NEONATE
// (24H, SHUNTS CLOSED)") would otherwise be inherited unchanged. The _make_*.mjs scripts call
// setDiagramTitle(j, j.name) before writing; scripts/_add_titles.mjs applies the map to the existing
// files in place (the title is not model state, so no reseed is needed).
// Hand-authored baselines (term_neonate, adult_female*) keep their own titles and are not listed here.

export const TITLES = {
  term_fetus: "TERM FETUS (40 WK, 3.5 KG)",
  fetus_30wk: "FETUS (30 WK, 1.35 KG)",
  preterm_24wk: "PRETERM NEONATE (24 WK, 0.64 KG)",
  preterm_26wk: "PRETERM NEONATE (26 WK, 0.85 KG)",
  preterm_28wk: "PRETERM NEONATE (28 WK, 1.0 KG)",
  preterm_30wk: "PRETERM NEONATE (30 WK, 1.35 KG)",
  preterm_32wk: "PRETERM NEONATE (32 WK, 1.7 KG)",
  preterm_34wk: "PRETERM NEONATE (34 WK, 2.2 KG)",
  preterm_36wk: "PRETERM NEONATE (36 WK, 2.7 KG)",
  preterm_28wk_restrictive_pda: "PRETERM 28 WK - RESTRICTIVE PDA",
  bischoff_cohort: "PRETERM COHORT (~25 WK, 0.72 KG, CPAP)",
  term_neonate_cdh: "CONGENITAL DIAPHRAGMATIC HERNIA",
  cdh_severe: "CDH - SEVERE",
  cdh_moderate: "CDH - MODERATE",
  cdh_lv_dysfunction: "CDH - LV DYSFUNCTION",
  pphn: "PERSISTENT PULMONARY HYPERTENSION (PPHN)",
  dtga: "TRANSPOSITION OF THE GREAT ARTERIES",
  hlhs: "HYPOPLASTIC LEFT HEART SYNDROME",
  hlhs_restrictive: "HLHS - RESTRICTIVE ATRIAL SEPTUM",
  critical_ps: "CRITICAL PULMONARY STENOSIS",
  pa_ivs: "PULM. ATRESIA - INTACT VENTRICULAR SEPTUM",
  pa_vsd: "PULMONARY ATRESIA WITH VSD",
  tof: "TETRALOGY OF FALLOT (24H, 3.3 KG)",
  tof_pink: "TETRALOGY OF FALLOT - PINK (24H, 3.3 KG)",
  tof_severe: "SEVERE TETRALOGY OF FALLOT ON PGE1 (24H)",
  tof_pa: "TETRALOGY OF FALLOT + PULM. ATRESIA (24H)",
  tricuspid_atresia: "TRICUSPID ATRESIA",
  critical_as: "CRITICAL AORTIC STENOSIS",
  iaa: "INTERRUPTED AORTIC ARCH",
  coarctation: "COARCTATION OF THE AORTA",
  tapvc: "TAPVC - UNOBSTRUCTED",
  tapvc_obstructed: "TAPVC - OBSTRUCTED",
  pda_restrictive_ltr: "PDA - RESTRICTIVE, LEFT-TO-RIGHT",
  pda_unrestrictive_ltr: "PDA - UNRESTRICTIVE, LEFT-TO-RIGHT",
  pda_restrictive_rtl: "PDA - RESTRICTIVE, RIGHT-TO-LEFT (PPHN)",
  pda_unrestrictive_rtl: "PDA - UNRESTRICTIVE, RIGHT-TO-LEFT (PPHN)",
  pda_bidirectional: "PDA - RESTRICTIVE, BIDIRECTIONAL",
  pda_bidirectional_unrestrictive: "PDA - UNRESTRICTIVE, BIDIRECTIONAL",
};

// Set the diagram TITLE of scenario JSON `j` for scenario `key`. Returns the title set, or null when the
// key is unmapped or the diagram has no TITLE (the label is then left untouched).
export function setDiagramTitle(j, key) {
  const title = TITLES[key];
  const t = j?.diagram_definition?.components?.TITLE;
  if (!title || !t) {
    if (!title) console.error(`setDiagramTitle: no title mapped for "${key}" (add it to scripts/_titles.mjs)`);
    return null;
  }
  t.label = title;
  return title;
}
