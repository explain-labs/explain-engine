// Build the "command catalog" the Explain bot uses to know which model actions
// it may propose. Generated from the SAME sources the webapp validates against,
// so the bot is never told it can do something the app would reject:
//
//   src/services/botCommandAllowlist.ts   — the curated "Guided" allowlist
//   src/model-interface/registry.ts       — MODEL_INTERFACES: every editable
//                                            field, its bounds / choices / args / units
//
// Output: knowledge-pack/command-catalog.md — two parts:
//   1. Guided mode — the small curated set (active when the user picks "Guided").
//   2. Full mode   — every runtime-settable field on every model_type (the default).
//
// "Settable at runtime" = a non-readonly number/factor/boolean/list parameter, or
// a function. The structural wiring types (multiple-list/prop-list/reference/dict)
// are rebuild-only and excluded; readonly measured-outputs/descriptions too. This
// mirrors isSettableField() in src/services/botCommands.ts.
//
// SNAPSHOT — re-run after the registry or allowlist changes and redeploy to the
// bot. We bundle the .ts sources to a temp ESM module with esbuild (a vite dep)
// since Node can't import TS directly.
//
//   Usage:  node scripts/build_command_catalog.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT = path.resolve(ROOT, "knowledge-pack/command-catalog.md");

// ---------------------------------------------------------------------------
// 1. Bundle the allowlist + registry to an importable module
// ---------------------------------------------------------------------------
const ENTRY = `
export { COMMAND_ALLOWLIST, DIAGRAM_ACTIONS } from "@/services/botCommandAllowlist";
export { MODEL_INTERFACES, getInterfaceForType } from "@/model-interface/registry";
export { PICTOS, PATH_TYPES, LAYOUT_PATCH_WHITELIST } from "@/render/diagramConstants";
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
const {
  COMMAND_ALLOWLIST,
  DIAGRAM_ACTIONS,
  MODEL_INTERFACES,
  getInterfaceForType,
  PICTOS,
  PATH_TYPES,
  LAYOUT_PATCH_WHITELIST,
} = await import(`file://${tmp}`);
fs.rmSync(tmp, { force: true });

// ---------------------------------------------------------------------------
// 2. Field helpers (kept in sync with src/services/botCommands.ts)
// ---------------------------------------------------------------------------
const unit = (caption) => caption?.match(/\(([^)]+)\)/)?.[1] ?? "";
const bounds = (f) => {
  const b = [];
  if (typeof f.ll === "number") b.push(`${f.ll}`);
  if (typeof f.ul === "number") b.push(`${f.ul}`);
  return b.length === 2 ? `${b[0]}–${b[1]}` : b.length ? (typeof f.ll === "number" ? `≥${f.ll}` : `≤${f.ul}`) : "";
};
// mirror resolveChoices() — registry mixes options/choices and doesn't always set
// custom_options, so an empty options[] must fall through to choices.
const choicesOf = (f) =>
  [f.custom_options ? f.choices : f.options, f.choices, f.options].find(
    (c) => Array.isArray(c) && c.length > 0,
  ) ?? [];

const SETTABLE_PROP_TYPES = new Set(["number", "factor", "boolean", "list"]);
const isSettableProp = (f) => !f.readonly && SETTABLE_PROP_TYPES.has(f.type);
const isFunction = (f) => f.type === "function";

// compact "[type, unit, range, choices]" tail for a param or arg
const metaTail = (f) =>
  [
    f.type,
    unit(f.caption),
    bounds(f) && `range ${bounds(f)}`,
    f.type === "list" && choicesOf(f).length && `one of ${choicesOf(f).join("/")}`,
  ]
    .filter(Boolean)
    .join(", ");

const MODE_ORDER = { basic: 0, extra: 1, factors: 2, advanced: 3 };
const modeRank = (f) => MODE_ORDER[f.edit_mode] ?? 4;
const modeTag = (f) => (f.edit_mode && f.edit_mode !== "basic" ? ` _(${f.edit_mode})_` : "");

const paramLine = (f) =>
  `- \`${f.target}\`${f.caption ? ` — ${f.caption}` : ""} (${metaTail(f)})${modeTag(f)}`;

const funcLine = (f) => {
  // args joined by ";" so an arg's own comma-separated meta stays unambiguous
  const args = (f.args ?? [])
    .map((a) => `${a.target} (${metaTail(a)})`)
    .join("; ");
  return `- \`${f.target}(${args})\`${f.caption ? ` — ${f.caption}` : ""}`;
};

// ---------------------------------------------------------------------------
// 3. Guided section (the curated allowlist)
// ---------------------------------------------------------------------------
const guided = ["## Guided mode — curated safe set", ""];
guided.push(
  "Active when the user selects **Guided** scope in the chat panel. Only these commands apply;",
  "anything else is rejected (the app suggests switching to Full). Full mode (below) is the default.",
  "",
);
for (const e of COMMAND_ALLOWLIST) {
  const where = e.model ? `\`${e.model}.${e.target}\`` : "";
  guided.push(`- \`${e.op}\` ${where}${e.note ? ` — ${e.note}` : ""}`);
}
guided.push("");

// ---------------------------------------------------------------------------
// 4. Full section (every settable field, by model_type)
// ---------------------------------------------------------------------------
const full = ["## Full mode — all settable fields by model_type", ""];
let typeCount = 0;
let propCount = 0;
let fnCount = 0;

for (const type of Object.keys(MODEL_INTERFACES).sort()) {
  const fields = getInterfaceForType(type);
  const props = fields.filter(isSettableProp).sort((a, b) => modeRank(a) - modeRank(b));
  const fns = fields.filter(isFunction);
  if (!props.length && !fns.length) continue;

  typeCount++;
  propCount += props.length;
  fnCount += fns.length;

  full.push(`### ${type}`);
  if (props.length) {
    full.push("", "_setProp_:");
    for (const f of props) full.push(paramLine(f));
  }
  if (fns.length) {
    full.push("", "_call_:");
    for (const f of fns) full.push(funcLine(f));
  }
  full.push("");
}

// ---------------------------------------------------------------------------
// 4b. Diagram section (op: "diagram" — edits the live diagram)
// ---------------------------------------------------------------------------
const diagram = ["## Diagram editing — `op:\"diagram\"`", ""];
diagram.push(
  "Edit the diagram the user sees (compartments = sprites bound to engine models,",
  "connectors = paths between them). Requires the **Diagram tab** to be open; each",
  "turn's context lists the **Current diagram** (component ids + their model bindings),",
  "and the **`Models in scenario:`** map gives the engine instance names you bind to.",
  "Use existing component ids verbatim; give every new component a unique `name`.",
  "",
  "Envelope: `{\"op\":\"diagram\",\"action\":\"<action>\", ...fields, \"reason\":\"<label>\"}`",
  "",
  "Actions:",
);
for (const d of DIAGRAM_ACTIONS) {
  diagram.push(`- \`${d.action}\` — fields: ${d.fields}. ${d.note}`);
}
diagram.push(
  "",
  `- **picto** must be one of: ${PICTOS.join(", ")}`,
  `- **path.type** must be one of: ${PATH_TYPES.join(", ")}`,
  `- **setLayout patch** keys (cosmetic only): ${LAYOUT_PATCH_WHITELIST.join(", ")}`,
  "- **pos**: `{\"type\":\"arc\",\"dgs\":<0-360>}` to sit on the layout ring, or",
  "  `{\"type\":\"rel\",\"x\":<-1..1>,\"y\":<-1..1>}` relative to centre.",
  "",
  "Example — add a kidney compartment and connect it to the aorta:",
  "```json",
  '{"op":"diagram","action":"addComponent","name":"Kidney","models":["Kidneys"],"picto":"general.png","label":"Kidney","pos":{"type":"arc","dgs":210},"reason":"add kidney"}',
  '{"op":"diagram","action":"connect","from":"AA","to":"Kidney","models":["AA_Kidney"],"path":{"type":"arc"},"reason":"renal artery"}',
  "```",
  "",
);

// ---------------------------------------------------------------------------
// 4c. Events & scheduling (op: "event" — a named, saved bundle of timed changes)
// ---------------------------------------------------------------------------
const events = ["## Events & scheduling — `op:\"event\"`", ""];
events.push(
  "Bundle several property changes into one **named event** the user can replay. Each entry",
  "in `changes[]` is a `setProp`-style `{model, target, value}` with two optional timing",
  "fields (simulated seconds, only advancing while the sim runs):",
  "",
  "- `it` — ramp the numeric value to the target over N seconds (numbers only; booleans/lists swap instantly).",
  "- `at` — delay the change N seconds before it starts.",
  "",
  "Each change is validated against the same fields/bounds/units as a `setProp` (Full vs Guided",
  "scope applies per change). Applying the card **saves the event into the Event Scheduler",
  "panel** — it does not fire it; the user applies or arms it there. Optional `fire_at` (absolute",
  "sim-clock auto-fire) is a panel feature; omit unless asked.",
  "",
  "Envelope: `{\"op\":\"event\",\"name\":\"<name>\",\"changes\":[{\"model\",\"target\",\"value\",\"it\"?,\"at\"?}, …],\"fire_at\":<s?>,\"reason\":\"<label>\"}`",
  "",
  "Example — drive a tachycardia then drop spontaneous breathing 30 s later:",
  "```json",
  '{"op":"event","name":"induce tachy","changes":[{"model":"Heart","target":"heart_rate_ref","value":200,"it":15},{"model":"Breathing","target":"breathing_enabled","value":false,"at":30}],"reason":"ramp HR to 200 over 15s, apnea at +30s"}',
  "```",
  "",
);

// ---------------------------------------------------------------------------
// 5. Header + assemble + write
// ---------------------------------------------------------------------------
const header = [
  "# Explain — command catalog (bot-facing)",
  "",
  "What you may propose as `explain-command` actions. See `command-protocol.md` for HOW to",
  "emit them and the rules. Resolve a target like this: read the **`Models in scenario:`**",
  "map in the live context to pick the right *instance name*, find that instance's",
  "*model_type* in the map, then use the fields listed under that model_type here.",
  "",
  "**Envelope** (one JSON object per fenced block):",
  "",
  "```json",
  '{"op":"setProp","model":"<instance name>","target":"<field>","value":<value>,"it":<ramp s?>,"at":<delay s?>,"reason":"<short label>"}',
  '{"op":"call","model":"<instance name>","target":"<function>","args":[...],"reason":"<short label>"}',
  '{"op":"event","name":"<event name>","changes":[{"model":"..","target":"..","value":..,"it":<s?>,"at":<s?>}],"reason":"<short label>"}',
  '{"op":"start"}   {"op":"stop"}',
  "```",
  "",
  "Rules of thumb:",
  "- **Values are in the displayed unit** shown per field; stay within the stated range.",
  "- **Timing (optional):** `it` ramps a numeric value to the target over N simulated seconds;",
  "  `at` delays the change N seconds. `op:\"event\"` bundles several timed `changes[]` into a",
  "  named event saved to the Event Scheduler panel — see `command-protocol.md` (Scheduling).",
  "- **To tune a physiological property, prefer its `*_factor_ps` knob** (a `factor` field,",
  "  1.0 = baseline, >1 increases, <1 decreases) over editing the raw base value — factors",
  "  compose with interventions and weight-scaling. E.g. stiffer LV → `LV.el_max_factor_ps` 1.3.",
  "- Only fields listed here are accepted; readonly measured-outputs and structural wiring are omitted.",
  "",
  `Snapshot: **${typeCount} model_types**, **${propCount} settable params**, **${fnCount} functions**`,
  `(+ ${COMMAND_ALLOWLIST.length} Guided commands, ${DIAGRAM_ACTIONS.length} diagram actions). Regenerate with \`node scripts/build_command_catalog.mjs\`.`,
  "",
  "---",
  "",
].join("\n");

fs.writeFileSync(
  OUT,
  header +
    guided.join("\n") +
    "\n---\n\n" +
    full.join("\n") +
    "\n---\n\n" +
    events.join("\n") +
    "\n---\n\n" +
    diagram.join("\n"),
  "utf8",
);

console.log(`command catalog written: ${path.relative(ROOT, OUT)}`);
console.log(`  Guided commands : ${COMMAND_ALLOWLIST.length}`);
console.log(`  Full mode       : ${typeCount} model_types, ${propCount} params, ${fnCount} functions`);
console.log(`  Diagram actions : ${DIAGRAM_ACTIONS.length}`);
