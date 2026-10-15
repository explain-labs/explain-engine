// One-off repair: give the stored preterm / Bischoff / fetal scenarios the healthy Hormones references
// of their own size and gestation, while keeping each patient's calibrated resting state.
//
//   node scripts/_fix_hormone_references.mjs <scenario> [<scenario> ...] [--seconds 300] [--write]
//
// The problem: these scenarios were derived from term_neonate and kept its Hormones set-points
// (volume_setpoint 0.286 L, perfusion_setpoint 40 mmHg). A 0.72-2.7 kg infant read as hypovolaemic
// and hypoperfused at rest, so RAAS ran at angiotensin x1.75-5 and its effectors had constricted the
// systemic arterioles (Circulation.svr_factor_art up to x2.25), the venules and the renal efferent
// arteriole. Each scenario was then calibrated (MAP, gases) with that constriction in place.
//
// The repair, per scenario:
//   1. Hormones gets the healthy references of this patient (scripts/_reference.mjs): blood volume
//      scaled from the term reference by weight, renal perfusion by the gestation's MAP set-point
//      (BR_MAP.set_value) against term's.
//   2. The constriction RAAS was holding stays, as a persistent scenario adjustment, so the resting
//      haemodynamics stay as calibrated. Circulation applies svr_factor_art/ven to the systemic
//      arterioles' and venules' r_factor_ps as DELTAS, so that layer already holds it; setting
//      svr_factor_art/ven AND their prev_* to 1.0 makes Circulation forget it was RAAS's without
//      removing it. (It must not move to r_factor_scaling_ps: the builder's MAP lever,
//      eng.scale("systemic_resistances"), sets that layer absolutely and would wipe it.) The renal
//      efferent resistor is different: Hormones writes its r_factor_ps absolutely, so its excess
//      moves into the resistor's own r_factor_scaling_ps (Resistor composes these additively; no
//      scale group lists that resistor).
//   3. Hormones and its channels restart neutral (activities 1.0, Kidneys reabsorption factors 1.0).
//   4. The model warms for --seconds and is serialized the way the app's save-state does.
//
// The renal reabsorption factors are the one resting quantity that is not carried over (they return
// to 1.0); they were within 1-4 % of neutral and filtration is zero in the smallest of these
// scenarios anyway (see the Kidneys follow-up).
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { scaleHormoneReferences, describeHormoneReferences } from "./_reference.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const WRITE = argv.includes("--write");
const names = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--seconds");
if (!names.length) { console.error("usage: node scripts/_fix_hormone_references.mjs <scenario> [...] [--seconds 300] [--write]"); process.exit(1); }

const dir = new URL("../model_definitions/", import.meta.url);
const read = (n) => JSON.parse(fs.readFileSync(new URL(`${n}.json`, dir), "utf8"));
const flatten = (models) => {
  const out = {};
  const walk = (o) => { for (const [k, m] of Object.entries(o)) if (m && m.model_type) { out[k] = m; if (m.components) walk(m.components); } };
  walk(models);
  return out;
};

// the term reference everything is scaled from
const termMd = read("term_neonate").model_definition;
const termFlat = flatten(termMd.models);
const TERM = { weight: termMd.weight, brMap: termFlat.BR_MAP.set_value, volume: termFlat.Hormones.volume_setpoint, perfusion: termFlat.Hormones.perfusion_setpoint };

const eng = await createEngine();
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

for (const name of names) {
  const json = read(name);
  const model = eng.build(json.model_definition);
  const M = model.models;
  const H = M.Hormones, C = M.Circulation;
  if (!H || !C) { out(`${name}: no Hormones/Circulation, skipped`); continue; }
  if (H.volume_setpoint !== TERM.volume || H.perfusion_setpoint !== TERM.perfusion) {
    out(`${name}: Hormones set-points are not the term reference (${H.volume_setpoint} L, ${H.perfusion_setpoint} mmHg), skipped`);
    continue;
  }
  const log = [];

  // 1. healthy references of this patient
  const r = scaleHormoneReferences(model, { volumeFactor: model.weight / TERM.weight, mapRef: M.BR_MAP.set_value, mapRefBaseline: TERM.brMap });
  log.push(describeHormoneReferences(r));

  // 2. keep the RAAS constriction where Circulation put it (r_factor_ps); see the header
  log.push(`kept in r_factor_ps as a scenario adjustment: arterioles x${C.svr_factor_art.toFixed(3)}, venules x${C.svr_factor_ven.toFixed(3)} (Circulation svr_factor_art/ven reset to 1 without a delta)`);
  const eff = M[H.efferent_name];
  if (eff && eff.r_factor_ps !== 1.0) {
    log.push(`moved into ${H.efferent_name}.r_factor_scaling_ps: +${(eff.r_factor_ps - 1).toFixed(3)}`);
    eff.r_factor_scaling_ps += eff.r_factor_ps - 1.0;
    eff.r_factor_ps = 1.0;
  }

  // 3. neutral restart
  C.svr_factor_art = C.prev_svr_factor_art = 1.0;
  C.svr_factor_ven = C.prev_svr_factor_ven = 1.0;
  for (const k of ["renin", "angiotensin", "aldosterone", "adh", "svr_factor", "svr_ven_factor", "efferent_factor", "na_reabs_factor", "k_reabs_factor", "water_reabs_factor"]) H[k] = 1.0;
  const K = M[H.kidneys_name];
  if (K) {
    if (K.reabsorption_factors) for (const k of Object.keys(K.reabsorption_factors)) K.reabsorption_factors[k] = 1.0;
    K.reabs_factor_adh = 1.0;
  }

  // 4. warm and serialize
  eng.calc(SECONDS);
  log.push(`after ${SECONDS}s: angiotensin ${H.angiotensin.toFixed(2)}, svr_factor ${H.svr_factor.toFixed(2)}, KID_ART ${M.KID_ART.pres.toFixed(1)} vs ${H.perfusion_setpoint.toFixed(1)} mmHg`);
  json.model_definition = serializeState(model);
  const text = JSON.stringify(json, null, 1) + "\n";
  JSON.parse(text);
  if (WRITE) fs.writeFileSync(new URL(`${name}.json`, dir), text);
  out(`${name}${WRITE ? " (written)" : " (dry run)"}\n  ${log.join("\n  ")}`);
}
