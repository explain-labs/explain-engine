// Validate the pure-JS SA estimators against closed-form test functions BEFORE
// trusting them on the engine.
//   node scripts/sa/validate_estimators.mjs
//
// 1) Ishigami  f = sin(x1) + a sin^2(x2) + b x3^4 sin(x1),  xi ~ U(-pi,pi), a=7,b=0.1
//    has analytic Sobol indices -> checks Sobol S_i/S_Ti and Morris mu*/sigma structure.
// 2) A monotone linear function -> checks PRCC recovers signs/magnitudes.

import { mulberry32, problemFromParams, toParam, morris, saltelli, saltelliSlices, lhs } from "./_sa_sampling.mjs";
import { sobolJansen, sobolBootstrap, morrisEE, prcc } from "./_sa_analysis.mjs";

const log = (...a) => console.error(...a);
const PI = Math.PI;

// ---------- Ishigami ----------
const a = 7, b = 0.1;
const ishigami = ([x1, x2, x3]) => Math.sin(x1) + a * Math.sin(x2) ** 2 + b * x3 ** 4 * Math.sin(x1);

// analytic indices
const Var = a * a / 8 + b * PI ** 4 / 5 + b * b * PI ** 8 / 18 + 0.5;
const V1 = 0.5 * (1 + b * PI ** 4 / 5) ** 2;
const V2 = a * a / 8;
const VT1 = V1 + 8 * b * b * PI ** 8 / 225;      // first + interaction with x3
const VT3 = 8 * b * b * PI ** 8 / 225;
const analytic = {
  S1: V1 / Var, S2: V2 / Var, S3: 0,
  ST1: VT1 / Var, ST2: V2 / Var, ST3: VT3 / Var,
};

const ishiProblem = problemFromParams([
  { name: "x1", lo: -PI, hi: PI, scale: "linear" },
  { name: "x2", lo: -PI, hi: PI, scale: "linear" },
  { name: "x3", lo: -PI, hi: PI, scale: "linear" },
]);

function testSobol() {
  const N = 16384;
  const rng = mulberry32(20260710);
  const { U, k } = saltelli(3, N, rng, { base: "lhs" });
  const X = toParam(ishiProblem, U);
  const Y = X.map(ishigami);
  const { YA, YB, YAB } = saltelliSlices(Y, N, k);
  const { indices } = sobolJansen(YA, YB, YAB);
  const ci = sobolBootstrap(YA, YB, YAB, { nboot: 200 });
  log(`\n=== Ishigami Sobol' (N=${N}, Saltelli/LHS base, Jansen estimator) ===`);
  log("param   S_i (est)   S_i (exact)   S_Ti (est)  S_Ti (exact)   S_i 95% CI");
  const names = ["x1", "x2", "x3"];
  const exactS = [analytic.S1, analytic.S2, analytic.S3];
  const exactST = [analytic.ST1, analytic.ST2, analytic.ST3];
  let maxErr = 0;
  for (let d = 0; d < 3; d++) {
    const eS = indices[d].Si, eST = indices[d].STi;
    maxErr = Math.max(maxErr, Math.abs(eS - exactS[d]), Math.abs(eST - exactST[d]));
    log(`  ${names[d]}   ${eS.toFixed(4)}      ${exactS[d].toFixed(4)}        ${eST.toFixed(4)}      ${exactST[d].toFixed(4)}     [${ci[d].SiCI[0].toFixed(3)}, ${ci[d].SiCI[1].toFixed(3)}]`);
  }
  const ok = maxErr < 0.03;
  log(`  max |est-exact| = ${maxErr.toFixed(4)}   ${ok ? "OK (<0.03)" : "*** FAIL ***"}`);
  return ok;
}

function testMorris() {
  const r = 200, k = 3;
  const rng = mulberry32(77);
  const { U, moves, delta } = morris(k, r, rng, { levels: 8 });
  const X = toParam(ishiProblem, U);
  const Y = X.map(ishigami);
  const ee = morrisEE(moves, Y, k, delta);
  log(`\n=== Ishigami Morris (r=${r}, levels=8) ===`);
  log("param    mu*        sigma       mu");
  const names = ["x1", "x2", "x3"];
  ee.forEach((e, d) => log(`  ${names[d]}    ${e.muStar.toFixed(3)}     ${e.sigma.toFixed(3)}     ${e.mu.toFixed(3)}`));
  // structural expectations: mu* ranks x1,x2 > x3-influence present; x2 additive (low sigma),
  // x1 & x3 interaction-driven (high sigma), x3 mu ~ 0 (sign-cancelling).
  const [e1, e2, e3] = ee;
  const checks = [
    ["x1,x2 have highest mu*", e1.muStar > e3.muStar && e2.muStar > 0],
    ["x2 additive: sigma_x2 < sigma_x1", e2.sigma < e1.sigma],
    ["x3 interaction: |mu_x3| small vs mu*_x3", Math.abs(e3.mu) < 0.5 * e3.muStar + 1e-9],
    ["x3 detected (mu* > 0)", e3.muStar > 0.2],
  ];
  let ok = true;
  for (const [name, pass] of checks) { log(`  ${pass ? "OK " : "***"} ${name}`); ok = ok && pass; }
  return ok;
}

function testPRCC() {
  // monotone: y = 3 x1 + 2 x2 - 1 x3 + 0.5 x4  (x4 weak), inputs U(0,1)
  const k = 4, N = 2000;
  const rng = mulberry32(303);
  const X = lhs(k, N, rng);
  const y = X.map(([a1, a2, a3, a4]) => 3 * a1 + 2 * a2 - a3 + 0.5 * a4);
  const pc = prcc(X, y);
  log(`\n=== PRCC on monotone linear y = 3x1 + 2x2 - x3 + 0.5x4 (N=${N}) ===`);
  const names = ["x1", "x2", "x3", "x4"];
  pc.forEach((v, d) => log(`  ${names[d]}   PRCC = ${v.toFixed(3)}`));
  const checks = [
    ["signs +,+,-,+", pc[0] > 0 && pc[1] > 0 && pc[2] < 0 && pc[3] > 0],
    ["|PRCC| ranks x1>x2>x4", Math.abs(pc[0]) > Math.abs(pc[1]) && Math.abs(pc[1]) > Math.abs(pc[3])],
    ["x1 strong (>0.9)", Math.abs(pc[0]) > 0.9],
  ];
  let ok = true;
  for (const [name, pass] of checks) { log(`  ${pass ? "OK " : "***"} ${name}`); ok = ok && pass; }
  return ok;
}

const results = [testSobol(), testMorris(), testPRCC()];
const allOk = results.every(Boolean);
log(`\n${allOk ? "ALL ESTIMATOR CHECKS PASSED" : "SOME CHECKS FAILED"} (${results.filter(Boolean).length}/3)\n`);
process.exit(allOk ? 0 : 1);
