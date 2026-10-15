// One-off repair: give the stored preterm / Bischoff / fetal scenarios the healthy renal reference of
// their own gestation and size (scripts/_renal_reference.mjs, solved by scripts/_renal_bed.mjs).
//
//   node scripts/_fix_renal_bed.mjs <scenario> [<scenario> ...] [--seconds 120] [--write] [--check-term]
//
// Dry run by default: it prints, per scenario, the renal reference, the solver's iterations, and the
// renal panel and vitals before and after, and writes nothing. --write serializes the repaired model
// the way the app's save-state does (scripts/_serialize_state.mjs).
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { renalReference, describeRenalReference, TERM_RENAL } from "./_renal_reference.mjs";
import { measureRenal, measureTermReference, solveRenalBed } from "./_renal_bed.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 120; })();
const WRITE = argv.includes("--write");
const names = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--seconds");
if (!names.length) { console.error("usage: node scripts/_fix_renal_bed.mjs <scenario> [...] [--seconds 120] [--write]"); process.exit(1); }

const dir = new URL("../model_definitions/", import.meta.url);
const read = (n) => JSON.parse(fs.readFileSync(new URL(`${n}.json`, dir), "utf8"));
const flatten = (models) => {
  const out = {};
  const walk = (o) => { for (const [k, m] of Object.entries(o)) if (m && m.model_type) { out[k] = m; if (m.components) walk(m.components); } };
  walk(models);
  return out;
};
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

const eng = await createEngine();
const termMd = read("term_neonate").model_definition;
const termBrMap = flatten(termMd.models).BR_MAP.set_value;
// --check-term re-measures the term kidney the constant TERM_RENAL was taken from
if (argv.includes("--check-term")) {
  const t = measureTermReference(eng, termMd, termBrMap);
  out(`term_neonate now: GFR ${t.gfr.toFixed(2)} mL/min, RBF ${t.rbf.toFixed(1)} mL/min (RBF/GFR ${t.rbfPerGfr.toFixed(1)}), kf ${t.kf.toExponential(2)} — TERM_RENAL: RBF/GFR ${TERM_RENAL.rbfPerGfr}, kf ${TERM_RENAL.kf}`);
}
const TERM = TERM_RENAL;

function vitals(M) {
  const AA = M.AA, Mon = M.Monitor;
  return { hr: Mon?.heart_rate ?? M.Heart.heart_rate, ph: AA.ph, pco2: AA.pco2, spo2: Mon?.sao2_pre };
}
const fmt = (s, v, w) => `MAP ${s.map.toFixed(1)} | KID_ART ${s.art.toFixed(1)} KID_CAP ${s.cap.toFixed(1)} | RBF ${(s.rbf / w).toFixed(1)}/kg GFR ${(s.gfr / w).toFixed(2)}/kg NFP ${s.nfp.toFixed(2)}` +
  ` | HR ${v.hr?.toFixed(0)} pH ${v.ph?.toFixed(3)} pCO2 ${v.pco2?.toFixed(1)} SpO2 ${v.spo2?.toFixed(1)}`;

for (const name of names) {
  const json = read(name);
  const md = json.model_definition;
  const brMap = flatten(md.models).BR_MAP.set_value;
  const ref = renalReference({ ga: md.gestational_age, weight: md.weight, height: md.height, brMap }, TERM);
  out(`\n${name}: GA ${md.gestational_age}, ${md.weight} kg, BR_MAP ${brMap} — ${describeRenalReference(ref)}`);
  if (!ref) continue;

  // before: the stored scenario as it is
  let model = eng.build(structuredClone(md));
  eng.calc(SECONDS);
  out(`  before: ${fmt(measureRenal(eng, model.models), vitals(model.models), model.weight)}`);

  // repair a fresh copy
  model = eng.build(md);
  const M = model.models;
  const res = solveRenalBed(eng, model, ref, { brMap, termBrMap, log: out });
  eng.calc(SECONDS);
  const s = measureRenal(eng, M);
  out(`  after:  ${fmt(s, vitals(M), model.weight)}`);
  out(`  controllers: afferent ${M.Kidneys.afferent_factor.toFixed(2)} (myo ${M.Kidneys.myogenic_factor.toFixed(2)}, tgf ${M.Kidneys.tgf_factor.toFixed(2)}), ` +
    `angiotensin ${M.Hormones?.angiotensin?.toFixed(2)}, efferent_factor ${M.Hormones?.efferent_factor?.toFixed(2)} | ` +
    `KID_ART.r_for ${res.kid_art_r_for.toFixed(0)}, KID_VEN.r_for ${res.kid_ven_r_for.toFixed(0)}, myogenic set ${res.myogenic_p_set.toFixed(1)}, tgf set ${res.tgf_setpoint.toFixed(0)}`);

  if (WRITE) {
    json.model_definition = serializeState(model);
    const text = JSON.stringify(json, null, 1) + "\n";
    JSON.parse(text);
    fs.writeFileSync(new URL(`${name}.json`, dir), text);
    out(`  written`);
  }
}
