// SA harness smoke test (de-risk before building sampling/analysis).
//   node scripts/sa/smoke.mjs [scenario] [--warm 60] [--window 12]
// Checks: (1) evaluate() is deterministic; (2) each reduced lever moves its DESIGNATED
// output in the direction the calibrator assumes. A wrong sign is a bug or a real finding.

import { createEvaluator } from "./_sa_eval.mjs";
import { REDUCED } from "./_sa_params.mjs";

const argv = process.argv.slice(2);
const scenario = argv.find((a) => !a.startsWith("-")) || "term_neonate";
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const warm = opt("--warm", 60), window = opt("--window", 12);

// expected sign of designated-output response to an INCREASE in each lever (from Calibrator)
const EXPECT = {
  systemic_R: +1, pulmonary_R: +1, contractility: +1, heart_rate_ref: +1, O2_diffusion: +1,
  vent_drive: -1, uma: -1, venous_uvol: -1, pda_diameter: +1, fo_diameter: 0, weight: 0,
};

const { evaluate, nominals } = await createEvaluator({ scenario, warm, window });
const nom = nominals(REDUCED);
const r = (x, n = 2) => (Number.isFinite(x) ? Number(x.toFixed(n)) : x);

console.error(`\n=== SA smoke test: ${scenario}  (warm ${warm}s, window ${window}s) ===\n`);
console.error("nominal parameter vector:", REDUCED.map((p, i) => `${p.name}=${r(nom[i], 3)}`).join("  "));

// baseline (all nominal) + determinism
const base1 = evaluate(nom.slice(), REDUCED);
const base2 = evaluate(nom.slice(), REDUCED);
if (!base1 || !base2) { console.error("BASELINE FAILED (non-finite output)"); process.exit(1); }
const detMax = Math.max(...Object.keys(base1).map((k) => Math.abs(base1[k] - base2[k])));
console.error(`\nbaseline: HR ${r(base1.hr)} MAP ${r(base1.map)} CO ${r(base1.co,3)} SpO2 ${r(base1.spo2)} PaO2 ${r(base1.po2)} PaCO2 ${r(base1.pco2)} pH ${r(base1.ph,3)} BE ${r(base1.be)} CVP ${r(base1.cvp)} PAP ${r(base1.pap_m)}`);
console.error(`determinism: max |Δ| across outputs between two identical evals = ${detMax.toExponential(2)}  ${detMax < 1e-6 ? "OK (deterministic)" : "WARN (non-deterministic)"}`);

// one-at-a-time perturbation, signed response of the designated output
console.error(`\nlever -> designated output  (Δ on +increase; expect matches calibrator sign):\n`);
let pass = 0, checked = 0;
for (let j = 0; j < REDUCED.length; j++) {
  const p = REDUCED[j];
  const v = nom.slice();
  const step = p.scale === "log" ? Math.max(nom[j], 1e-9) * 1.3 : nom[j] + 0.25 * (p.hi - p.lo);
  v[j] = Math.min(p.hi, Math.max(p.lo, step));
  const o = evaluate(v, REDUCED);
  const out = p.designatedOut;
  if (!o || out == null) { console.error(`  ${p.name.padEnd(16)} -> (no designated output)`); continue; }
  const d = o[out] - base1[out];
  const exp = EXPECT[p.name];
  const sign = d > 0 ? "+" : d < 0 ? "-" : "0";
  let verdict = "";
  if (exp !== 0) { checked++; const ok = Math.sign(d) === exp && Math.abs(d) > 1e-6; if (ok) pass++; verdict = ok ? "OK" : "*** MISMATCH ***"; }
  console.error(`  ${p.name.padEnd(16)} -> ${out.padEnd(7)}  Δ=${String(r(d, 3)).padStart(9)} (${sign})  expect ${exp > 0 ? "+" : exp < 0 ? "-" : "·"}  ${verdict}`);
}
console.error(`\nsign checks: ${pass}/${checked} match the calibrator's assumed lever directions.\n`);
