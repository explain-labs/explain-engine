// One-off: scale a scenario's blood volume (re-validation re-anchoring) and keep the Hormones volume
// reference at the new resting volume.
//
//   node scripts/_fix_blood_volume.mjs <scenario> --factor F [--write]
//
// Does what ModelScaler.scale_blood_volume(F) does, baked into the definition: vol and u_vol of every
// component in scaler_config.blood.volume are multiplied by F (stressed and unstressed volume together).
// Hormones.volume_setpoint is the resting Circulation.total_blood_volume; left alone, the larger volume
// would read as overload (renin and ADH down, diuresis), so it is set to the new resting value.
// term_neonate_72h (2026-10-25): the heart re-validation left CVP at 1.93 mmHg (reference 2-8) with blood
// volume at the bottom of its reference (80.6 mL/kg, 80-90); x1.06 gives ~85 mL/kg and CVP ~2.5.
// Only vol/u_vol of those components and volume_setpoint change; the rest of the file stays byte-identical.
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const F = opt("--factor", NaN);
const name = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--factor");
if (!name || !(F > 0)) { process.stderr.write("usage: _fix_blood_volume.mjs <scenario> --factor F [--write]\n"); process.exit(1); }
const out = (...a) => process.stderr.write(a.join(" ") + "\n");
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const eng = await createEngine();

// the [start, end) span of the object `"name": { … }` with its own model_type, inside model_definition
function findModelBlock(src, n) {
  let from = src.indexOf('"model_definition"');
  for (;;) {
    const start = src.indexOf(`"${n}": {`, from);
    if (start < 0) throw new Error(`${n} not found`);
    let depth = 0, end = start;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) { end = i; break; }
    }
    if (/\n\s*"model_type": "/.test(src.slice(start, end))) return [start, end];
    from = end;
  }
}
// set a top-level numeric key of that block (the first match at the block's own indentation)
function setKey(src, n, key, fn) {
  const [start, end] = findModelBlock(src, n);
  const block = src.slice(start, end);
  const ind = block.match(/\n(\s*)"model_type": "/)[1];
  const re = new RegExp(`\\n${ind}"${key}": (-?[0-9.eE+-]+)`);
  const m = block.match(re);
  if (!m) throw new Error(`${n}.${key} not found`);
  const v = fn(Number(m[1]));
  return [src.slice(0, start) + block.replace(re, `\n${ind}"${key}": ${v}`) + src.slice(end), v];
}
function rest(def) {
  const m = eng.build(structuredClone(def));
  eng.calc(180);
  const v = measureVitals(m, eng.send, { window: 30 });
  let tbv = 0; const n = 2000;
  for (let i = 0; i < n; i++) { eng.calc(0.005); tbv += m.models.Circulation.total_blood_volume; }
  return { v, tbv: tbv / n, vsp: m.models.Hormones.volume_setpoint, w: m.weight };
}

const src = fs.readFileSync(file, "utf8");
const def = JSON.parse(src).model_definition;
const before = rest(def);
let patched = src;
const expected = JSON.parse(src);
const find = (o, n) => { for (const [k, c] of Object.entries(o)) { if (k === n && c?.model_type) return c; if (c && typeof c === "object") { const r = find(c, n); if (r) return r; } } return null; };
for (const n of def.scaler_config.blood.volume) {
  for (const key of ["vol", "u_vol"]) {
    let v; [patched, v] = setKey(patched, n, key, (x) => +(x * F).toPrecision(8));
    find(expected.model_definition.models, n)[key] = v;
  }
}
const after1 = rest(JSON.parse(patched).model_definition);
const vsp = +after1.tbv.toPrecision(6);
[patched] = setKey(patched, "Hormones", "volume_setpoint", () => vsp);
expected.model_definition.models.Hormones.volume_setpoint = vsp;
if (JSON.stringify(JSON.parse(patched)) !== JSON.stringify(expected)) throw new Error("patch changed more than intended");
const after = rest(JSON.parse(patched).model_definition);
const K = ["hr", "map", "sys", "dia", "cvp", "pap_m", "lvo", "rvo", "svc", "spo2_pre", "svo2"];
const row = (r) => K.filter((k) => k in r.v).map((k) => `${k} ${(+r.v[k]).toFixed(["lvo", "rvo", "svc"].includes(k) ? 3 : 2)}`).join("  ") +
  `  blood volume ${(r.tbv * 1e3 / r.w).toFixed(1)} mL/kg (set-point ${(r.vsp * 1e3).toFixed(1)} mL)`;
out(`${name} before: ${row(before)}`);
out(`${name} x${F}:  ${row(after)}`);
if (WRITE) { fs.writeFileSync(file, patched); out("written"); } else out("dry run (pass --write to save)");
