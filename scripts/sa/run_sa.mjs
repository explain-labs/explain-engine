// Sensitivity-analysis orchestrator (parallel, pure-JS).
//
//   node scripts/sa/run_sa.mjs --scenario term_neonate --tier oat    --set reduced
//   node scripts/sa/run_sa.mjs --scenario term_neonate --tier morris --set expanded --r 30
//   node scripts/sa/run_sa.mjs --scenario pphn         --tier sobol  --set reduced --N 512
//   node scripts/sa/run_sa.mjs --scenario term_neonate --tier prcc   --set reduced --N 800
//
// Generates the design in the unit cube (_sa_sampling), maps to physical param vectors,
// shards the rows across `os.cpus()-2` forked worker processes (each runs _sa_eval.mjs on
// its shard — the engine is a per-process singleton, so parallelism = separate processes),
// collects the JSONL outputs, runs the tier's estimators (_sa_analysis), and writes
// scripts/sa/results/<scenario>_<tier>_<set>.json plus a stderr summary.

import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEvaluator } from "./_sa_eval.mjs";
import { getLeverSet, OUTPUTS, DESIGNATED } from "./_sa_params.mjs";
import { problemFromParams, toParam, morris, saltelli, saltelliSlices, lhs, unitToValue, mulberry32 } from "./_sa_sampling.mjs";
import { sobolJansen, sobolBootstrap, morrisEE, prcc, prccBootstrap, fimAnalysis } from "./_sa_analysis.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RESULTS = new URL("./results/", import.meta.url);
const EVAL = new URL("./_sa_eval.mjs", import.meta.url).pathname;

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const scenario = arg("--scenario", "term_neonate");
const tier = arg("--tier", "oat");
const paramSet = arg("--set", "reduced");
const warm = Number(arg("--warm", "60"));
const window = Number(arg("--window", "12"));
const N = Number(arg("--N", "512"));
const r = Number(arg("--r", "30"));
const seed = Number(arg("--seed", "20260710"));
const nWorkers = Number(arg("--workers", String(Math.max(1, os.cpus().length - 2))));
// by default the SA samples only the TUNABLE levers; measured `context` inputs (weight) are held fixed.
// --include-context reproduces the population variance decomposition (weight sampled over its full range).
const includeContext = argv.includes("--include-context");
const log = (...a) => console.error(...a);

// characteristic clinical scale per output — used to normalise the local sensitivity
// matrix into comparable, bounded, dimensionless units (avoids divide-by-~0 for outputs
// that are inactive at a given operating point, e.g. shunt flows in a healthy term neonate).
const OUTSCALE = {
  hr: 130, map: 50, sys: 65, dia: 40, cvp: 5, pap_m: 25, co: 0.5, spo2: 95, spo2_post: 95,
  svo2: 65, po2: 70, pco2: 40, ph: 7.4, be: 5, etco2: 35, q_da: 50, q_fo: 50,
};

const params = getLeverSet(paramSet, { includeContext });
const paramNames = params.map((p) => p.name);   // the exact sampled subset, for worker-side alignment
const problem = problemFromParams(params);
const k = params.length;

if (!fs.existsSync(RESULTS)) fs.mkdirSync(RESULTS, { recursive: true });

// ---------- nominal vector (one build in the parent) ----------
log(`\n=== SA run: scenario=${scenario} tier=${tier} set=${paramSet} (k=${k}) ===`);
log(`workers=${nWorkers}  warm=${warm}s  window=${window}s  seed=${seed}  ${includeContext ? "[population: context INCLUDED]" : "[calibration: context fixed]"}`);
const { nominals } = await createEvaluator({ scenario, warm, window });
const nom = nominals(params);
log("nominal vector:", params.map((p, i) => `${p.name}=${fmt(nom[i], 3)}`).join("  "));

// ---------- build the design (physical rows) ----------
let rows, meta = {};
if (tier === "oat") {
  ({ rows, meta } = designOAT());
} else if (tier === "morris") {
  const d = morris(k, r, mulberry32(seed), { levels: 8 });
  rows = toParam(problem, d.U);
  meta = { moves: d.moves, delta: d.delta };
} else if (tier === "sobol") {
  const s = saltelli(k, N, mulberry32(seed), { base: "lhs" });
  rows = toParam(problem, s.U);
  meta = { N: s.N, k: s.k };
} else if (tier === "prcc") {
  const U = lhs(k, N, mulberry32(seed));
  rows = toParam(problem, U);
  meta = { U };
} else {
  log(`unknown tier "${tier}" (use oat|morris|sobol|prcc)`); process.exit(1);
}
log(`design: ${rows.length} evaluations`);

// ---------- evaluate in parallel ----------
const t0 = process.hrtime.bigint();
const outs = await evaluateParallel(rows);
const elapsed = Number(process.hrtime.bigint() - t0) / 1e9;
const nOk = outs.filter(Boolean).length;
log(`evaluated ${nOk}/${rows.length} ok in ${elapsed.toFixed(1)}s (${(elapsed / rows.length).toFixed(2)}s/eval effective)`);

// ---------- analyze ----------
let result;
if (tier === "oat") result = analyzeOAT(outs);
else if (tier === "morris") result = analyzeMorris(outs);
else if (tier === "sobol") result = analyzeSobol(outs);
else if (tier === "prcc") result = analyzePRCC(outs);

const outPath = new URL(`./results/${scenario}_${tier}_${paramSet}.json`, import.meta.url).pathname;
fs.writeFileSync(outPath, JSON.stringify({ scenario, tier, paramSet, warm, window, seed, k, params: params.map((p) => p.name), nominal: nom, nOk, nTotal: rows.length, elapsed, result }, null, 2));
log(`\nwrote ${outPath}`);
process.exit(0);

// ========================= designs =========================
function designOAT() {
  // central-difference rows: baseline + (plus,minus) per param
  const h = 0.05;
  const R = [nom.slice()];
  const info = [];
  for (let j = 0; j < k; j++) {
    const p = params[j], x0 = nom[j];
    let xPlus, xMinus;
    if (p.scale === "log" && x0 > 0) {
      const f = Math.exp(h * (Math.log(p.hi) - Math.log(p.lo)));
      xPlus = Math.min(p.hi, x0 * f); xMinus = Math.max(p.lo, x0 / f);
    } else {
      const s = h * (p.hi - p.lo);
      xPlus = Math.min(p.hi, x0 + s); xMinus = Math.max(p.lo, x0 - s);
    }
    const rp = nom.slice(); rp[j] = xPlus; R.push(rp);
    const rm = nom.slice(); rm[j] = xMinus; R.push(rm);
    info.push({ j, x0, xPlus, xMinus, iPlus: R.length - 2, iMinus: R.length - 1 });
  }
  return { rows: R, meta: { info } };
}

// ========================= analyses =========================
function outCol(outs, key) { return outs.map((o) => (o ? o[key] : NaN)); }

function analyzeOAT(outs) {
  const y0 = outs[0];
  const info = meta.info;
  const rowsOut = {};          // output -> [{param, dydx, elasticity, normSens}]
  const S = [];                // normalized sensitivity matrix (nOut x k) for FIM
  // a param is "boundary-inactive" here if its nominal is ~0 (e.g. closed duct/FO at term):
  // log-sensitivity is undefined and its normalised column is dominated by the divide-by-scale,
  // so it is excluded from the FIM at this operating point and flagged.
  const boundaryParam = params.map((p, j) => Math.abs(info[j].x0) < 1e-9);
  for (const out of OUTPUTS) {
    const yb = y0 ? y0[out] : NaN;
    const oscale = OUTSCALE[out] || (Math.abs(yb) + 1e-6);
    const line = [];
    const srow = [];
    for (let j = 0; j < k; j++) {
      const ip = outs[info[j].iPlus], im = outs[info[j].iMinus];
      const yp = ip ? ip[out] : NaN, ym = im ? im[out] : NaN;
      const dx = info[j].xPlus - info[j].xMinus;
      const dydx = dx !== 0 ? (yp - ym) / dx : NaN;
      const x0 = info[j].x0;
      const elasticity = (Math.abs(x0) > 1e-9 && Math.abs(yb) > 1e-9) ? dydx * x0 / yb : NaN;
      // characteristic parameter perturbation = dθ/du at nominal, i.e. the change produced by
      // sweeping this lever across its FULL plausible range in the coordinate Morris/Sobol sample
      // (linear: hi-lo; log: θ0·ln(hi/lo)). This makes wide-range levers (systemic_R ×0.3–8) and
      // narrow-range levers (venous_uvol ±30%) comparable instead of both counted as "100% change".
      const p = params[j];
      const paramScale = (p.scale === "log" && x0 > 0) ? x0 * Math.log(p.hi / p.lo) : (p.hi - p.lo);
      const normSens = dydx * paramScale / oscale;   // Δoutput (clinical-scale units) per full-range lever sweep
      line.push({ param: params[j].name, dydx, elasticity, normSens });
      srow.push(Number.isFinite(normSens) ? normSens : 0);
    }
    rowsOut[out] = line;
    S.push(srow);
  }
  // identifiability from the local normalized-sensitivity matrix, excluding boundary-inactive
  // params (their sensitivity must be assessed where the structure is active — pphn/hlhs/dtga).
  const keepCols = params.map((_, j) => j).filter((j) => !boundaryParam[j]);
  const Ssub = S.map((row) => keepCols.map((j) => row[j]));
  const fim = fimAnalysis(Ssub);
  return { baseline: y0, elasticities: rowsOut,
    boundaryInactive: params.filter((_, j) => boundaryParam[j]).map((p) => p.name),
    identifiability: {
      params: keepCols.map((j) => params[j].name),
      condition: fim.condition,
      eigenvalues: fim.eigenvalues,
      qrOrder: fim.qrOrder.map((q) => ({ param: params[keepCols[q.param]].name, residualNorm: q.residualNorm })),
    } };
}

function analyzeMorris(outs) {
  const res = {};
  for (const out of OUTPUTS) {
    const Y = outCol(outs, out);
    // drop trajectories that contain any NaN point
    const ee = morrisEE(meta.moves.filter((tr) => tr.every((mv) => Number.isFinite(Y[mv.from]) && Number.isFinite(Y[mv.to]))), Y, k, meta.delta);
    res[out] = params.map((p, j) => ({ param: p.name, ...ee[j] }));
  }
  return { morris: res };
}

function analyzeSobol(outs) {
  const { N: n } = meta;
  const res = {};
  for (const out of OUTPUTS) {
    const Y = outCol(outs, out);
    let { YA, YB, YAB } = saltelliSlices(Y, n, k);
    // keep only base indices where A,B and every AB column are finite
    const keep = [];
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(YA[i]) && Number.isFinite(YB[i]) && YAB.every((c) => Number.isFinite(c[i]))) keep.push(i);
    }
    if (keep.length < 0.5 * n) { res[out] = { note: `too few converged rows (${keep.length}/${n})` }; continue; }
    const ya = keep.map((i) => YA[i]), yb = keep.map((i) => YB[i]), yab = YAB.map((c) => keep.map((i) => c[i]));
    const { Var, indices } = sobolJansen(ya, yb, yab);
    const ci = sobolBootstrap(ya, yb, yab, { nboot: 400 });
    res[out] = {
      Var, kept: keep.length,
      indices: params.map((p, j) => ({ param: p.name, Si: indices[j].Si, STi: indices[j].STi, SiCI: ci[j].SiCI, STiCI: ci[j].STiCI, interaction: indices[j].STi - indices[j].Si })),
    };
  }
  return { sobol: res };
}

function analyzePRCC(outs) {
  // build X (kept rows) and per-output y, drop NaN rows per output
  const res = {};
  for (const out of OUTPUTS) {
    const X = [], y = [];
    for (let i = 0; i < outs.length; i++) {
      const o = outs[i];
      if (o && Number.isFinite(o[out])) { X.push(rows[i]); y.push(o[out]); }
    }
    if (X.length < 20) { res[out] = { note: `too few rows (${X.length})` }; continue; }
    const pc = prcc(X, y);
    const ci = prccBootstrap(X, y, { nboot: 300 });
    res[out] = params.map((p, j) => ({ param: p.name, prcc: pc[j], ci: ci[j] }));
  }
  return { prcc: res };
}

// ========================= parallel evaluation =========================
async function evaluateParallel(rows) {
  const shards = shard(rows, nWorkers);
  const outs = new Array(rows.length).fill(null);
  let done = 0;
  await Promise.all(shards.map((sh, w) => new Promise((resolve, reject) => {
    if (!sh.rows.length) return resolve();
    const cfgPath = `${HERE}results/.cfg_${tier}_${w}.json`;
    const outFile = `${HERE}results/.out_${tier}_${w}.jsonl`;
    // paramNames pins the worker to the SAME sampled subset (context-excluded) and order as the parent,
    // so each row's values line up with the worker's reconstructed param list.
    fs.writeFileSync(cfgPath, JSON.stringify({ scenario, warm, window, paramSet, paramNames, rows: sh.rows, offset: sh.offset, outFile }));
    const child = spawn(process.execPath, [EVAL, cfgPath], { stdio: ["ignore", "ignore", "inherit"] });
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`worker ${w} exited ${code}`));
      const lines = fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean);
      for (const ln of lines) { const rec = JSON.parse(ln); outs[rec.i] = rec.ok ? rec.out : null; done++; }
      fs.unlinkSync(cfgPath); fs.unlinkSync(outFile);
      log(`  worker ${w}: ${sh.rows.length} rows done (${done}/${rows.length} total)`);
      resolve();
    });
    child.on("error", reject);
  })));
  return outs;
}

function shard(arr, n) {
  const out = [];
  const per = Math.ceil(arr.length / n);
  for (let i = 0; i < arr.length; i += per) out.push({ offset: i, rows: arr.slice(i, i + per) });
  return out;
}

function fmt(x, n) { return Number.isFinite(x) ? Number(x.toFixed(n)) : String(x); }
