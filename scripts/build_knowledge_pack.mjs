// Build the "Explain knowledge pack" — a single Markdown bundle of the engine
// source, physiology docs, UI/integration code, and architecture notes, meant to
// be loaded as a (prompt-cached) system prompt for the `explain-labs_claude` bot
// so it becomes as knowledgeable about the Explain model as Claude Code is.
//
// This is a SNAPSHOT: re-run after changing the engine and redeploy the output to
// the bot host. The script is idempotent and read-only over the repo.
//
// Usage:
//   node scripts/build_knowledge_pack.mjs [--tier=full|lite] [--out=<path>]
//
//   --tier=full  (default) everything: CLAUDE.md + all docs + README + all engine
//                JS + UI schema (registry/types) + chat store + scenario format.
//                ~215K tokens — needs a 1M-context model on the bot.
//   --tier=lite  CLAUDE.md + all docs + README + core engine files only + scenario
//                format. ~95K tokens — fits a standard 200K-context model.
//
// Outputs (default, under knowledge-pack/):
//   explain-knowledge-pack.md   the corpus
//   system-prompt.md            the role/instruction preamble to send ahead of it

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const optVal = (name, def) => {
  const pref = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : def;
};
const TIER = optVal("tier", "full");
if (TIER !== "full" && TIER !== "lite") {
  console.error(`unknown --tier=${TIER} (expected full|lite)`);
  process.exit(1);
}

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT_DIR = path.resolve(ROOT, "knowledge-pack");
const OUT_PACK = path.resolve(ROOT, optVal("out", "knowledge-pack/explain-knowledge-pack.md"));
const OUT_SYSPROMPT = path.resolve(OUT_DIR, "system-prompt.md");

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------
const exists = (rel) => fs.existsSync(path.resolve(ROOT, rel));

// glob a single directory (non-recursive) for files matching a predicate, sorted
const listDir = (rel, pred) => {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => pred(f))
    .sort()
    .map((f) => `${rel}/${f}`);
};

const isJs = (f) => f.endsWith(".js");

// Engine JS, grouped so the pack reads in a sensible order.
const ENGINE_DIRS_CORE = ["explain"]; // Model.js, ModelEngine.js, ModelEmitter.js, ModelIndex.js
const ENGINE_DIRS_FULL = [
  "explain/base_models",
  "explain/component_models",
  "explain/device_models",
  "explain/helpers",
  "explain/realtime",
];

const coreEngineFiles = listDir("explain", isJs);
const baseModelFiles = listDir("explain/base_models", isJs);

const docFiles = listDir("explain/docs", (f) => f.endsWith(".md"));

const uiFiles = ["src/model-interface/registry.ts", "src/model-interface/types.ts", "src/stores/chat.ts"];

// ---------------------------------------------------------------------------
// Section assembly helpers
// ---------------------------------------------------------------------------
const langForExt = (p) => {
  if (p.endsWith(".md")) return "markdown";
  if (p.endsWith(".ts")) return "typescript";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "javascript";
  if (p.endsWith(".json")) return "json";
  return "";
};

// Pick an outer fence longer than any backtick run inside the content, so embedded
// ``` blocks (common in the markdown docs) don't terminate our wrapper early.
const safeFence = (content) => {
  let max = 0;
  for (const m of content.matchAll(/`+/g)) max = Math.max(max, m[0].length);
  return "`".repeat(Math.max(3, max + 1));
};

const embedFile = (rel) => {
  const abs = path.resolve(ROOT, rel);
  const content = fs.readFileSync(abs, "utf8");
  const fence = safeFence(content);
  return `### FILE: ${rel}\n\n${fence}${langForExt(rel)}\n${content}\n${fence}\n`;
};

const embedBlock = (heading, lang, content) => {
  const fence = safeFence(content);
  return `### ${heading}\n\n${fence}${lang}\n${content}\n${fence}\n`;
};

// Trim a full scenario JSON down to its model_definition with only a few sample
// model entries — the format matters, the bulk of 60+ entries does not.
const scenarioExcerpt = () => {
  const rel = "explain/model_definitions/term_neonate_clean.json";
  if (!exists(rel)) return null;
  const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, rel), "utf8"));
  const md = raw.model_definition || raw;
  const models = md.models || {};
  const names = Object.keys(models);
  const sampleNames = names.slice(0, 3);
  const trimmedModels = {};
  for (const n of sampleNames) trimmedModels[n] = models[n];
  const excerpt = {
    "//": `model_definition excerpt from ${rel}. Top-level wrapper keys present in the full file: ${Object.keys(
      raw,
    ).join(", ")}. The engine consumes only model_definition (Model.load unwraps it). This excerpt shows ${sampleNames.length} of ${names.length} entries in models{}.`,
    ...Object.fromEntries(Object.entries(md).filter(([k]) => k !== "models")),
    models: {
      "//": `${names.length} models total in this scenario; full list of names: ${names.join(", ")}`,
      ...trimmedModels,
    },
  };
  return JSON.stringify(excerpt, null, 2);
};

// ---------------------------------------------------------------------------
// Build the pack
// ---------------------------------------------------------------------------
const parts = [];
const fileList = []; // for the TOC + reporting

const addFileSection = (rel) => {
  if (!exists(rel)) {
    console.warn(`  ! skipping missing file: ${rel}`);
    return;
  }
  fileList.push(rel);
  parts.push(embedFile(rel));
};

// --- Header + TOC ---
const tierBlurb =
  TIER === "full"
    ? "FULL tier: architecture notes, all physiology docs, the complete engine source, the UI/integration layer, and the scenario format."
    : "LITE tier: architecture notes, all physiology docs, the core engine source, and the scenario format.";

parts.push(
  [
    "# Explain Knowledge Pack",
    "",
    "This document is a self-contained snapshot of the **Explain** physiological simulation",
    "engine and its surrounding web app, assembled so an assistant can answer questions about",
    "the model with the same grounding Claude Code has when working in the repo.",
    "",
    `**Tier:** ${tierBlurb}`,
    "",
    "Every embedded file is introduced by a `### FILE: <path>` header so you can cite exact",
    "source locations (e.g. `explain/base_models/Capacitance.js`) in answers. Treat the source",
    "and docs below as the ground truth; prefer quoting them over recalling general knowledge.",
    "",
    "## How this pack is organized",
    "",
    "1. **Architecture** — the repo's CLAUDE.md (build flow, message envelope, model contract, the factor/effective-value pattern).",
    "2. **Engine onboarding** — explain/README.md.",
    "3. **Physiology docs** — explain/docs/*.md, the per-model derivations and math.",
    "4. **Engine source** — the live ES-module classes that run in the Web Worker.",
    ...(TIER === "full"
      ? ["5. **UI / integration layer** — the parameter-edit schema and the chat store.", "6. **Scenario format** — the model-definition JSON the engine consumes."]
      : ["5. **Scenario format** — the model-definition JSON the engine consumes."]),
    "",
    "---",
    "",
  ].join("\n"),
);

// --- 1. Architecture ---
parts.push("## 1. Architecture\n");
addFileSection("CLAUDE.md");

// --- 2. Engine onboarding ---
parts.push("\n## 2. Engine onboarding\n");
addFileSection("explain/README.md");

// --- 3. Physiology docs ---
parts.push("\n## 3. Physiology docs\n");
for (const d of docFiles) addFileSection(d);

// --- 4. Engine source ---
parts.push("\n## 4. Engine source\n");
if (TIER === "full") {
  for (const f of coreEngineFiles) addFileSection(f);
  for (const dir of ENGINE_DIRS_FULL) for (const f of listDir(dir, isJs)) addFileSection(f);
} else {
  // lite: core root files + base_models only
  for (const f of coreEngineFiles) addFileSection(f);
  for (const f of baseModelFiles) addFileSection(f);
}

// --- 5. UI / integration layer (full only) ---
if (TIER === "full") {
  parts.push("\n## 5. UI / integration layer\n");
  for (const f of uiFiles) addFileSection(f);

  // The bot can also PROPOSE actions on the running model. Embed the protocol
  // (how to emit a command block) + the generated catalog (what's allowed) so a
  // fallback (system-prompt) bot has them too. The Agent-SDK bot reads these
  // from its workdir via command-protocol.md / command-catalog.md directly.
  parts.push("\n### Acting on the simulation (command protocol)\n");
  for (const f of ["knowledge-pack/command-protocol.md", "knowledge-pack/command-catalog.md"]) {
    if (exists(f)) addFileSection(f);
    else console.warn(`  ! command file missing (run build_command_catalog.mjs): ${f}`);
  }
}

// --- Scenario format ---
const scenSectionNo = TIER === "full" ? 6 : 5;
parts.push(`\n## ${scenSectionNo}. Scenario format\n`);
parts.push(
  [
    "Scenarios in `model_definitions/*.json` are full app documents (`animation_definition`,",
    "`diagram_definition`, `configuration`, and **`model_definition`**). `Model.load()` fetches",
    "`/model_definitions/<name>.json` and unwraps `jsonData.model_definition || jsonData` before",
    "`build()`. Inside `model_definition`: engine settings plus **`models`** — a map of",
    "`name → { name, model_type, …params }` wired together by Resistor `comp_from`/`comp_to`.",
    "Available scenarios are listed in `public/model_definitions/index.json`.",
    "",
  ].join("\n"),
);
if (exists("public/model_definitions/index.json")) addFileSection("public/model_definitions/index.json");
const excerpt = scenarioExcerpt();
if (excerpt) {
  fileList.push("explain/model_definitions/term_neonate_clean.json (trimmed excerpt)");
  parts.push(embedBlock("EXCERPT: model_definition (trimmed)", "json", excerpt));
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const pack = parts.join("\n");
fs.writeFileSync(OUT_PACK, pack, "utf8");

const systemPrompt = `# System prompt — Explain Labs assistant

You are an expert engineer and physiologist for **Explain**, a real-time neonatal/adult
physiological simulation engine (a Web-Worker ES-module model with a Vue 3 front end).

You have been given, in the same message context, a "Knowledge Pack": a snapshot of the
Explain engine source, its per-model physiology docs, the architecture overview, and the
UI/integration layer. Use it as your primary source of truth.

Guidelines:
- Ground every answer in the embedded source and docs. Cite exact paths (e.g.
  \`explain/base_models/Resistor.js\`, \`explain/docs/Heart.md\`) and quote the relevant
  formula or contract rather than recalling generic physiology.
- The pack is a **snapshot** taken at build time. If asked about behavior you cannot find
  in it, say so plainly instead of guessing.
- Each user turn may begin with a **live patient-state context block** (current vitals /
  monitor values for the patient being simulated in the app). Treat that as "the current
  simulated patient" — distinct from the static engine knowledge in the pack. Use it to
  interpret what the numbers mean, but do not confuse it with the model definition.
- Be concise and technical/clinical. Replies are rendered as markdown in the app; keep
  formatting light — short paragraphs and simple lists read best.
- You can also **propose actions** on the running simulation. When the user asks you to
  change something (turn on the ventilator, raise FiO2, start/stop the sim), emit a fenced
  \`explain-command\` JSON block per the **command protocol** section embedded below, using
  only the commands in the **command catalog**. For questions, just answer — no command.

When explaining a model, prefer: what it represents physiologically → the governing
equations (from its doc) → how it's wired/parameterized in code → relevant scenario knobs.
`;
fs.writeFileSync(OUT_SYSPROMPT, systemPrompt, "utf8");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const bytes = Buffer.byteLength(pack, "utf8");
const estTokens = Math.round((bytes * 0.27) / 1000);
const fileCount = fileList.length;
console.log(`Explain knowledge pack — tier=${TIER}`);
console.log(`  embedded files : ${fileCount}`);
console.log(`  pack size      : ${(bytes / 1024).toFixed(0)} KB`);
console.log(`  est. tokens    : ~${estTokens}K  (bytes × 0.27)`);
console.log(`  pack written   : ${path.relative(ROOT, OUT_PACK)}`);
console.log(`  system prompt  : ${path.relative(ROOT, OUT_SYSPROMPT)}`);
if (TIER === "full" && estTokens > 200) {
  console.log(`  note           : >200K tokens — run the bot on a 1M-context model, or use --tier=lite.`);
}
