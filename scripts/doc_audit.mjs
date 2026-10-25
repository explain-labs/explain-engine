// Documentation drift audit for the Explain engine (read-only).
//
// For every model class exported from ModelIndex (plus the helper modules) it compares what the code
// has with what docs/<Class>.md documents and what the explain-ui parameter registry exposes:
//
//   - own props        : public props the class adds over its parent (constructor defaults)
//   - runtime props    : props not declared in the constructor but created at build/run time, by
//                        the class itself or by other models writing onto its instances
//                        (found by building a scenario stripped of unknown keys and stepping it)
//   - doc              : identifiers in the first column of the doc's Property tables, and any
//                        `backticked` mention anywhere on the page
//   - registry         : MODEL_INTERFACES[model_type] targets in explain-ui registry.ts
//   - scenario keys    : keys in the canonical scenario definitions that no class or model uses
//
// Usage:
//   node scripts/doc_audit.mjs [Class ...] [--registry <path to registry.ts>] [--scenario <name>]
//                              [--summary] [--json]
//
// --scenario takes a comma-separated list (default term_neonate; until a fetal scenario is rebuilt the
// placenta compartments' injected props are not seen running).
//
// With no class names it audits everything. --registry defaults to ../src/model-interface/registry.ts
// (the engine as a submodule of explain-ui); without a registry the registry checks are skipped.

import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
register("./resolve-extensionless.mjs", import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SUMMARY = argv.includes("--summary");
const AS_JSON = argv.includes("--json");
const SCENARIOS = opt("--scenario", "term_neonate").split(",");
const REGISTRY = path.resolve(ROOT, opt("--registry", "../src/model-interface/registry.ts"));
const valued = new Set(["--registry", "--scenario"]);
const ONLY = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));

// ---------------------------------------------------------------------------------------------
// engine, headless (same global shim as scripts/probe_vitals.mjs)
let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => { if (msg?.type === "state") liveModel = msg.payload; };
const _log = console.log;
console.log = () => {};
await import("../ModelEngine.js");
const Index = await import("../ModelIndex.js");
console.log = _log;
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

const STUB = { models: {}, modeling_stepsize: 0.0005, model_time_total: 0 };
const publicKeys = (o) => Object.keys(o).filter((k) => !k.startsWith("_"));
const instantiate = (C) => { try { return new C(STUB, "audit"); } catch { return null; } };

function methodsOf(C) {
  const out = new Set();
  for (let p = C.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) if (k !== "constructor") out.add(k);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// scenarios: every model definition, recursively through `components`
const SCEN_DIR = path.join(ROOT, "model_definitions");
const scenarios = fs.readdirSync(SCEN_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
function* walkDefs(models, trail = "") {
  for (const [name, d] of Object.entries(models || {})) {
    if (!d || typeof d !== "object" || !d.model_type) continue;
    yield { name, path: trail + name, def: d };
    if (d.components && typeof d.components === "object") yield* walkDefs(d.components, `${trail}${name}.components.`);
  }
}
const loadDef = (file) => { const j = JSON.parse(fs.readFileSync(path.join(SCEN_DIR, file), "utf8")); return j.model_definition || j; };

// ---------------------------------------------------------------------------------------------
// injected props: build the scenario with every unknown key stripped, step 2 s, and collect the
// public keys that appeared on instances beyond their constructor's
const fresh = new Map(); // model_type -> Set(constructor keys)
const freshKeys = (type) => {
  if (!fresh.has(type)) { const C = Index[type]; const o = C && instantiate(C); fresh.set(type, new Set(o ? publicKeys(o) : [])); }
  return fresh.get(type);
};
function stripUnknown(models) {
  const out = {};
  for (const [name, d] of Object.entries(models || {})) {
    if (!d || typeof d !== "object" || !d.model_type) { out[name] = d; continue; }
    const keep = freshKeys(d.model_type);
    const s = {};
    for (const [k, v] of Object.entries(d)) if (keep.has(k) || k === "name" || k === "model_type") s[k] = v;
    if (d.components) s.components = stripUnknown(d.components);
    out[name] = s;
  }
  return out;
}
const injected = new Map(); // model_type -> Map(prop -> Set(instance names))
for (const SCENARIO of SCENARIOS) {
  const def = structuredClone(loadDef(`${SCENARIO}.json`));
  def.models = stripUnknown(def.models);
  console.log = () => {};
  send("POST", "build", def);
  send("POST", "calc", 2);
  send("GET", "state", []);
  console.log = _log;
  if (!(liveModel?.model_time_total > 1)) { console.error(`doc_audit: ${SCENARIO} did not build/step; injected props unknown`); process.exit(1); }
  for (const [name, m] of Object.entries(liveModel?.models || {})) {
    const known = freshKeys(m.model_type);
    for (const k of publicKeys(m)) {
      if (known.has(k)) continue;
      if (!injected.has(m.model_type)) injected.set(m.model_type, new Map());
      const byProp = injected.get(m.model_type);
      if (!byProp.has(k)) byProp.set(k, new Set());
      byProp.get(k).add(name);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// registry (explain-ui): MODEL_INTERFACES literal evaluated as plain JS
let REG = null;
if (fs.existsSync(REGISTRY)) {
  const src = fs.readFileSync(REGISTRY, "utf8");
  const start = src.indexOf("{", src.indexOf("export const MODEL_INTERFACES"));
  const end = src.indexOf("\n};", start);
  REG = new Function(`return ${src.slice(start, end + 2)}`)();
}

// ---------------------------------------------------------------------------------------------
// docs
function readDoc(name) {
  const f = path.join(ROOT, "docs", `${name}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}
function docIdentifiers(md) {
  const mentioned = new Set();
  for (const m of md.matchAll(/`([^`\n]+)`/g)) for (const id of m[1].match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) mentioned.add(id);
  // first-column identifiers of tables whose header starts with Property / Prop / Field / Parameter / Key
  const table = new Set();
  let inPropTable = false;
  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) { inPropTable = false; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (/^(property|prop|field|parameter|key|config key)s?$/i.test(cells[0] || "")) { inPropTable = true; continue; }
    if (!inPropTable || /^:?-+/.test(cells[0] || "")) continue;
    for (const m of (cells[0] || "").matchAll(/`([^`]+)`/g)) {
      const id = m[1].replace(/\(.*$/, "").match(/^[A-Za-z_][A-Za-z0-9_.]*/)?.[0];
      if (id) table.add(id.split(".")[0]);
    }
  }
  return { mentioned, table };
}

// ---------------------------------------------------------------------------------------------
// per-class audit
const BASE_PROPS = new Set(["name", "description", "is_enabled", "model_type", "components"]);
const classes = Object.entries(Index).filter(([, C]) => typeof C === "function" && C.model_type);

// scenario keys unknown to the class and not injected by the engine
const scenarioStale = new Map(); // model_type -> Map(key -> Set(scenario))
for (const file of scenarios) {
  let def;
  try { def = loadDef(file); } catch { continue; }
  for (const { def: d } of walkDefs(def.models)) {
    const known = freshKeys(d.model_type);
    const inj = injected.get(d.model_type);
    for (const k of Object.keys(d)) {
      if (k.startsWith("_") || known.has(k) || inj?.has(k)) continue;
      if (!scenarioStale.has(d.model_type)) scenarioStale.set(d.model_type, new Map());
      const byKey = scenarioStale.get(d.model_type);
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k).add(file.replace(/\.json$/, ""));
    }
  }
}

function auditClass(name, C) {
  const inst = instantiate(C);
  const parent = Object.getPrototypeOf(C);
  const pinst = parent?.model_type !== undefined || parent?.name === "BaseModelClass" ? instantiate(parent) : null;
  const parentKeys = new Set(pinst ? publicKeys(pinst) : []);
  const all = new Set(inst ? publicKeys(inst) : []);
  const own = [...all].filter((k) => !parentKeys.has(k) && !(name !== "BaseModelClass" && BASE_PROPS.has(k)));
  // inherited props whose default this class changes
  const overridden = pinst ? [...parentKeys].filter((k) => all.has(k) && JSON.stringify(inst[k]) !== JSON.stringify(pinst[k])) : [];
  const methods = methodsOf(C);
  const inj = [...(injected.get(C.model_type)?.keys() || [])];

  const md = readDoc(name);
  const r = { class: name, model_type: C.model_type, parent: parent?.name || null, doc: md ? `docs/${name}.md` : null, own: own.length };
  if (!md) { r.missing_doc = true; r.undocumented = own; }
  else {
    const { mentioned, table } = docIdentifiers(md);
    r.undocumented = own.filter((k) => !mentioned.has(k));
    r.prose_only = own.filter((k) => mentioned.has(k) && !table.has(k));
    // a runtime prop documented on an ancestor's page counts as documented (it is shared by the family)
    const ancestorMentions = new Set();
    for (let P = Object.getPrototypeOf(C); P && P.name && P !== Function.prototype; P = Object.getPrototypeOf(P)) {
      const amd = readDoc(P.name);
      if (amd) for (const k of docIdentifiers(amd).mentioned) ancestorMentions.add(k);
    }
    r.runtime_undocumented = inj.filter((k) => !mentioned.has(k) && !ancestorMentions.has(k));
    const known = new Set([...(inst ? Object.keys(inst) : []), ...(pinst ? Object.keys(pinst) : []), ...methods, ...inj]);
    r.doc_stale = [...table].filter((k) => !known.has(k));
  }
  r.overridden_defaults = overridden;
  if (REG) {
    const fields = REG[C.model_type];
    if (!fields) r.registry = "no entry";
    else {
      const targets = fields.map((f) => f.target);
      const known = new Set([...all, ...methods, ...inj]);
      r.registry_stale = targets.filter((t) => !known.has(t));
      r.registry_not_editable = own.filter((k) => !targets.includes(k)).length;
    }
  }
  const stale = scenarioStale.get(C.model_type);
  r.scenario_stale = stale ? Object.fromEntries([...stale].map(([k, s]) => [k, [...s]])) : {};
  return r;
}

// helper modules: exported names, and for exported classes their public props
async function auditHelper(file, docName) {
  const mod = await import(pathToFileURL(path.join(ROOT, file)).href);
  const md = readDoc(docName);
  const exportsList = Object.keys(mod).filter((k) => k !== "default");
  const r = { class: docName === path.basename(file, ".js") ? docName : `${docName} (${path.basename(file, ".js")})`, file, doc: md ? `docs/${docName}.md` : null };
  let names = exportsList;
  if (typeof mod.default === "function") {
    const methods = [...methodsOf(mod.default)];
    let props = [];
    try { props = publicKeys(new mod.default(liveModel)); } catch { /* needs constructor args */ }
    names = [...exportsList, ...methods, ...props];
  }
  if (!md) { r.missing_doc = true; r.undocumented = names; }
  else {
    const { mentioned } = docIdentifiers(md);
    r.undocumented = names.filter((k) => !mentioned.has(k));
  }
  return r;
}

const HELPERS = [
  ["helpers/AnimationPacker.js", "AnimationPacker"], ["helpers/BloodMixing.js", "BloodMixing"],
  ["helpers/Calibrator.js", "Calibrator"], ["helpers/ChannelWriter.js", "ChannelWriter"],
  ["helpers/DataCollector.js", "DataCollector"], ["helpers/GasMixing.js", "GasMixing"],
  ["helpers/ModelRegistry.js", "ModelRegistry"], ["helpers/ModelScaler.js", "ModelScaler"],
  ["helpers/Orifice.js", "Orifice"], ["helpers/RealtimeChannels.js", "RealtimeChannels"],
  ["helpers/RealTimeMovingAverage.js", "RealTimeMovingAverage"], ["helpers/TaskScheduler.js", "TaskScheduler"],
  ["helpers/Units.js", "Units"], ["device_models/sle6000_params.js", "Sle6000"],
  ["component_models/BloodComposition.js", "BloodComposition"], ["component_models/GasComposition.js", "GasComposition"],
  ["realtime/ChannelReader.js", "ChannelReader"], ["realtime/RealtimeBus.js", "RealtimeBus"],
];

const results = [];
const { BaseModelClass } = await import("../base_models/BaseModelClass.js");
for (const [name, C] of [["BaseModelClass", BaseModelClass], ...classes]) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  results.push(auditClass(name, C));
}
for (const [file, docName] of HELPERS) {
  if (ONLY.length && !ONLY.includes(docName) && !ONLY.includes(path.basename(file, ".js"))) continue;
  try { results.push(await auditHelper(file, docName)); }
  catch (e) { results.push({ class: docName, file, error: String(e.message || e) }); }
}

// docs that match no class or helper (topic/reference pages are expected here)
const covered = new Set(results.map((r) => r.class));
const orphanDocs = fs.readdirSync(path.join(ROOT, "docs"))
  .filter((f) => f.endsWith(".md") && !covered.has(f.slice(0, -3)) && !ONLY.length);

// registry entries for model types the engine no longer has
const regOrphans = REG && !ONLY.length ? Object.keys(REG).filter((t) => !Index[t]) : [];

// ---------------------------------------------------------------------------------------------
// report
if (AS_JSON) {
  _log(JSON.stringify({ scenarios: SCENARIOS, registry: REG ? REGISTRY : null, results, orphanDocs, regOrphans }, null, 2));
  process.exit(0);
}
const n = (a) => (Array.isArray(a) ? a.length : a && typeof a === "object" ? Object.keys(a).length : 0);
const list = (a) => (a.length ? a.map((x) => `\`${x}\``).join(", ") : "–");
_log(`# Doc audit (${new Date().toISOString().slice(0, 10)}, runtime props from ${SCENARIOS.join(" + ")}${REG ? "" : ", no registry"})\n`);
_log("| Class | Doc | Own props | Undocumented | Prose only | Runtime undoc. | Stale in doc | Registry stale | Scenario stale keys |");
_log("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  if (r.error) { _log(`| ${r.class} | error: ${r.error} |||||||| `); continue; }
  _log(`| ${r.class} | ${r.doc ? "✓" : "**missing**"} | ${r.own ?? "–"} | ${n(r.undocumented)} | ${n(r.prose_only)} | ${n(r.runtime_undocumented)} | ${n(r.doc_stale)} | ${r.registry === "no entry" ? "no entry" : n(r.registry_stale)} | ${n(r.scenario_stale)} |`);
}
if (orphanDocs.length) _log(`\nDocs with no matching class (topic/reference pages): ${orphanDocs.join(", ")}`);
if (regOrphans.length) _log(`\nRegistry entries for model types the engine doesn't have: ${regOrphans.join(", ")}`);
if (SUMMARY) process.exit(0);

for (const r of results) {
  if (r.error) continue;
  _log(`\n## ${r.class}${r.model_type ? ` (${r.parent ? `extends ${r.parent}` : "root"})` : ` (${r.file})`}`);
  if (r.missing_doc) _log("- **No doc page.**");
  _log(`- Undocumented: ${list(r.undocumented || [])}`);
  if (r.prose_only) _log(`- Mentioned in prose but not in a property table: ${list(r.prose_only)}`);
  if (r.runtime_undocumented) _log(`- Created at runtime (not in the constructor), undocumented: ${list(r.runtime_undocumented)}`);
  if (r.doc_stale) _log(`- In a doc property table but not in the code: ${list(r.doc_stale)}`);
  if (r.overridden_defaults?.length) _log(`- Inherited props with a changed default: ${list(r.overridden_defaults)}`);
  if (r.registry === "no entry") _log("- Registry: no entry");
  else if (r.registry_stale) _log(`- Registry targets not in the code: ${list(r.registry_stale)} (own props not editable: ${r.registry_not_editable})`);
  for (const [k, s] of Object.entries(r.scenario_stale || {})) _log(`- Scenario key \`${k}\` unknown to the class: ${s.length} scenario(s) (${s.slice(0, 3).join(", ")}${s.length > 3 ? ", …" : ""})`);
}
