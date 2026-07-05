// Verification / demo probe for the Kidneys (glomerular filtration) + Hormones (RAAS/ADH) models.
//
// Drives the engine headless through the same { type, message, payload } envelope as Model.js.
// Demonstrates (A) NEUTRALITY at rest (steady GFR, urine output, FE_Na, hormone levels ~1), then
// (B) a hypotensive / hypovolaemic insult (haemorrhage): renal perfusion falls → GFR falls, and the
// Hormones long-loop controller responds — renin/angiotensin/aldosterone/ADH rise, aldosterone drives
// avid tubular sodium retention (FE_Na falls) and ADH drives water retention (urine output falls).
// (C) volume expansion (large saline load) suppresses RAAS/ADH the opposite way.
//
// Usage: node scripts/probe_renal.mjs [--scenario term_neonate] [--bleed 0.15] [--verbose]

import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d; };
const sopt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SCENARIO = sopt("--scenario", "term_neonate");
const BLEED = opt("--bleed", 0.2);   // fraction of blood volume removed (haemorrhage)
const VERBOSE = flag("--verbose");

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
  if (msg.type === "status" && /ERROR/i.test(msg.message || "")) console.error("ENGINE:", msg.message);
};
const _log = console.log;
if (!VERBOSE) console.log = () => {};

await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });
const def = JSON.parse(fs.readFileSync(new URL(`../public/model_definitions/${SCENARIO}.json`, import.meta.url), "utf8")).model_definition;
send("POST", "build", def);
send("GET", "state", []);
const model = liveModel;
console.log = _log;
if (!model?.models?.Kidneys) { console.error("Build failed — no Kidneys model"); process.exit(1); }

const K = model.models.Kidneys;
const H = model.models.Hormones;
const Circ = model.models.Circulation;
const KID_ART = model.models.KID_ART;
const AA = model.models.AA;

const r = (x, n = 3) => Number((x ?? 0).toFixed(n));
const snap = (label) => ({
  t: label,
  KID_pres: r(KID_ART?.pres, 1),
  GFR_mLmin: r(K.gfr, 3),
  urine_mLmin: r(K.urine_flow, 4),
  FE_Na_pct: r(K.fe_na, 3),
  renin: r(H?.renin, 3),
  angio: r(H?.angiotensin, 3),
  aldo: r(H?.aldosterone, 3),
  adh: r(H?.adh, 3),
  na_reabs_f: r(H?.na_reabs_factor, 4),
});

// warm up + auto-seed hormone/TGF setpoints
send("POST", "calc", 120);
const rows = [snap("rest")];
const trace = (label, dt) => { send("POST", "calc", dt); rows.push(snap(label)); };

// --- (B) haemorrhage: remove a fraction of every blood compartment's volume ---
for (const m of Object.values(model.models)) {
  if (m && typeof m.vol === "number" && m.solutes && m.vol > 0 && m !== K._urine) m.vol *= 1 - BLEED;
}
trace("bleed 300s", 300);
trace("bleed 900s", 600);
trace("bleed 1800s", 900);

console.log(`\nRenal + hormonal probe — scenario=${SCENARIO}, haemorrhage ${BLEED * 100}% blood vol\n`);
console.table(rows);

const base = rows[0];
const late = rows[rows.length - 1];
console.log("NEUTRALITY (rest): GFR steady & finite:", Number.isFinite(base.GFR_mLmin) && base.GFR_mLmin > 0,
  "| renin≈1:", Math.abs(base.renin - 1) < 0.05, "| aldo≈1:", Math.abs(base.aldo - 1) < 0.05,
  "| adh≈1:", Math.abs(base.adh - 1) < 0.05);
console.log("HAEMORRHAGE: renal perfusion↓:", late.KID_pres < base.KID_pres,
  "| GFR↓:", late.GFR_mLmin < base.GFR_mLmin,
  "| renin↑:", late.renin > base.renin + 0.05,
  "| aldosterone↑:", late.aldo > base.aldo + 0.05,
  "| ADH↑:", late.adh > base.adh + 0.05,
  "| Na retention (FE_Na↓):", late.FE_Na_pct < base.FE_Na_pct);
