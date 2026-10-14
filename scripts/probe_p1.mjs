// Reproduce the validation experiments of the cardiovascular paper (P1) headlessly.
//
// Reads papers/p1/experiments.json — the same file the app's /paper/p1 page runs live — builds each
// experiment's scenario, applies its ops, settles, samples the window and prints every measure as
//   paper | this engine | Δ | literature
// so the deposited scenarios can be checked against the published tables from the command line.
//
// Usage:
//   node scripts/probe_p1.mjs [--only id[,id]] [--settle N] [--window N] [--json] [--verbose]
//                             [--override id:Model.prop=value[,scale:group=factor]]... [--rebuild]
//
// An experiment whose state was built by the parameterization pipeline (it names a `spec`
// under papers/p1/specs/ and a p1_* scenario, no ops) is just loaded and measured; with
// --rebuild it is additionally rebuilt from the archived SPEC with scripts/build_patient.mjs
// (no language model involved) and the rebuilt patient measured too, as a determinism check.
//
// --override replaces (or adds) a `set` op's value for one experiment — a tuning aid, so a lever
// can be swept from the command line; the file stays the source of truth for the app.
//
// Exit status 1 only on a build failure (as for every probe: read the table, the Δ column is the
// verdict, and |Δ| > tol is flagged with "!").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { evaluate, samplePaths, resolvePath, fmt, withinTolerance } from "../papers/evaluate.js";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ONLY = opt("--only")?.split(",").filter(Boolean);
const SETTLE = opt("--settle") ? Number(opt("--settle")) : null;
const WINDOW = opt("--window") ? Number(opt("--window")) : null;
const JSON_OUT = flag("--json");
const REBUILD = flag("--rebuild");
const OVERRIDES = {}; // id -> { path: value }
argv.forEach((a, i) => {
  if (a !== "--override") return;
  const spec = argv[i + 1];
  const id = spec.slice(0, spec.indexOf(":"));
  const list = spec.slice(spec.indexOf(":") + 1);
  OVERRIDES[id] = Object.fromEntries(list.split(",").map((kv) => { const [k, v] = kv.split("="); return [k, Number(v)]; }));
});

const spec = JSON.parse(fs.readFileSync(new URL("../papers/p1/experiments.json", import.meta.url), "utf8"));
const eng = await createEngine({ verbose: flag("--verbose") });
const out = (s) => process.stderr.write(s + "\n");

function applyOp(model, op) {
  if (op.kind === "set") {
    const [m, ...rest] = op.path.split(".");
    let cur = model.models[m];
    for (let i = 0; i < rest.length - 1; i++) cur = cur[rest[i]];
    cur[rest[rest.length - 1]] = op.value;
  } else if (op.kind === "scale") {
    for (const g of Array.isArray(op.group) ? op.group : [op.group]) eng.scale(g, op.factor);
  } else if (op.kind === "call") {
    const [m, fn] = op.fn.split(".");
    model.models[m][fn](...(op.args ?? []));
  } else {
    throw new Error(`probe_p1: unsupported op kind ${op.kind}`);
  }
}

function measure(ex, def, label) {
  const model = eng.build(structuredClone(def));
  if (!model?.models) { eng.log(`build failed: ${label}`); process.exit(1); }
  const ops = structuredClone(ex.ops ?? []);
  for (const [p, value] of Object.entries(OVERRIDES[ex.id] ?? {})) {
    if (p.startsWith("scale:")) { ops.push({ kind: "scale", group: p.slice(6), factor: value }); continue; }
    const op = ops.find((o) => o.kind === "set" && o.path === p);
    if (op) op.value = value; else ops.push({ kind: "set", path: p, value });
  }
  for (const op of ops) applyOp(model, op);
  const settle = SETTLE ?? ex.settle_s;
  const window = WINDOW ?? ex.window_s;
  eng.calc(settle);
  const paths = samplePaths(ex);
  const sums = Object.fromEntries(paths.map((p) => [p, 0]));
  const n = Math.max(1, Math.round(window / spec.sample_s));
  for (let i = 0; i < n; i++) {
    eng.calc(spec.sample_s);
    for (const p of paths) {
      const v = resolvePath(model, p);
      if (typeof v !== "number") { eng.log(`${ex.id}: path ${p} is not numeric`); process.exit(1); }
      sums[p] += v;
    }
  }
  const averages = Object.fromEntries(paths.map((p) => [p, sums[p] / n]));
  return { weight: model.weight, values: evaluate(ex, averages, model.weight), settle, window };
}

const results = {};
for (const ex of spec.experiments) {
  if (ONLY && !ONLY.includes(ex.id)) continue;
  const url = new URL(`../model_definitions/${ex.scenario}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(url, "utf8"));
  const r = measure(ex, json.model_definition || json, ex.scenario);
  results[ex.id] = { weight: r.weight, values: r.values };

  // pipeline-built state: optionally rebuild it from the archived SPEC and measure that too
  let rebuilt = null;
  if (REBUILD && ex.spec) {
    const archive = JSON.parse(fs.readFileSync(new URL(`../papers/p1/${ex.spec}`, import.meta.url), "utf8"));
    const builder = fileURLToPath(new URL("./build_patient.mjs", import.meta.url));
    const b = spawnSync("node", [builder], { input: JSON.stringify({ ...archive.spec, name: `${ex.scenario}_rebuilt` }), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (b.status !== 0) { eng.log(`${ex.id}: rebuild from ${ex.spec} FAILED\n${b.stderr.slice(-1500)}`); process.exit(1); }
    const def = JSON.parse(b.stdout);
    fs.writeFileSync(path.join(os.tmpdir(), `${ex.scenario}_rebuilt.json`), b.stdout);
    rebuilt = measure(ex, def.model_definition, `${ex.scenario} (rebuilt)`);
    results[ex.id].rebuilt = rebuilt.values;
  }

  const built = ex.spec ? ` · pipeline-built from ${ex.spec}` : "";
  out(`\n=== ${ex.id} — ${ex.title}  (${ex.paper_table}; ${ex.scenario}, ${r.weight} kg, settle ${r.settle} s, window ${r.window} s${built})`);
  out(`${"measure".padEnd(24)} ${"paper".padStart(10)} ${"engine".padStart(10)} ${"Δ".padStart(8)}${rebuilt ? "   rebuilt".padStart(10) : ""}   literature`);
  for (const m of ex.measures) {
    const v = r.values[m.key];
    const paper = typeof m.paper === "number" ? fmt(m.paper, m.round) : (m.paper ?? "");
    const within = withinTolerance(m, v);
    const delta = typeof m.paper === "number" && typeof v === "number" ? fmt(v - m.paper, m.round) + (within === false ? " !" : "") : "";
    const lit = (m.literature ?? []).map((l) => `${l.value} [${l.ref}]`).join("; ");
    const rb = rebuilt ? fmt(rebuilt.values[m.key], m.round).padStart(10) : "";
    out(`${(m.label + (m.unit ? ` (${m.unit})` : "")).padEnd(24)} ${String(paper).padStart(10)} ${fmt(v, m.round).padStart(10)} ${delta.padStart(8)}${rb}   ${lit}`);
  }
}
if (JSON_OUT) process.stdout.write(JSON.stringify(results, null, 1) + "\n");
