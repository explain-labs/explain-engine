// Idempotent patch: add the Brain (cerebral autoregulation + ICP) model to a scenario, after Kidneys.
// Neutral at baseline; autoregulation_gain grades cerebral autoregulatory MATURITY (preterm brains are
// immature/pressure-passive → lower gain → the IVH substrate).
//   node scripts/_add_brain.mjs <scenario>=<gain> ...
import fs from "node:fs";
for (const item of process.argv.slice(2)) {
  const [scenario, gainStr] = item.split("=");
  const gain = gainStr !== undefined ? Number(gainStr) : 1.0;
  const file = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const m = (json.model_definition || json).models;
  if (!m || !m.Kidneys) { console.error(`SKIP ${scenario}: no Kidneys to anchor`); continue; }
  if (m.Brain) { console.log(`${scenario}: already has Brain`); continue; }
  const block = { name: "Brain", description: "cerebral autoregulation + intracranial pressure",
    is_enabled: true, model_type: "Brain", components: {}, brain_running: true,
    autoregulation_enabled: true, icp_enabled: true, autoregulation_gain: gain, edema_volume: 0.0 };
  const rebuilt = {};
  for (const [k, v] of Object.entries(m)) { rebuilt[k] = v; if (k === "Kidneys") rebuilt.Brain = block; }
  (json.model_definition || json).models = rebuilt;
  fs.writeFileSync(file, JSON.stringify(json, null, 1) + "\n");
  console.log(`${scenario}: added Brain (autoregulation_gain=${gain})`);
}
