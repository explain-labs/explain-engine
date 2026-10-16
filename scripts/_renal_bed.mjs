// Set a live model's renal bed to its healthy renal reference (scripts/_renal_reference.mjs) and seed
// the kidney's controllers at that resting state.
//
// The renal bed is AD -[afferent]-> KID_ART -[KID_CAP vessel]-> KID_CAP -[efferent]-> KID_VEN -> VLB.
// A BloodVessel pushes its composed resistance onto its INPUT resistor every step, so the afferent
// resistance is KID_ART's and the efferent resistance is KID_VEN's (times the efferent resistor's own
// layers, which Hormones writes). The structural values go into the vessels' base r_for, the only
// layer nobody else owns: KID_ART.r_factor_ps belongs to the Kidneys autoregulation, the efferent
// resistor's r_factor_ps to Hormones, and the vessels' r_factor_scaling_ps can be overwritten by the
// builder's eng.scale(...) groups.
//
// solveRenalBed():
//   1. Kidneys gets p_bowman, oncotic_base and kf of the reference.
//   2. With autoregulation off and Hormones released (neutral), the efferent resistor's own layers
//      return to 1 (any old RAAS excess is folded into the base), and KID_ART.r_for / KID_VEN.r_for
//      are iterated until renal blood flow and the glomerular (KID_CAP) pressure meet the targets.
//   3. The controllers are seeded at that resting state: myogenic set-point = KID_ART pressure (its
//      window keeps the term width, scaled by the gestation's MAP), TGF set-point = GFR x Na, and
//      Hormones' perfusion_setpoint = KID_ART pressure. Then autoregulation and Hormones run again.
export function avg(eng, fn, seconds = 5, dt = 0.005) {
  let a = 0, n = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) { eng.calc(dt); a += fn(); n++; }
  return a / n;
}

// renal state at rest (pressures mmHg, flows mL/min)
export function measureRenal(eng, M, seconds = 5) {
  const K = M.Kidneys, E = M.KID_CAP_KID_VEN;
  const s = { ad: 0, art: 0, cap: 0, ven: 0, rbf: 0, gfr: 0, nfp: 0, map: 0 };
  const n = Math.round(seconds / 0.005);
  for (let i = 0; i < n; i++) {
    eng.calc(0.005);
    s.ad += M.AD.pres; s.art += M.KID_ART.pres; s.cap += M.KID_CAP.pres; s.ven += M.KID_VEN.pres;
    s.rbf += E.flow * 60000; s.gfr += K.gfr; s.nfp += K.nfp; s.map += M.AA.pres;
  }
  for (const k of Object.keys(s)) s[k] /= n;
  return s;
}

// term reference the rules scale from (term_neonate's own kidney at rest)
export function measureTermReference(eng, termDef, brMap) {
  const model = eng.build(termDef);
  eng.calc(60);
  const M = model.models, K = M.Kidneys;
  const s = measureRenal(eng, M, 10);
  const kf = K.kf * (1 + (K.kf_factor_ps - 1) + (K.kf_factor_scaling_ps - 1));
  return { weight: model.weight, height: model.height, kf, brMap, rbfPerGfr: s.rbf / s.gfr, gfr: s.gfr, rbf: s.rbf };
}

export function solveRenalBed(eng, model, ref, { brMap, termBrMap, iterations = 12, warm = 30, tol = 0.02, log = () => {} } = {}) {
  const M = model.models, K = M.Kidneys, H = M.Hormones;
  const A = M.KID_ART, V = M.KID_VEN, E = M.KID_CAP_KID_VEN;

  // 1. filtration terms
  K.p_bowman = ref.p_bowman;
  K.oncotic_base = ref.oncotic_base;
  K.kf = ref.kf; K.kf_factor_ps = 1.0; K.kf_factor_scaling_ps = 1.0;

  // 2. open loop: autoregulation off, Hormones released, efferent resistor's own layers neutral
  const autoreg = K.autoregulation_enabled;
  K.autoregulation_enabled = false;
  const hormones = H ? H.hormones_running : false;
  if (H) H.hormones_running = false;
  eng.calc(1); // let both release their channels
  // a controller switched off before its first step never releases, so neutralise its channels
  // explicitly: a stored afferent factor (e.g. the 0.50 dilation floor) must not stay in the solve
  A.r_factor_ps = 1.0;
  E.r_factor_ps = 1.0; E.r_factor_scaling_ps = 1.0;

  let s, it = 0;
  for (; it < iterations; it++) {
    eng.calc(warm);
    s = measureRenal(eng, M);
    const errQ = s.rbf / ref.rbf - 1, errP = s.cap / ref.p_cap - 1;
    log(`  iter ${it}: RBF ${s.rbf.toFixed(2)}/${ref.rbf.toFixed(2)} mL/min, KID_CAP ${s.cap.toFixed(2)}/${ref.p_cap.toFixed(2)} mmHg, KID_ART.r_for ${A.r_for.toFixed(0)}, KID_VEN.r_for ${V.r_for.toFixed(0)}`);
    if (Math.abs(errQ) < tol && Math.abs(errP) < tol / 2) break;
    const Q = s.rbf / 60000, Qt = ref.rbf / 60000; // L/s
    // efferent: (KID_CAP - KID_VEN) / Q, proportional to KID_VEN.r_for (every layer multiplies it)
    const effNow = (s.cap - s.ven) / Q, effNeed = (ref.p_cap - s.ven) / Qt;
    // afferent: (AD - KID_ART) / Q; the KID_CAP vessel segment (KID_ART - KID_CAP) is kept
    const intra = (s.art - s.cap) / Q;
    const affNow = (s.ad - s.art) / Q, affNeed = (s.ad - ref.p_cap) / Qt - intra;
    if (!(effNeed > 0 && affNeed > 0)) { log(`  infeasible: AD ${s.ad.toFixed(1)}, KID_VEN ${s.ven.toFixed(1)} vs KID_CAP target ${ref.p_cap.toFixed(1)}`); break; }
    V.r_for *= effNeed / effNow;
    A.r_for *= affNeed / affNow;
  }

  // 3. seed the controllers at this resting state, then close the loops again
  s = measureRenal(eng, M);
  const r = brMap / termBrMap;
  const width = { below: (40 - 25) * r, above: (65 - 40) * r }; // term window 25-40-65 mmHg
  K.myogenic_p_set = s.art;
  K.myogenic_p_min = s.art - width.below;
  K.myogenic_p_max = s.art + width.above;
  const na = M.KID_CAP.solutes?.na;
  K.tgf_setpoint = K.tgf_use_nacl && na !== undefined ? s.gfr * na : s.gfr;
  K.myogenic_factor = K.tgf_factor = K.afferent_factor = 1.0;
  K.autoregulation_enabled = autoreg;
  if (H) { H.perfusion_setpoint = s.art; H.hormones_running = hormones; }
  return { iterations: it, rest: s, kid_art_r_for: A.r_for, kid_ven_r_for: V.r_for, myogenic_p_set: K.myogenic_p_set, tgf_setpoint: K.tgf_setpoint };
}
