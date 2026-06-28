// One-off, idempotent patch: add the three Tier-A neonatal-core models (Thermoregulation, Glucose,
// Lactate) to an existing scenario JSON, in the right step-order (right after Metabolism, before
// Blood), plus the `glucose` blood solute, the d5/d10 dextrose fluid types, and Metabolism's
// vo2_temp_factor channel. Re-runnable — skips anything already present.
//
//   node scripts/_add_neonatal_core.mjs <scenario> [<scenario> ...]
//
// The three models are process-controllers that auto-seed to NEUTRAL at rest (so a scenario shipping
// them keeps its calibrated operating point). After patching, re-bake the steady state with the
// generic warmer:  node scripts/reseed_preterm.mjs --file <scenario> --write
//
// NB: this only edits the JSON; it does not warm. It writes with the same 1-space indentation the
// reseed/make scripts use, and reseed rewrites the file anyway.
import fs from "node:fs";

const scenarios = process.argv.slice(2);
if (!scenarios.length) { console.error("usage: node scripts/_add_neonatal_core.mjs <scenario> ..."); process.exit(1); }

function blocks(isAdult, gluVal) {
  // env_temp is only the heat-loss reference the controller auto-trims against at rest, so it is
  // cosmetic for the operating point; a clothed adult room (~24) vs a neonatal incubator (~32).
  const env = isAdult ? 24.0 : 32.0;
  return {
    Thermoregulation: {
      name: "Thermoregulation", description: "body temperature controller", is_enabled: true,
      model_type: "Thermoregulation", components: {},
      thermoregulation_running: true, env_temp: env, radiant_temp: null, rel_humidity: 0.5, setpoint_temp: 37.0,
    },
    Glucose: {
      name: "Glucose", description: "blood glucose / insulin controller", is_enabled: true,
      model_type: "Glucose", components: {},
      glucose_running: true, glu_use_rate: 0.03, hgp_rate: 0.03, glucose_setpoint: gluVal,
    },
    Lactate: {
      name: "Lactate", description: "hypoxia-driven lactate production", is_enabled: true,
      model_type: "Lactate", components: {},
      lactate_running: true, lact_baseline: 1.0, threshold_frac: 0.5, lact_per_o2_deficit: 0.33, lact_clearance: 0.002,
    },
  };
}

for (const scenario of scenarios) {
  const file = new URL(`../public/model_definitions/${scenario}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const def = json.model_definition || json;
  const m = def.models;
  if (!m || !m.Metabolism) { console.error(`SKIP ${scenario}: no Metabolism model to anchor`); continue; }

  const isAdult = (def.weight || 0) >= 10;
  const gluVal = isAdult ? 5.0 : 4.0;
  const changes = [];

  // 1. Metabolism.vo2_temp_factor (Q10 channel driven by Thermoregulation)
  if (m.Metabolism.vo2_temp_factor === undefined) {
    // place it right after vo2_factor for readability by rebuilding the Metabolism object in order
    const reordered = {};
    for (const [k, v] of Object.entries(m.Metabolism)) {
      reordered[k] = v;
      if (k === "vo2_factor") reordered.vo2_temp_factor = 1;
    }
    if (reordered.vo2_temp_factor === undefined) reordered.vo2_temp_factor = 1; // fallback if no vo2_factor key
    m.Metabolism = reordered;
    changes.push("Metabolism.vo2_temp_factor");
  }

  // 2. insert the three models right after Metabolism (preserving insertion order → step order)
  if (!m.Thermoregulation || !m.Glucose || !m.Lactate) {
    const newBlocks = blocks(isAdult, gluVal);
    const rebuilt = {};
    for (const [k, v] of Object.entries(m)) {
      rebuilt[k] = v;
      if (k === "Metabolism") {
        for (const [nk, nv] of Object.entries(newBlocks)) if (!m[nk]) rebuilt[nk] = nv;
      }
    }
    def.models = rebuilt;
    changes.push("Thermoregulation+Glucose+Lactate");
  }
  const mm = def.models;

  // 3. glucose blood solute
  if (mm.Blood?.solutes && mm.Blood.solutes.glucose === undefined) {
    mm.Blood.solutes.glucose = gluVal;
    changes.push(`Blood.solutes.glucose=${gluVal}`);
  }

  // 4. dextrose fluid types
  if (mm.Fluids?.fluids) {
    if (mm.Fluids.fluids.d5 === undefined) { mm.Fluids.fluids.d5 = { glucose: 278 }; changes.push("Fluids.d5"); }
    if (mm.Fluids.fluids.d10 === undefined) { mm.Fluids.fluids.d10 = { glucose: 555 }; changes.push("Fluids.d10"); }
  }

  if (!changes.length) { console.log(`${scenario}: already patched (no change)`); continue; }
  const out = JSON.stringify(json, null, 1) + "\n";
  JSON.parse(out); // validate
  fs.writeFileSync(file, out);
  console.log(`${scenario} (w=${def.weight}, ${isAdult ? "adult" : "neonate"}): ${changes.join(", ")}`);
}
