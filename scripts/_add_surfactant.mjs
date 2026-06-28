// Idempotent patch: add the Surfactant (dynamic RDS recruitment) model to a scenario, inserted right
// after Respiration in the models map. The model is neutral at the scenario's baseline (auto-centered
// recruitment + f0 reference), so it preserves calibration; surfactant maturity grades by prematurity
// only to set how much therapy headroom exists.
//
//   node scripts/_add_surfactant.mjs <scenario>=<surfactant> [<scenario>=<surfactant> ...]
//   e.g. node scripts/_add_surfactant.mjs preterm_28wk=0.25 preterm_24wk=0.15
import fs from "node:fs";

const items = process.argv.slice(2);
if (!items.length) { console.error("usage: node scripts/_add_surfactant.mjs <scenario>=<surfactant> ..."); process.exit(1); }

for (const item of items) {
  const [scenario, surfStr] = item.split("=");
  const surfactant = surfStr !== undefined ? Number(surfStr) : 0.3;
  const file = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const def = json.model_definition || json;
  const m = def.models;
  if (!m || !m.Respiration) { console.error(`SKIP ${scenario}: no Respiration to anchor`); continue; }
  if (m.Surfactant) { console.log(`${scenario}: already has Surfactant (no change)`); continue; }

  const block = {
    name: "Surfactant", description: "dynamic surfactant / alveolar recruitment (RDS)", is_enabled: true,
    model_type: "Surfactant", components: {},
    surfactant_running: true, surfactant: surfactant,
    lung_models: ["ALL", "ALR"], gasex_models: ["GASEX_LL", "GASEX_RL"], shunt_models: ["IPSL", "IPSR"],
  };
  // insert right after Respiration (preserve key order)
  const rebuilt = {};
  for (const [k, v] of Object.entries(m)) { rebuilt[k] = v; if (k === "Respiration") rebuilt.Surfactant = block; }
  def.models = rebuilt;

  const out = JSON.stringify(json, null, 1) + "\n";
  JSON.parse(out);
  fs.writeFileSync(file, out);
  console.log(`${scenario}: added Surfactant (surfactant=${surfactant})`);
}
