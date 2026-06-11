// Self-test: prove the knowledge pack actually makes Claude an expert on Explain.
//
// Sends knowledge-pack/system-prompt.md + explain-knowledge-pack.md as a prompt-cached
// system prompt (exactly as the bot should) and asks a few Explain-specific questions
// whose answers are ONLY derivable from the bundle. A correct, source-grounded answer
// confirms the pack works; it also reports cache_creation/read tokens so you can see
// caching engage on the 2nd+ question.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/probe_knowledge_pack.mjs [--model claude-opus-4-8]
//
// This is the "does the pack confer knowledge" test in isolation (direct Anthropic API).
// To test the deployed bot instead, point your client at EXPLAIN_BOT_URL/v1/ask.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const MODEL = opt("--model", "claude-opus-4-8");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY in the environment.");
  process.exit(1);
}

const read = (rel) => fs.readFileSync(path.resolve(ROOT, rel), "utf8");
let SYSTEM_PROMPT, PACK;
try {
  SYSTEM_PROMPT = read("knowledge-pack/system-prompt.md");
  PACK = read("knowledge-pack/explain-knowledge-pack.md");
} catch {
  console.error("Missing pack files — run `node scripts/build_knowledge_pack.mjs` first.");
  process.exit(1);
}

// Questions answerable only from the bundle. Correct answers should match, respectively:
//   1. p_eff = p + (factor-1)*p + (factor_ps-1)*p + (factor_scaling_ps-1)*p
//   2. model.ncc_ventricular (and ncc_atrial), on the engine `model` object, watched by DataCollector
//   3. add an export line in explain/ModelIndex.js (and a registry.ts entry for editability)
const QUESTIONS = [
  "What are the three multiplier layers in the factor/effective-value pattern, and give the exact formula for an effective value (e.g. el_base -> el_base_eff)?",
  "Which counter does the Heart use to drive ECG/ventricular timing, and where does that counter live — on the component or the engine model object?",
  "Besides creating the class file, what must I edit to register a new model so the engine finds it at build, and what makes its parameters editable in the app?",
];

const system = [
  { type: "text", text: SYSTEM_PROMPT },
  { type: "text", text: PACK, cache_control: { type: "ephemeral" } },
];

for (let i = 0; i < QUESTIONS.length; i++) {
  const q = QUESTIONS[i];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: q }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error(`\nAPI error (${resp.status}):`, JSON.stringify(data, null, 2));
    process.exit(1);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const u = data.usage || {};
  console.log(`\n========== Q${i + 1}: ${q}\n`);
  console.log(text.trim());
  console.log(
    `\n[usage] input=${u.input_tokens} cache_write=${u.cache_creation_input_tokens} cache_read=${u.cache_read_input_tokens} output=${u.output_tokens}`,
  );
}
console.log("\nDone. Cache_read should be non-zero from Q2 onward (prefix served from cache).");
