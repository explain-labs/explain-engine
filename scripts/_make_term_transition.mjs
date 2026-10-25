// Generate a transitional term neonate (term_neonate_<age>h) from the 72 h term_neonate.
//
//   node scripts/_make_term_transition.mjs --age 1 [--seconds 300] [--write]
//
// The baby is the same healthy 3.545 kg term neonate after a vaginal birth with delayed cord clamping
// (~1 min), breathing room air, nursed skin-to-skin / dressed at room temperature. The reference values
// per age are docs/TermTransitionReference.md and scripts/reference/term_neonate_<age>h.json.
//
// Each scenario is a SNAPSHOT of its age: after the levers are applied the controllers are re-anchored
// to the new resting state, so the scenario holds it when loaded instead of drifting toward 72 h:
//   - baroreflex: the resting ANS effector activity is folded into the base values it acts on and
//     BR_MAP.set_value moves to the resting arch pressure (as scripts/_fix_baro_setpoint.mjs);
//   - chemoreflex: CR_PCO2 / CR_PO2 / CR_PH set-points = the resting arterial gases;
//   - Hormones: volume_setpoint / perfusion_setpoint = the resting blood volume / renal pressure;
//   - HeartFunction: wall-stress set-points re-learned at rest (as scripts/_relearn_heartfunction.mjs);
//   - Thermoregulation: the loss trim re-seeds neutral in the new environment.
// Then the scaling layer is baked into the base values (incorporate) and the live state is serialized
// at a sinus-node firing (as scripts/reseed_term_neonate.mjs).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { setDiagramTitle } from "./_titles.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const AGE = opt("--age", NaN);
const SECONDS = opt("--seconds", 300);
const WRITE = argv.includes("--write");
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

// Lever profiles per postnatal age (h). Factors are relative to the 72 h term_neonate.
const PROFILES = {
  1: {
    description: "healthy term neonate (3.545 kg) 1 h after a vaginal birth with delayed cord clamping (~1 min): " +
      "large bidirectional duct, near-systemic pulmonary pressure, high output, haematocrit 55 %, mild metabolic acidosis; room air, skin-to-skin",
    // duct: 4.6 mm at the pulmonary end (Kang 2016, 2 h); aortic end 5.5 mm
    PDA_AO_MAX: 5.5, PDA_PA_MAX: 5.0, PDA_REL: 0.92,
    // pulmonary vascular resistance (with the intrapulmonary shunt resistance, Shunts.ips_res, scaled
    // alike so the shunt fraction stays): with a 4.6 mm duct the pulmonary pressure follows the aorta,
    // so a small rise is enough for the bidirectional flow seen at 2 h
    PVR: 1.2,
    // high output after birth (catecholamine surge; Agata 1991/1994 LVO 327-365): low SVR, higher
    // contractility and rate
    SVR: 0.5, HEART_EL_MAX: 1.6, HR_REF: 1.07,
    // blood: ~80 mL/kg at Hct 55 % (delayed clamping, after the first plasma shift)
    BLOOD_VOLUME: 80 / 85, HCT: 0.55,
    // gases and metabolites: lactate 2.2 (GLOW), BE ~-5 and pCO2 ~36 (textbook, C), glucose 3.3 (GLOW)
    LACT: 2.2, UMA_DELTA: 2.1, MV_REF: 1.11, GLUCOSE: 3.3,
    // residual lung liquid: a smaller, proportionally stiffer aerated lung (alveolar u_vol and el_base of
    // ALL/ALR) -> FRC ~-10 % (Lee 1999: vaginal FRC 23.1 at 4-6 h vs 24.9 at 24 h), Crs ~-8 % (Lødrup
    // Carlsen 1993: Crs lower on day 0; direction only), specific compliance about constant
    LUNG_U_VOL: 0.85, LUNG_EL: 1.11,
    // reflex set-points at the targets while the levers settle (re-anchored to the result afterwards)
    BR_MAP_INIT: 50, CR_PCO2_INIT: 36, CR_PH_INIT: 7.33,
    // dressed / skin-to-skin at room temperature
    ENV_TEMP: 24.0, REL_HUMIDITY: 0.5,
  },
};
const P = PROFILES[AGE];
if (!P) { out(`usage: _make_term_transition.mjs --age <${Object.keys(PROFILES).join("|")}> [--seconds S] [--write]`); process.exit(1); }
const NAME = `term_neonate_${AGE}h`;

const eng = await createEngine();
const src = new URL("../model_definitions/term_neonate.json", import.meta.url);
const dst = new URL(`../model_definitions/${NAME}.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));
const baselineWeight = j.model_definition._baseline_weight;
const model = eng.build(j.model_definition);
const M = model.models;
const log = [];

// 1. duct and pulmonary circulation
M.Pda.diameter_ao_max = P.PDA_AO_MAX; M.Pda.diameter_pa_max = P.PDA_PA_MAX; M.Pda.diameter_relative = P.PDA_REL;
eng.scale("pulmonary_resistances", P.PVR);
M.Shunts.ips_res *= P.PVR;
log.push(`duct ${(P.PDA_REL * P.PDA_PA_MAX).toFixed(2)} mm (PA end) / ${(P.PDA_REL * P.PDA_AO_MAX).toFixed(2)} mm (Ao end); PVR x${P.PVR} (ips_res alike)`);

// 2. output: systemic resistance, contractility, rate
eng.scale("systemic_resistances", P.SVR);
eng.scale("heart_el_max", P.HEART_EL_MAX);
M.Heart.heart_rate_ref *= P.HR_REF;
log.push(`SVR x${P.SVR}, heart el_max x${P.HEART_EL_MAX}, heart_rate_ref x${P.HR_REF} (${M.Heart.heart_rate_ref.toFixed(1)})`);

// 3. blood volume and haematocrit (Hb with each compartment's O2 content, same saturation)
eng.scale("blood_volume", P.BLOOD_VOLUME);
const patientBlood = Object.entries(M).filter(([n, m]) => m.solutes && m !== M.Blood && !/^(PL_|UT|MP|URINE$)/.test(n)).map(([, m]) => m);
const hbNew = P.HCT * 33.0 * 0.6206; // Blood: hct = Hb / 0.6206 / 33
const hbOld = M.Blood.solutes.hemoglobin;
M.Blood.set_solute("hemoglobin", hbNew);
for (const m of patientBlood) if (typeof m.to2 === "number") m.to2 *= hbNew / hbOld;
log.push(`blood volume x${P.BLOOD_VOLUME.toFixed(4)}; Hb ${hbOld} -> ${hbNew.toFixed(3)} mmol/L (Hct ${P.HCT})`);

// 4. lactate, unmeasured anions, glucose
M.Lactate.lact_baseline = P.LACT;
for (const m of [M.Blood, ...patientBlood]) {
  if (typeof m.solutes.lact === "number") m.solutes.lact = P.LACT;
  if (typeof m.solutes.uma === "number") m.solutes.uma += P.UMA_DELTA;
  if (typeof m.solutes.glucose === "number") m.solutes.glucose = P.GLUCOSE;
}
const G = M.Glucose;
G.isf_glucose *= P.GLUCOSE / G.glucose_setpoint;
G.glucose_setpoint = P.GLUCOSE; G.glucose_default = P.GLUCOSE;
log.push(`lactate ${P.LACT}, uma +${P.UMA_DELTA}, glucose ${P.GLUCOSE}`);

// 5. breathing; the reflex set-points start at the targets so they do not fight the levers while the
// model settles (all are re-anchored to the settled state below)
M.Breathing.minute_volume_ref *= P.MV_REF;
M.CR_PCO2.set_value = P.CR_PCO2_INIT; M.CR_PH.set_value = P.CR_PH_INIT; M.BR_MAP.set_value = P.BR_MAP_INIT;
log.push(`minute_volume_ref x${P.MV_REF}`);
for (const n of ["ALL", "ALR"]) { M[n].u_vol *= P.LUNG_U_VOL; M[n].el_base *= P.LUNG_EL; }
log.push(`lung liquid: alveolar u_vol x${P.LUNG_U_VOL}, el_base x${P.LUNG_EL}`);

// 6. thermal environment: the loss trim re-seeds neutral there
M.Thermoregulation.env_temp = P.ENV_TEMP;
M.Thermoregulation.rel_humidity = P.REL_HUMIDITY;
M.Thermoregulation.loss_trim_seeded = false;
log.push(`environment ${P.ENV_TEMP} degC / ${P.REL_HUMIDITY * 100} %`);

// 7. settle, then re-anchor the controllers to this resting state
eng.calc(SECONDS);
reanchorBaroreflex();
reanchorChemoreflex();
reanchorHormones();
eng.calc(SECONDS);
relearnHeartFunction();
eng.calc(SECONDS);

// 8. scenario metadata, bake the scaling layer, serialize at a sinus-node firing
model.age = AGE / (24 * 365);
model.name = NAME;
model.description = P.description;
eng.scale("incorporate", 1);
const H = M.Heart;
for (let i = 0; i < 400; i++) {
  const before = H._sa_node_timer;
  eng.calc(model.modeling_stepsize);
  if (H._sa_node_timer < before) break;
}
j.name = NAME;
j.description = P.description;
j.provenance = "generated";
j.provenance_note = `generated from term_neonate by scripts/_make_term_transition.mjs --age ${AGE}; reference docs/TermTransitionReference.md`;
setDiagramTitle(j, NAME);
const da = j.diagram_definition?.components?.DA;
if (da?.layout) { da.label = "PDA"; da.layout.label = { ...da.layout.label, visible: true, at: 0.72, pos_x: 0, pos_y: -10, size: 11 }; }
j.model_definition = serializeState(model);
if (baselineWeight !== undefined) j.model_definition._baseline_weight = baselineWeight;
const text = JSON.stringify(j, null, 2);
JSON.parse(text);

out(`${NAME}:\n  ${log.join("\n  ")}`);
const v = measureVitals(eng.build(JSON.parse(text).model_definition) && eng.model, eng.send, { window: 1 });
eng.calc(120);
const r = measureVitals(eng.model, eng.send, { window: 20 });
const W = eng.model.weight;
out(`  reloaded +120 s: HR ${r.hr.toFixed(0)}, ${r.sys.toFixed(0)}/${r.dia.toFixed(0)} (${r.map.toFixed(1)}), PAP ${r.pap_m.toFixed(1)}, ` +
  `LVO ${(r.lvo * 1000 / W).toFixed(0)}, RVO ${(r.rvo * 1000 / W).toFixed(0)} mL/kg/min, duct ${(r.q_da * 60000 / W).toFixed(0)}, FO ${(r.q_fo * 60000 / W).toFixed(1)} mL/kg/min, ` +
  `SpO2 ${r.spo2_pre.toFixed(1)}/${r.spo2_post.toFixed(1)}, pH ${r.ph.toFixed(3)}, pCO2 ${r.pco2.toFixed(1)}, BE ${r.be.toFixed(2)}, temp ${r.temp.toFixed(2)}`);
void v;
if (WRITE) {
  fs.writeFileSync(dst, text);
  const idx = new URL("../model_definitions/index.json", import.meta.url);
  const list = JSON.parse(fs.readFileSync(idx, "utf8"));
  if (!list.includes(NAME)) { list.push(NAME); fs.writeFileSync(idx, JSON.stringify(list, null, 2) + "\n"); }
  out(`  written ${fileURLToPath(dst)}`);
} else out("  dry run (pass --write to save)");

// --- re-anchoring -------------------------------------------------------------------------------

function avgOver(sec, fn) {
  const n = Math.round(sec / 0.02);
  const acc = {};
  for (let i = 0; i < n; i++) {
    eng.calc(0.02);
    for (const [k, x] of Object.entries(fn())) acc[k] = (acc[k] ?? 0) + x / n;
  }
  return acc;
}

// fold the resting ANS effector activity into the bases it acts on, neutralise the reflex state and
// move BR_MAP.set_value until the mean firing rate is 0.5 (the formulas of _fix_baro_setpoint.mjs)
function reanchorBaroreflex() {
  const EF = ["EF_HR", "EF_SVR", "EF_HEART"];
  const rest = avgOver(20, () => Object.fromEntries([["aar", M.AAR.pres], ...EF.map((k) => [k, M[k].effector])]));
  const mult = [];
  mult.push([M.Heart, "heart_rate_ref", 1 + (rest.EF_HR - 1) * M.Heart.ans_sens]);
  for (const c of Object.values(M)) {
    if (c.model_type === "HeartChamber" && c.ans_sens) {
      const a = c.ans_activity;
      mult.push([c, "el_max", 1 + (a - 1) * c.ans_sens]);
      for (const p of ["el_min", "el_k"]) if (c[p] > 0) mult.push([c, p, 1 - (a - 1) * c.ans_sens]);
    }
    if (c.model_type === "BloodVessel" && (c.ans_sens || c.u_vol_ans_sens)) {
      const f = 1 + (c.ans_activity - 1) * (c.ans_sens ?? 0);
      if (Math.abs(f - 1) > 1e-9) { for (const p of ["r_for", "r_back", "r_k"]) mult.push([c, p, f]); mult.push([c, "el_base", Math.pow(f, c.alpha)]); }
      const fu = 1 - (c.ans_activity - 1) * (c.u_vol_ans_sens ?? 0);
      if (Math.abs(fu - 1) > 1e-9) mult.push([c, "u_vol", fu]);
    }
  }
  for (const [c, p, f] of mult) c[p] *= f;
  M.Heart.ans_activity = 1; M.Heart.ans_activity_hr = 1;
  M.Circulation.ans_activity = 1; M.Circulation.prev_ans_activity = 1;
  for (const k of EF) { M[k].effector = 1; M[k].firing_rate = 0.5; }
  for (const c of Object.values(M)) if ((c.model_type === "BloodVessel" || c.model_type === "HeartChamber") && c.ans_sens) c.ans_activity = 1;
  M.BR_MAP.firing_rate = 0.5;
  const before = M.BR_MAP.set_value;
  M.BR_MAP.set_value = rest.aar;
  for (let it = 0; it < 6; it++) {
    eng.calc(60);
    const a = avgOver(20, () => ({ fr: M.BR_MAP.firing_rate }));
    const d = a.fr - 0.5;
    if (Math.abs(d) < 0.002) break;
    M.BR_MAP.set_value += d / (0.5 / (M.BR_MAP.max_value - M.BR_MAP.set_value));
  }
  M.BR_MAP.set_value = +M.BR_MAP.set_value.toFixed(2);
  log.push(`baroreflex: folded ${EF.map((k) => `${k} ${rest[k].toFixed(3)}`).join(", ")}; BR_MAP set ${before} -> ${M.BR_MAP.set_value}`);
}

// chemoreceptor set-points = the resting arterial gases (the reflex is then neutral at rest)
function reanchorChemoreflex() {
  const g = avgOver(30, () => ({ pco2: M.AA.pco2, po2: M.AA.po2, ph: M.AA.ph }));
  const before = [M.CR_PCO2.set_value, M.CR_PO2.set_value, M.CR_PH.set_value];
  M.CR_PCO2.set_value = +g.pco2.toFixed(2); M.CR_PO2.set_value = +g.po2.toFixed(2); M.CR_PH.set_value = +g.ph.toFixed(3);
  log.push(`chemoreflex set-points pCO2/pO2/pH ${before.join("/")} -> ${M.CR_PCO2.set_value}/${M.CR_PO2.set_value}/${M.CR_PH.set_value}`);
}

// Hormones references = the resting blood volume and renal perfusion pressure
function reanchorHormones() {
  const Hm = M.Hormones;
  const a = avgOver(20, () => ({ tbv: M.Circulation.total_blood_volume, kid: M.KID_ART.pres }));
  const before = [Hm.volume_setpoint, Hm.perfusion_setpoint];
  Hm.volume_setpoint = +a.tbv.toPrecision(6); Hm.perfusion_setpoint = +a.kid.toFixed(2);
  log.push(`Hormones volume/perfusion set-points ${before[0]}/${before[1]} -> ${Hm.volume_setpoint}/${Hm.perfusion_setpoint}`);
}

// HeartFunction wall-stress set-points learned at rest
function relearnHeartFunction() {
  const HF = M.HeartFunction;
  const KEYS = ["sigma_es_ref_lv", "sigma_ed_ref_lv", "sigma_es_ref_rv", "sigma_ed_ref_rv"];
  const before = KEYS.map((k) => HF[k].toFixed(1));
  for (const k of KEYS) { HF[k] = 0.0; HF._learn[k] = true; }
  HF._warmup_elapsed = 0.0;
  eng.calc(HF.setpoint_warmup + 5.0);
  for (const k of KEYS) { HF[k] = +HF[k].toFixed(4); HF._learn[k] = false; }
  log.push(`HeartFunction set-points ${before.join("/")} -> ${KEYS.map((k) => HF[k]).join("/")}`);
}
