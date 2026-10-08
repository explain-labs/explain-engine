// Stores the calibrated spontaneous-breathing effort gain (Breathing.rmp_gain, mmHg per litre of target
// tidal volume) in every scenario, so a loaded patient breathes with its own calibrated effort from the
// first breath instead of calibrating during its first breaths (see docs/Breathing.md).
//
// The gain is calibrated on the natural airway: a scenario that starts on the ventilator is calibrated
// with the ventilator switched off, since the gain describes the patient's own respiratory system.
// Scenarios with spontaneous breathing disabled (fetal) are skipped; they calibrate when breathing
// starts. Only Breathing.rmp_gain and Breathing.rmp_calibrated are written, as a text edit of those
// lines (the engine is built from a deep copy, and the rest of the file is left byte-for-byte).
//
// Usage: node scripts/_calibrate_breathing.mjs [scenario ...]   (default: every scenario)

import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const dir = new URL("../model_definitions/", import.meta.url);
const args = process.argv.slice(2);
const files = (args.length ? args.map((a) => `${a}.json`) : fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json")).sort();

const eng = await createEngine();
const log = eng.log;

for (const f of files) {
  const file = new URL(f, dir);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const def = json.model_definition || json;
  const bdef = def.models?.Breathing;
  if (!bdef) { log(`${f.padEnd(40)} no Breathing, skipped`); continue; }
  if (bdef.is_enabled === false || bdef.breathing_enabled === false) { log(`${f.padEnd(40)} breathing off, skipped`); continue; }

  const copy = structuredClone(def);
  copy.models.Breathing.rmp_calibrated = false;
  const m = eng.build(copy);
  const B = m.models.Breathing, V = m.models.Ventilator;
  const ventilated = !!V?.is_enabled;
  if (ventilated) V.switch_ventilator(false);
  let t = 0;
  while (!B.rmp_calibrated && t < 180) { eng.calc(5); t += 5; }
  if (!B.rmp_calibrated) { log(`${f.padEnd(40)} did not calibrate in ${t} s, skipped`); continue; }

  const gain = Number(B.rmp_gain.toPrecision(5));
  let text = fs.readFileSync(file, "utf8").replace(/\n(\s*)"rmp_calibrated": (true|false),/, "");
  const re = /\n(\s*)"rmp_gain": [^,\n]+,/;
  if ((text.match(new RegExp(re.source, "g")) ?? []).length !== 1) { log(`${f.padEnd(40)} expected one rmp_gain line, skipped`); continue; }
  text = text.replace(re, (_, ind) => `\n${ind}"rmp_gain": ${gain},\n${ind}"rmp_calibrated": true,`);
  JSON.parse(text); // still valid JSON
  fs.writeFileSync(file, text);
  log(`${f.padEnd(40)} rmp_gain ${gain} mmHg/L after ${t} s${ventilated ? " (ventilator off for calibration)" : ""}`);
}
