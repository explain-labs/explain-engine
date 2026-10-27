// Healthy renal reference of an immature patient: the glomerular filtration terms and the renal-bed
// targets a patient built below 34 weeks should rest at, by gestational age and size (used by
// scripts/build_patient.mjs). With term_neonate_72h's kidney such a patient filters nothing (Bowman's
// pressure 8 + oncotic 18 = 26 mmHg against a glomerular pressure of 18-25 mmHg at <= 30 wk). The rules below were chosen with the model's author, one point
// at a time (see docs/Kidneys.md):
//
//   GFR target          Vieux 2010 (Pediatrics, doi 10.1542/peds.2009-1426) day-7 medians, 7.9 at
//                       27 wk -> 30.3 mL/min per 1.73 m2 at 31 wk, exponential (x1.4/wk, as
//                       Gordjani 1988 describes clearance rising with GA), extrapolated down to
//                       24 wk; a plateau of 30.3 from 31 wk on.
//   oncotic_base        measured plasma COP: healthy preterm ~15 vs term ~17-19 mmHg (Crit Care Med
//                       1981, doi 10.1097/00003246-198108000-00001). 15 at <= 28 wk, linear to 18 at
//                       40 wk. Kidney only: blood albumin also feeds the acid-base (Figge) term.
//   p_bowman            8 x BR_MAP set-point / 50: falls with the gestation's MAP. Immature
//                       transglomerular gradient is only modestly lower (Ichikawa 1979, doi
//                       10.1152/ajprenal.1979.236.5.F465), so Bowman's pressure falls with the
//                       glomerular pressure.
//   kf                  term kf x body surface / term body surface (Mosteller): the filtration
//                       surface grows with the body.
//   renal blood flow    follows the GFR target at term's filtration fraction (inulin and PAH
//                       clearance rise in parallel 28 -> 35 wk: Fawer 1979, PMID 429191).
//   glomerular pressure p_bowman + oncotic + GFR target / kf (what that kf needs to filter it).
//   gfrFactor           optional multiplier on the GFR target (default 1), for a scenario whose own
//                       reference set places GFR off this curve. Renal blood flow follows it.
//
// Scenarios at >= 34 wk keep their kidney unchanged (their GFR already sits on the plateau).
export const RENAL_GA_LIMIT = 34;

// The term kidney the rules scale from: term_neonate_72h at rest, measured 2026-10-15 with
// measureTermReference() (scripts/_renal_bed.mjs) — GFR 4.19 mL/min, renal blood flow 88.0 mL/min.
// A constant, because the engine holds one model at a time and the builder cannot build term_neonate_72h
// beside its patient. Re-measure it if term_neonate_72h's kidney is recalibrated.
export const TERM_RENAL = { weight: 3.545, height: 0.519, kf: 6.0e-6, brMap: 50, rbfPerGfr: 21.0 };

const VIEUX = { ga0: 27, gfr0: 7.9, ga1: 31, gfr1: 30.3 }; // mL/min per 1.73 m2, day 7

export const bsa = (weightKg, heightM) => Math.sqrt(heightM * 100 * weightKg / 3600); // Mosteller, m2

// GFR target per 1.73 m2 at a gestational age (weeks)
export function gfrTargetPer173(ga) {
  if (ga >= VIEUX.ga1) return VIEUX.gfr1;
  return VIEUX.gfr0 * Math.pow(VIEUX.gfr1 / VIEUX.gfr0, (ga - VIEUX.ga0) / (VIEUX.ga1 - VIEUX.ga0));
}

export const oncoticByGa = (ga) => Math.min(18.0, 15.0 + 3.0 * Math.max(0, ga - 28) / 12);

// The term reference the rules scale from: term_neonate_72h's own kidney at rest.
//   term: { weight, height, kf (effective, L/s/mmHg), brMap, rbfPerGfr (renal blood flow / GFR) },
//         TERM_RENAL unless given
// Returns null when the scenario keeps its kidney (ga >= RENAL_GA_LIMIT).
export function renalReference({ ga, weight, height, brMap, gfrFactor = 1 }, term = TERM_RENAL) {
  if (ga >= RENAL_GA_LIMIT) return null;
  const s = bsa(weight, height), sTerm = bsa(term.weight, term.height);
  const p_bowman = 8.0 * brMap / term.brMap;
  const oncotic_base = oncoticByGa(ga);
  const kf = term.kf * s / sTerm;
  const gfr = gfrTargetPer173(ga) * s / 1.73 * gfrFactor; // mL/min
  const rbf = gfr * term.rbfPerGfr; // mL/min
  const nfp = gfr / 60000 / kf; // mmHg
  const p_cap = p_bowman + oncotic_base + nfp; // glomerular (KID_CAP) pressure target, mmHg
  return { ga, weight, bsa: s, p_bowman, oncotic_base, kf, gfr, rbf, nfp, p_cap, gfrFactor };
}

export function describeRenalReference(r) {
  if (!r) return "kidney unchanged (>= " + RENAL_GA_LIMIT + " wk)";
  return `renal reference: GFR ${r.gfr.toFixed(2)} mL/min${r.gfrFactor !== 1 ? ` (x${r.gfrFactor})` : ""} (${(r.gfr / r.weight).toFixed(2)}/kg), RBF ${(r.rbf / r.weight).toFixed(1)} mL/min/kg, ` +
    `KID_CAP ${r.p_cap.toFixed(1)} mmHg (Bowman ${r.p_bowman.toFixed(1)} + oncotic ${r.oncotic_base.toFixed(1)} + NFP ${r.nfp.toFixed(2)}), kf ${r.kf.toExponential(2)}`;
}
