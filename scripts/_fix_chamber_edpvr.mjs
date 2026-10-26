// Non-linear diastolic pressure-volume relation (EDPVR) for the heart chambers.
//
// All chambers had a linear diastolic relation (el_k = 0): filling pressure rose linearly with volume,
// so a volume load raised stroke volume without limit (term_neonate_72h, +30 mL with the reflexes off:
// SV +34 %). Volume-normalised EDPVRs share a steep power-law shape, EDP ~ V^2.79 (Klotz 2006); the
// engine's diastolic term is el_min*S + el_k*S^2 (S = V - u_vol), so the closest it gets is a pure
// quadratic. Per scenario this tool:
//   1. measures the resting LV/RV end-diastolic volumes and the mean LA/RAIVCI/RASVC volumes,
//   2. moves a share phi of each chamber's resting diastolic pressure into the quadratic term (phi = 1,
//      a pure quadratic, by default): el_min = (1-phi)*el_min_old, el_k = phi*el_min_old/S0,
//   3. iterates each el_k until the ventricles' end-diastolic volumes and the atria's mean volumes are
//      back at rest (guard: atrial filling pressures within 10 %, MAP within 0.5 mmHg),
// (the two right-atrial halves share one el_k, fitted to their combined volume, and their connector
// RAIVCI_RASVC becomes implicit: with the stiffening atria its explicit scheme oscillates),
// and with --write patches only el_min and el_k of the five chambers (the rest of the file is left
// byte-identical). The diastolic modulation (relax_factor, lusitropy, ANS) scales el_k as well
// (HeartChamber.calc_elastances), so it keeps working.
//
//   node scripts/_fix_chamber_edpvr.mjs <scenario> [...] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
// share of the resting diastolic pressure carried by the quadratic term (1 = pure quadratic)
const PHI_ATRIA = opt("--atrial-phi", 1.0);
const ITER = opt("--iter", 10), STEP = opt("--step", 1.0); // fit iterations and update exponent
const PHI = { LV: 1, RV: 1, LA: PHI_ATRIA, RAIVCI: PHI_ATRIA, RASVC: PHI_ATRIA };
const valued = new Set(["--atrial-phi", "--iter", "--step"]);
const names = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const CH = ["LV", "RV", "LA", "RAIVCI", "RASVC"];
const WARM = 20, MEASURE = 20;

const eng = await createEngine();

// mean reference volume per chamber: ventricles at end-diastole, atria over the whole cycle (L)
function measure(def, apply) {
  const m = eng.build(structuredClone(def));
  if (apply) apply(m.models);
  eng.calc(WARM);
  const M = m.models, H = M.Heart;
  const acc = Object.fromEntries(CH.map((c) => [c, 0]));
  const pin = { LA: 0, RA: 0 };
  let n = 0, map = 0;
  for (let i = 0; i < MEASURE / 0.005; i++) {
    eng.calc(0.005);
    acc.LV += H.lv_edv; acc.RV += H.rv_edv;
    for (const c of ["LA", "RAIVCI", "RASVC"]) acc[c] += M[c].vol;
    pin.LA += M.LA.pres_in; pin.RA += 0.5 * (M.RAIVCI.pres_in + M.RASVC.pres_in);
    map += M.AA.pres; n++;
  }
  for (const c of CH) acc[c] /= n;
  pin.LA /= n; pin.RA /= n;
  return { v: acc, p: pin, map: map / n, u: Object.fromEntries(CH.map((c) => [c, M[c].u_vol])) };
}

// the [start, end) span of the object `"name": { … }` inside model_definition with its own model_type
function findModelBlock(src, name) {
  let from = src.indexOf('"model_definition"');
  for (;;) {
    const start = src.indexOf(`"${name}": {`, from);
    if (start < 0) throw new Error(`${name} not found`);
    let depth = 0, end = start;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (/\n\s*"model_type": "/.test(src.slice(start, end))) return [start, end];
    from = end;
  }
}
function setInBlock(src, name, key, value) {
  const [start, end] = findModelBlock(src, name);
  const re = new RegExp(`("${key}": )(-?[0-9.eE+-]+|true|false)`);
  const block = src.slice(start, end);
  if (!re.test(block)) throw new Error(`${name}.${key} not found`);
  return src.slice(0, start) + block.replace(re, `$1${value}`) + src.slice(end);
}

for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  const def = JSON.parse(src).model_definition;
  const hc = def.models.Heart.components;
  const base = measure(def);
  const elk = Object.fromEntries(CH.map((c) => [c, PHI[c] * hc[c].el_min / (base.v[c] - base.u[c])]));
  const elmin = Object.fromEntries(CH.map((c) => [c, +((1 - PHI[c]) * hc[c].el_min).toPrecision(6)]));
  elk.RAIVCI = elk.RASVC = 0.5 * (elk.RAIVCI + elk.RASVC);
  let res = null, best = null;
  for (let it = 0; it < ITER; it++) {
    const elkUsed = { ...elk };
    if (process.env.EDPVR_TRACE && it === 0) out(`  start: ` + CH.map((c) => `${c} el_min ${elmin[c]} el_k ${elk[c].toExponential(3)}`).join(", "));
    res = measure(def, (M) => {
      for (const c of CH) { M[c].el_min = elmin[c]; M[c].el_k = elkUsed[c]; }
      // the joined right-atrial halves stiffen with filling (local elastance el_min + 2·el_k·S): the explicit
      // scheme of their low-resistance connector then oscillates (sign flip every step), so it goes implicit
      M.RAIVCI_RASVC.implicit = true;
    });
    let worst = 0;
    // ventricles: the end-diastolic volume; LA: its mean volume
    for (const c of ["LV", "RV", "LA"]) {
      const s = res.v[c] - base.u[c], s0 = base.v[c] - base.u[c];
      worst = Math.max(worst, Math.abs(s / s0 - 1));
      elk[c] *= (s / s0) ** STEP; // pressure ~ el_k·S²; a full step (exponent 2) overshoots, so damp it
    }
    // the two halves of the right atrium are one pool (joined by RAIVCI_RASVC): one shared el_k, fitted to
    // their combined volume. Fitted separately, the pair is nearly indeterminate near u_vol 0 (a quadratic
    // has no stiffness at S = 0) and the blood sloshes from one half into the other
    {
      const s = res.v.RAIVCI + res.v.RASVC - base.u.RAIVCI - base.u.RASVC;
      const s0 = base.v.RAIVCI + base.v.RASVC - base.u.RAIVCI - base.u.RASVC;
      worst = Math.max(worst, Math.abs(s / s0 - 1));
      const k = 0.5 * (elk.RAIVCI + elk.RASVC) * (s / s0) ** STEP;
      elk.RAIVCI = k; elk.RASVC = k;
    }
    // keep the best iterate (measured before this update): the scenario's reflexes and shunts can make
    // later iterates worse, and a runaway fit must not be what gets written
    if (!best || worst < best.worst) best = { worst, res, elk: { ...elkUsed } };
    if (process.env.EDPVR_TRACE) out(`  it ${it}: LV ${(res.v.LV * 1e3).toFixed(3)}/${(base.v.LV * 1e3).toFixed(3)} RV ${(res.v.RV * 1e3).toFixed(3)}/${(base.v.RV * 1e3).toFixed(3)} LAp ${res.p.LA.toFixed(2)}/${base.p.LA.toFixed(2)} RAp ${res.p.RA.toFixed(2)}/${base.p.RA.toFixed(2)} MAP ${res.map.toFixed(2)} | elk LA ${elkUsed.LA.toExponential(2)} RA ${elkUsed.RAIVCI.toExponential(2)}`);
    if (worst < 0.002) break;
  }
  res = best.res;
  Object.assign(elk, best.elk);
  const ok = (c) => Math.abs((res.v[c] - base.u[c]) / (base.v[c] - base.u[c]) - 1) < 0.01;
  // the volumes must be back at rest, and as a guard the atrial filling pressures must not have moved:
  // in the small left-to-right-duct patients (preterm_25wk, and the since-removed bischoff_ltr_pda) the atrial volume barely
  // responds to the atrial stiffness, and fitting it drove the LA soft until its pressure collapsed
  // (preterm_25wk: LA 3.2 -> -1.4 mmHg, foramen ovale reversed). Fitting their atria on pressure fails too
  // (neither the atrial pressures nor the ventricular volumes respond: the circulation around the heart sets
  // them). Those two take the closed-form start, el_k = el_min_old / S0, unfitted (--iter 1 --force): it is
  // within 2-4 % of every resting volume and pressure, and their reference values hold (re-validation (a)).
  const ra = (v) => v.RAIVCI + v.RASVC - base.u.RAIVCI - base.u.RASVC;
  const okp = (a) => Math.abs(res.p[a] / base.p[a] - 1) < 0.1;
  const converged = ok("LV") && ok("RV") && ok("LA") && Math.abs(ra(res.v) / ra(base.v) - 1) < 0.01 &&
    okp("LA") && okp("RA") && Math.abs(res.map - base.map) < 0.5;
  out(`${name}: ` + CH.map((c) => `${c} ${(base.v[c] * 1e3).toFixed(2)}->${(res.v[c] * 1e3).toFixed(2)} mL el_k ${elk[c].toExponential(3)}`).join(", ") +
    ` | LA p_in ${base.p.LA.toFixed(2)}->${res.p.LA.toFixed(2)}, RA p_in ${base.p.RA.toFixed(2)}->${res.p.RA.toFixed(2)}` +
    ` | MAP ${base.map.toFixed(2)} -> ${res.map.toFixed(2)}`);
  if (!converged && !argv.includes("--force")) { out(`${name}: NOT converged, not written`); continue; }
  if (!WRITE) continue;
  let patched = src;
  const expected = JSON.parse(src);
  for (const c of CH) {
    const v = +elk[c].toPrecision(6);
    patched = setInBlock(patched, c, "el_min", elmin[c]);
    patched = setInBlock(patched, c, "el_k", v);
    expected.model_definition.models.Heart.components[c].el_min = elmin[c];
    expected.model_definition.models.Heart.components[c].el_k = v;
  }
  patched = setInBlock(patched, "RAIVCI_RASVC", "implicit", true);
  expected.model_definition.models.Heart.components.RAIVCI_RASVC.implicit = true;
  if (JSON.stringify(JSON.parse(patched)) !== JSON.stringify(expected)) throw new Error(`${name}: patch changed more than intended`);
  fs.writeFileSync(file, patched);
  out(`${name}: written`);
}
