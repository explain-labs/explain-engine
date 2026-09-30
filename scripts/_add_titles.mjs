// Idempotent patch: set the diagram TITLE label of generated scenarios from scripts/_titles.mjs. Touches
// only diagram_definition.components.TITLE.label — never model state — so no reseed is needed.
//   node scripts/_add_titles.mjs            (every mapped scenario that exists)
//   node scripts/_add_titles.mjs <key> ...  (just these)
import fs from "node:fs";
import { TITLES, setDiagramTitle } from "./_titles.mjs";

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TITLES);
for (const key of keys) {
  const file = new URL(`../model_definitions/${key}.json`, import.meta.url);
  if (!fs.existsSync(file)) { console.log(`SKIP ${key}: no scenario file`); continue; }
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw);
  const before = json.diagram_definition?.components?.TITLE?.label;
  const title = setDiagramTitle(json, key);
  if (!title) { console.log(`SKIP ${key}: unmapped or no TITLE`); continue; }
  if (before === title) { console.log(`${key}: already "${title}"`); continue; }
  fs.writeFileSync(file, JSON.stringify(json, null, 1) + "\n");
  console.log(`${key}: "${before}" -> "${title}"`);
}
