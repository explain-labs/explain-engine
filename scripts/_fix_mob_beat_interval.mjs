// Scenario migration for the Mob stroke-work fix (format-preserving, patches Metabolism.vo2 only).
//
// Mob used to spread each beat's stroke-work O2 cost over Heart.cardiac_cycle_time (SA firing to the
// end of the QT, ~0.35 s at term) instead of the beat interval (0.50 s), overstating the myocardial
// stroke-work VO2 by RR / cycle time (x1.41 at term). With the fix the heart uses less O2; the O2 it no
// longer uses moves to Metabolism.vo2 so whole-body (lung) VO2 and the calibrated gases stay as
// validated. The difference is measured on the fixed engine as the old formula (per-beat cost /
// cycle_time) minus the new one, averaged over --seconds after a --warmup.
//
//   node scripts/_fix_mob_beat_interval.mjs <scenario> [...] [--warmup 30] [--seconds 60] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const WARMUP = opt("--warmup", 30), SECONDS = opt("--seconds", 60);
const names = argv.filter((a, i) => !a.startsWith("--") && !["--warmup", "--seconds"].includes(argv[i - 1]));
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const ML_PER_MMOL = 22.414;

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

const eng = await createEngine();
for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  const M = eng.build(JSON.parse(src).model_definition).models;
  eng.calc(WARMUP);
  const dt = 0.01; let d_old = 0, d_new = 0, n = 0;
  for (let t = 0; t < SECONDS; t += dt) {
    eng.calc(dt);
    const cc = M.Heart.cardiac_cycle_time;
    d_old += cc > 0 ? M.Mob._sw_vo2_per_beat / cc : 0; d_new += M.Mob.sw_vo2; n++;
  }
  const delta_mmol_s = (d_old - d_new) / n;
  const Me = JSON.parse(src).model_definition.models.Metabolism;
  const weight = JSON.parse(src).model_definition.weight;
  const scale = (Me.vo2_factor ?? 1) * (Me.vo2_temp_factor ?? 1) * (Me.vo2_bat_factor ?? 1);
  const d_vo2 = (delta_mmol_s * ML_PER_MMOL * 60) / weight / scale; // mL/kg/min
  const vo2_new = +(Me.vo2 + d_vo2).toFixed(5);

  const [s0, e0] = findModelBlock(src, "Metabolism");
  const block = src.slice(s0, e0);
  const re = /\n(\s*)"vo2": [^,\n]*(,?)\n/;
  if (!re.test(block)) throw new Error(`${name}: Metabolism.vo2 line not found`);
  const patched = src.slice(0, s0) + block.replace(re, (m, ind, comma) => `\n${ind}"vo2": ${vo2_new}${comma}\n`) + src.slice(e0);
  const exp = JSON.parse(src); exp.model_definition.models.Metabolism.vo2 = vo2_new;
  if (JSON.stringify(JSON.parse(patched)) !== JSON.stringify(exp)) throw new Error(`${name}: patch changed more than vo2`);
  out(`${name}: heart stroke-work VO2 ${(d_old / n * ML_PER_MMOL * 60).toFixed(3)} -> ${(d_new / n * ML_PER_MMOL * 60).toFixed(3)} mL/min; Metabolism.vo2 ${Me.vo2} -> ${vo2_new} mL/kg/min (+${d_vo2.toFixed(4)})`);
  if (WRITE) fs.writeFileSync(file, patched);
}
