// SA evaluation core: evaluate(paramVector) -> outputVector, reusing the headless
// engine harness (createEngine) and the clinical measurement (measureVitals).
//
// One engine instance per Node process (the engine is a per-process singleton), so
// this file is imported by each parallel worker; the orchestrator (run_sa.mjs) forks
// N workers and shards the design matrix across them.
//
// Also runnable as a batch worker CLI:
//   node scripts/sa/_sa_eval.mjs <configJson>   # config: {scenario,warm,window,paramSet,rows}
//     -> emits one JSON line per row: {i, ok, out:{...}}   (out=null if non-converged)

import fs from "node:fs";
import { createEngine } from "../_harness.mjs";
import { measureVitals } from "../_probe.mjs";
import { getParamSet, applyAll, toOutputVector, OUTPUTS } from "./_sa_params.mjs";

const scenarioPath = (s) => new URL(`../../public/model_definitions/${s}.json`, import.meta.url);

// Load a scenario definition (the model_definition object the engine builds).
export function loadScenario(scenario) {
  const json = JSON.parse(fs.readFileSync(scenarioPath(scenario), "utf8"));
  return json.model_definition || json;
}

// Build an evaluator bound to one engine + one scenario. `evaluate(values, params)`
// returns the OUTPUTS vector for a fresh build perturbed by `values`.
export async function createEvaluator({ scenario, warm = 60, window = 12 } = {}) {
  const eng = await createEngine();
  const baseDef = loadScenario(scenario);

  function evaluate(values, params) {
    // deep-clone per build: the engine mutates the definition it is handed (component
    // init stores references into it), so a pristine clone each time guarantees a
    // deterministic, history-independent starting state — the same reason reseed_*.mjs
    // re-reads the JSON from disk every run.
    const model = eng.build(structuredClone(baseDef));
    if (!model || !model.models) return null;
    applyAll(model, eng, params, values);          // perturb (in dependency order)
    eng.calc(warm);                                // warm to steady state
    const vit = measureVitals(model, eng.send, { window });  // advances sim window & averages
    const q_fo = model.models.Shunts?.flow_fo;
    const out = toOutputVector(vit, { q_fo });
    // guard: any non-finite output => flag the whole eval as failed
    for (const k of OUTPUTS) if (!Number.isFinite(out[k])) return null;
    return out;
  }

  // nominal (unperturbed-scenario) parameter values, for OAT centering / elasticity
  function nominals(params) {
    const model = eng.build(structuredClone(baseDef));
    return params.map((p) => p.nominal(model));
  }

  return { eng, baseDef, evaluate, nominals };
}

// ---------------- batch worker CLI ----------------
async function mainCLI() {
  const cfgPath = process.argv[2];
  if (!cfgPath) { console.error("usage: node _sa_eval.mjs <configJson>"); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const params = getParamSet(cfg.paramSet).filter((p) => !cfg.paramNames || cfg.paramNames.includes(p.name));
  const { evaluate } = await createEvaluator({ scenario: cfg.scenario, warm: cfg.warm, window: cfg.window });
  const out = [];
  for (let i = 0; i < cfg.rows.length; i++) {
    const o = evaluate(cfg.rows[i], params);
    const line = JSON.stringify({ i: (cfg.offset ?? 0) + i, ok: o != null, out: o });
    if (cfg.outFile) out.push(line); else process.stdout.write(line + "\n");
  }
  if (cfg.outFile) fs.writeFileSync(cfg.outFile, out.join("\n") + "\n");
}

// run CLI only when invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  mainCLI().catch((e) => { console.error("SA eval error:", e); process.exit(1); });
}
