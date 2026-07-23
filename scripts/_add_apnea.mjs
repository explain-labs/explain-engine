// Idempotent patch: add apnea of prematurity to a scenario.
//   (1) inserts an `Apnea` controller model (after Breathing) with GA-graded episode defaults, and
//   (2) closes the hypoxia -> bradycardia chemoreflex by adding a dedicated pO2 heart-rate
//       chemoreceptor afferent (`CR_PO2_HR`) + efferent (`EF_HR_CHEMO` -> Heart.hr_chemo_factor)
//       under the ANS.
//
// The chemoreflex is tuned to be NEUTRAL at the scenario's own calibrated baseline arterial pO2
// (set_value = baseline AA.po2) so it does not shift resting heart rate; it only engages when an
// apnea drives pO2 acutely below that baseline. That is why we read AA.po2 from the scenario rather
// than using a fixed setpoint (preterm baseline pO2 runs ~47-69 mmHg, well below the CR_PO2 = 80
// breathing setpoint).
//
// Apnea generation ships DISABLED (apnea_enabled=false) so patched scenarios keep their calibrated
// baseline vitals; enable per run in the probe / UI, or patch with `<scenario>=on`.
//
//   node scripts/_add_apnea.mjs preterm_28wk
//   node scripts/_add_apnea.mjs preterm_24wk preterm_26wk preterm_28wk preterm_30wk preterm_32wk preterm_34wk preterm_36wk
//   node scripts/_add_apnea.mjs preterm_28wk=on           # ship with apnea enabled
import fs from "node:fs";

// GA-graded episode defaults: younger = more frequent, longer pauses.
const APNEA_BY_GA = {
  24: { frequency: 1.2, duration: 20 },
  26: { frequency: 0.9, duration: 18 },
  28: { frequency: 0.7, duration: 16 },
  30: { frequency: 0.5, duration: 14 },
  32: { frequency: 0.35, duration: 12 },
  34: { frequency: 0.2, duration: 11 },
  36: { frequency: 0.1, duration: 10 },
};

function apneaDefaultsForGA(ga) {
  if (APNEA_BY_GA[ga]) return APNEA_BY_GA[ga];
  // nearest tabulated GA for anything off-grid
  const gas = Object.keys(APNEA_BY_GA).map(Number);
  const nearest = gas.reduce((a, b) => (Math.abs(b - ga) < Math.abs(a - ga) ? b : a), gas[0]);
  return APNEA_BY_GA[nearest];
}

function findAA(models) {
  if (models.AA) return models.AA; // standalone (unusual)
  for (const v of Object.values(models)) {
    if (v && v.components && v.components.AA) return v.components.AA; // usually under Circulation
  }
  return null;
}

for (const item of process.argv.slice(2)) {
  const [scenario, flag] = item.split("=");
  const enabled = flag === "on" || flag === "true";
  const file = new URL(`../model_definitions/${scenario}.json`, import.meta.url);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.error(`SKIP ${scenario}: cannot read ${scenario}.json`);
    continue;
  }
  const def = json.model_definition || json;
  const m = def.models;
  if (!m || !m.Breathing) {
    console.error(`SKIP ${scenario}: no Breathing to anchor`);
    continue;
  }
  if (!m.Ans || !m.Ans.components) {
    console.error(`SKIP ${scenario}: no Ans block to wire the chemoreflex into`);
    continue;
  }

  const ga = Number(def.gestational_age) || Number((scenario.match(/(\d+)/) || [])[1]) || 28;
  const ap = apneaDefaultsForGA(ga);

  // ---- (1) Apnea controller ----
  if (m.Apnea) {
    console.log(`${scenario}: already has Apnea (skipping controller)`);
  } else {
    const apneaBlock = {
      name: "Apnea",
      description: "apnea of prematurity — episodic ventilation suppression",
      is_enabled: true,
      model_type: "Apnea",
      components: {},
      apnea_enabled: enabled,
      apnea_frequency: ap.frequency,
      apnea_duration: ap.duration,
      apnea_variability: 0.3,
      apnea_type: "central",
      mixed_obstructive_fraction: 0.5,
      seed: 42,
      breathing_model: "Breathing",
      airway_model: "MOUTH_DS",
    };
    // insert directly after Breathing to preserve a sensible ordering
    const rebuilt = {};
    for (const [k, v] of Object.entries(m)) {
      rebuilt[k] = v;
      if (k === "Breathing") rebuilt.Apnea = apneaBlock;
    }
    def.models = rebuilt;
  }

  // ---- (2) hypoxic-bradycardia chemoreflex ----
  const ans = def.models.Ans;
  if (ans.components.EF_HR_CHEMO && ans.components.CR_PO2_HR) {
    console.log(`${scenario}: already has hypoxic-bradycardia chemoreflex (skipping ANS wiring)`);
  } else {
    const aa = findAA(def.models);
    const basePo2 = aa && Number.isFinite(aa.po2) ? aa.po2 : 60;
    // Put the neutral point (setpoint) a few mmHg BELOW baseline so normal beat-to-beat pO2 ripple sits
    // in the flat, no-effect region (firing >= 0.5) and the one-sided reflex does not rectify it into a
    // resting bradycardia. Bradycardia then engages only when an apnea pulls pO2 below this threshold.
    const setPo2 = Math.round((basePo2 - 5) * 10) / 10;
    // Centre the reflex's dynamic range on the pO2 band an apnea actually reaches (~35-50 mmHg): even a
    // prolonged pause bottoms out near baseline-20, so the full-bradycardia floor is placed there rather
    // than at an unreachably low pO2.
    const minPo2 = Math.max(15, Math.round((basePo2 - 20) * 10) / 10); // deep desat -> full bradycardia
    const maxPo2 = Math.round((basePo2 + 30) * 10) / 10; // hyperoxia -> no effect (one-sided reflex)

    ans.components.CR_PO2_HR = {
      name: "CR_PO2_HR",
      description: "ans chemoreceptor po2 afferent driving hypoxic bradycardia",
      is_enabled: true,
      model_type: "AnsAfferent",
      components: {},
      input_model: "AA",
      input_prop: "po2",
      efferents: ["EF_HR_CHEMO"],
      effect_weight: 1,
      min_value: minPo2,
      set_value: setPo2,
      max_value: maxPo2,
      tc: 1,
      ans_active: true,
    };
    ans.components.EF_HR_CHEMO = {
      name: "EF_HR_CHEMO",
      description: "ans effector pathway: hypoxic bradycardia on heart rate",
      is_enabled: true,
      model_type: "AnsEfferent",
      components: {},
      target_model: "Heart",
      target_prop: "hr_chemo_factor",
      effect_at_max_firing_rate: 1.0, // hyperoxia: no tachycardia via this path
      effect_at_min_firing_rate: 0.5, // deep hypoxia: heart rate falls to ~0.5x reference
      tc: 1,
      ans_active: true,
    };
    console.log(
      `${scenario}: wired CR_PO2_HR (set=${setPo2}, min=${minPo2}, max=${maxPo2}) -> EF_HR_CHEMO -> Heart.hr_chemo_factor`
    );
  }

  fs.writeFileSync(file, JSON.stringify(json, null, 1) + "\n");
  console.log(
    `${scenario}: added Apnea (GA ${ga}: freq ${ap.frequency}/min, dur ${ap.duration}s, enabled=${enabled})`
  );
}
