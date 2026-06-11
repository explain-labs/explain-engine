// Build the "command catalog" the Explain bot uses to know which actions it may
// propose. It is generated from the SAME two sources the webapp validates
// against, so the bot can never be told it can do something the app would reject:
//
//   src/services/botCommandAllowlist.ts   — the executable allowlist (the gate)
//   src/model-interface/registry.ts       — per-field bounds / choices / args / units
//
// Output: knowledge-pack/command-catalog.md — a compact, bot-facing reference of
// every currently-enabled command with its envelope and constraints.
//
// This is a SNAPSHOT, like build_knowledge_pack.mjs: re-run after changing the
// allowlist (or a Ventilator-style model's interface) and redeploy to the bot.
//
//   Usage:  node scripts/build_command_catalog.mjs
//
// We can't `import` the .ts sources directly in Node, so we bundle them to a temp
// ESM module with esbuild (already a dependency via vite) and introspect that.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT = path.resolve(ROOT, "knowledge-pack/command-catalog.md");

// ---------------------------------------------------------------------------
// 1. Bundle the allowlist + registry accessor to an importable module
// ---------------------------------------------------------------------------
const ENTRY = `
export { COMMAND_ALLOWLIST } from "@/services/botCommandAllowlist";
export { getInterfaceForType } from "@/model-interface/registry";
`;

const tmp = path.join(os.tmpdir(), `explain-cmd-catalog-${process.pid}.mjs`);
await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: ROOT, loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: tmp,
  alias: { "@": path.resolve(ROOT, "src") },
  logLevel: "warning",
});
const { COMMAND_ALLOWLIST, getInterfaceForType } = await import(`file://${tmp}`);
fs.rmSync(tmp, { force: true });

// ---------------------------------------------------------------------------
// 2. Render each allowlist entry from the registry schema
// ---------------------------------------------------------------------------
// NOTE: for catalog lookup we treat an entry's `model` as its model_type. That
// holds for the v1 singletons (the "Ventilator" instance has model_type
// "Ventilator"). If a future entry names an instance whose name differs from its
// type, add a `type` field to the allowlist entry and use it here.
const unit = (caption) => caption?.match(/\(([^)]+)\)/)?.[1] ?? "";
const bounds = (f) => {
  const b = [];
  if (typeof f.ll === "number") b.push(`min ${f.ll}`);
  if (typeof f.ul === "number") b.push(`max ${f.ul}`);
  return b.join(", ");
};
// mirror resolveChoices() in src/services/botCommands.ts — registry mixes
// options/choices and doesn't always set custom_options, so an empty options[]
// must fall through to choices.
const choicesOf = (f) =>
  [f.custom_options ? f.choices : f.options, f.choices, f.options].find(
    (c) => Array.isArray(c) && c.length > 0,
  ) ?? [];

const lines = [];
const warn = [];

const exampleFor = (entry, field) => {
  const env = { op: entry.op };
  if (entry.op === "setProp") {
    env.model = entry.model;
    env.target = entry.target;
    env.value =
      field?.type === "boolean"
        ? true
        : field?.type === "list"
          ? (choicesOf(field)[0] ?? "")
          : typeof field?.ll === "number"
            ? field.ll
            : 0;
  } else if (entry.op === "call") {
    env.model = entry.model;
    env.target = entry.target;
    env.args = (field?.args ?? []).map((a) =>
      a.type === "boolean" ? true : a.type === "number" ? (a.ll ?? 0) : (choicesOf(a)[0] ?? ""),
    );
  }
  env.reason = entry.note ?? "";
  return JSON.stringify(env);
};

for (const entry of COMMAND_ALLOWLIST) {
  if (entry.op === "start" || entry.op === "stop") {
    lines.push(`### \`${entry.op}\` — ${entry.note ?? ""}`);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify({ op: entry.op, reason: entry.note ?? "" }));
    lines.push("```");
    lines.push("");
    continue;
  }

  const iface = getInterfaceForType(entry.model);
  const field = iface.find((f) => f.target === entry.target);
  if (!field) {
    warn.push(`${entry.op} ${entry.model}.${entry.target} — no registry field found`);
  }

  const title =
    entry.op === "call"
      ? `### \`call\` ${entry.model}.${entry.target}() — ${field?.caption ?? entry.note ?? ""}`
      : `### \`setProp\` ${entry.model}.${entry.target} — ${field?.caption ?? entry.note ?? ""}`;
  lines.push(title);
  lines.push("");

  if (entry.op === "setProp" && field) {
    const u = unit(field.caption);
    const detail = [
      `type: ${field.type}`,
      u && `unit: ${u}`,
      bounds(field) && `range: ${bounds(field)}`,
      field.type === "list" && `choices: ${choicesOf(field).join(", ")}`,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`- ${detail}`);
    lines.push("- `value` is in the unit shown above (the same number a clinician reads in the UI).");
  } else if (entry.op === "call" && field) {
    const args = field.args ?? [];
    if (!args.length) {
      lines.push("- no arguments");
    } else {
      lines.push(`- arguments (in order):`);
      for (const a of args) {
        const u = unit(a.caption);
        const detail = [
          `type ${a.type}`,
          u && `unit ${u}`,
          bounds(a) && `range ${bounds(a)}`,
          choicesOf(a).length && `choices ${choicesOf(a).join(", ")}`,
        ]
          .filter(Boolean)
          .join(", ");
        lines.push(`  - \`${a.target}\` — ${a.caption ?? a.target} (${detail})`);
      }
    }
  }
  lines.push("");
  lines.push("```json");
  lines.push(exampleFor(entry, field));
  lines.push("```");
  lines.push("");
}

// ---------------------------------------------------------------------------
// 3. Assemble + write
// ---------------------------------------------------------------------------
const header = [
  "# Explain — command catalog (bot-facing)",
  "",
  "This is the **exhaustive** list of model actions you may currently propose. It is",
  "generated from the webapp's allowlist + parameter schema, so anything NOT listed here",
  "will be **rejected** by the app — do not invent commands, models, properties, or",
  "arguments outside this catalog.",
  "",
  "See `command-protocol.md` for HOW to emit a command (the fenced-block format and the",
  "rules on when to do so). This file is just the vocabulary.",
  "",
  "Values are in the **clinical/display unit shown** for each field (the app converts to",
  "engine-internal units itself). Stay within the stated range.",
  "",
  `**Enabled commands: ${COMMAND_ALLOWLIST.length}.** Snapshot — regenerate with`,
  "`node scripts/build_command_catalog.mjs` after the allowlist changes.",
  "",
  "---",
  "",
].join("\n");

fs.writeFileSync(OUT, header + lines.join("\n"), "utf8");

console.log(`command catalog written: ${path.relative(ROOT, OUT)}`);
console.log(`  enabled commands: ${COMMAND_ALLOWLIST.length}`);
if (warn.length) {
  console.log(`  warnings:`);
  for (const w of warn) console.log(`    ! ${w}`);
}
