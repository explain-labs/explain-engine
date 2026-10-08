// Calibrates the respiratory-system static compliance of a scenario by scaling the alveolar
// elastance (Respiration ALL/ALR el_base), and writes the result back as a text edit of those two
// lines (the rest of the file is left byte-for-byte; the engine is built from a deep copy).
//
// Static compliance is measured as validate_respiratory.mjs's cstat case does: spontaneous breathing
// off, intubated, PC 15/5 with a 0.2 s end-inspiratory pause, after 120 s (so the Surfactant
// recruitment state of the RDS scenarios has settled at PEEP 5).
//
// Usage:
//   node scripts/_calibrate_compliance.mjs measure <scenario ...>
//   node scripts/_calibrate_compliance.mjs target <cstat mL/cmH2O/kg> <scenario>   (iterates the factor)
//   node scripts/_calibrate_compliance.mjs factor <f> <scenario ...>               (el_base x f, no search)
//   add --dry to print without writing.

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const args = argv.filter((a) => a !== "--dry");
const cmd = args.shift();
const eng = await createEngine();
const log = eng.log;
const dir = new URL("../model_definitions/", import.meta.url);

const read = (s) => fs.readFileSync(new URL(`${s}.json`, dir), "utf8");
const defOf = (text) => {
  const j = JSON.parse(text);
  return j.model_definition || j;
};

// static compliance (mL/cmH2O/kg) with the alveolar elastance scaled by f
function measure(def, f = 1.0) {
  const copy = structuredClone(def);
  const R = copy.models.Respiration.components;
  for (const n of ["ALL", "ALR"]) R[n].el_base *= f;
  const m = eng.build(copy);
  m.models.Breathing.switch_breathing(false);
  const V = m.models.Ventilator;
  V.switch_ventilator(true);
  V.set_pc(15, 5, 30, 0.6, 12);
  V.synchronized = false;
  V.set_pause(0.2);
  eng.calc(120);
  return { cstat: V.compliance_static / def.weight, cdyn: V.compliance_dynamic / def.weight, vt: (V.exp_tidal_volume * 1000) / def.weight };
}

// replace the first `"el_base": <num>` inside the `"<name>": {` block
function setElBase(text, name, value) {
  const start = text.indexOf(`"${name}": {`);
  if (start < 0 || text.indexOf(`"${name}": {`, start + 1) >= 0) throw new Error(`${name}: expected one block`);
  const re = /"el_base": ([^,\n]+),/g;
  re.lastIndex = start;
  const m = re.exec(text);
  if (!m) throw new Error(`${name}: no el_base`);
  return text.slice(0, m.index) + `"el_base": ${value},` + text.slice(m.index + m[0].length);
}

function write(scenario, f) {
  let text = read(scenario);
  const R = defOf(text).models.Respiration.components;
  const out = {};
  for (const n of ["ALL", "ALR"]) {
    out[n] = Number((R[n].el_base * f).toPrecision(5));
    text = setElBase(text, n, out[n]);
  }
  JSON.parse(text);
  if (!DRY) fs.writeFileSync(new URL(`${scenario}.json`, dir), text);
  return out;
}

const fmt = (r) => `Cstat ${r.cstat.toFixed(2)} Cdyn ${r.cdyn.toFixed(2)} mL/cmH2O/kg, Vt ${r.vt.toFixed(1)} mL/kg at PC 15/5`;

if (cmd === "measure") {
  for (const s of args) log(`${s.padEnd(34)} ${fmt(measure(defOf(read(s))))}`);
} else if (cmd === "target") {
  const target = Number(args[0]);
  const s = args[1];
  const def = defOf(read(s));
  let f = 1.0;
  let r = measure(def, f);
  log(`${s}: start ${fmt(r)}, target Cstat ${target}`);
  for (let i = 0; i < 8 && Math.abs(r.cstat / target - 1) > 0.02; i++) {
    f *= r.cstat / target; // Cstat ~ 1/el
    r = measure(def, f);
    log(`  f ${f.toFixed(4)}: ${fmt(r)}`);
  }
  const el = write(s, f);
  log(`${s}: el_base x${f.toFixed(4)} -> ALL ${el.ALL}, ALR ${el.ALR}${DRY ? " (dry run)" : ""}`);
} else if (cmd === "factor") {
  const f = Number(args.shift());
  for (const s of args) {
    const el = write(s, f);
    log(`${s.padEnd(34)} el_base x${f} -> ALL ${el.ALL}, ALR ${el.ALR}${DRY ? " (dry run)" : ""}`);
  }
} else {
  log("usage: measure <scenario ...> | target <cstat> <scenario> | factor <f> <scenario ...> [--dry]");
}
