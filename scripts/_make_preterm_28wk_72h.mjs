// Generator: term_neonate.json -> preterm_28wk_72h.json, a preterm neonate born at 28 weeks (1.0 kg)
// at 72 h, stable on nasal CPAP 6 cmH2O with FiO2 0.25, a small restrictive left-to-right PDA, a
// small PFO, untransfused (delayed cord clamping), trophic feeds + PN, caffeine, in an incubator.
//
//   node scripts/_make_preterm_28wk_72h.mjs [--seconds 300]
//
// The reference set it is validated against: docs/Preterm28wkReference.md and
// scripts/reference/preterm_28wk_72h.json (probe: scripts/probe_term_reference.mjs --ref ...).
//
// Pipeline (all re-runnable):
//   1. live-build today's validated term_neonate, scale it to 1.0 kg and apply the levers below
//   2. write model_definitions/preterm_28wk_72h.json (un-warmed)
//   3. scripts/_add_surfactant.mjs  - dynamic RDS recruitment model (neutral at baseline)
//   4. scripts/reseed_preterm.mjs   - warm to rest, set the preterm renal reference (< 34 wk), warm, bake
//   5. scripts/_add_apnea.mjs       - apnea controller (shipped OFF) + hypoxic-bradycardia chemoreflex,
//                                     anchored to the baked AA.po2 so it is neutral at rest
//
// Every lever is a named constant. Values marked "reference" come straight from the reference set;
// values marked "starting point" come from the _make_preterm.mjs 28 wk row or _make_bischoff.mjs and are
// to be validated against the reference (step 6), not tuned here.
//
// Not done here, on purpose:
//   - minute_volume_ref is NOT multiplied by the weight factor. It is per kg (Breathing.js multiplies
//     by model.weight), so _make_preterm.mjs scaled it twice and the chemoreflex had to make up a
//     ~3.4x shortfall (EF_MV ~3.4).
//   - CPAP is not a device. The Ventilator CPAP mode seals MOUTH_DS and breaks the spontaneous
//     Breathing controller (see _make_bischoff.mjs), and a static airway pressure cannot be baked. CPAP
//     is represented as the inspired FiO2 at MOUTH plus a recruited-lung state.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEngine } from "./_harness.mjs";
import { serializeState } from "./_serialize_state.mjs";
import { setDiagramTitle } from "./_titles.mjs";
import { scaleHormoneReferences, describeHormoneReferences } from "./_reference.mjs";

const argv = process.argv.slice(2);
const SECONDS = (() => { const i = argv.indexOf("--seconds"); return i >= 0 ? Number(argv[i + 1]) : 300; })();
const NAME = "preterm_28wk_72h";

// --- patient (reference) ---
const WEIGHT = 1.0;          // kg
const HEIGHT = 0.355;        // m (_make_preterm 28 wk row)
const GA = 28;               // weeks
const AGE = 3 / 365;         // years (scenario age is in years): 72 h

// --- circulation ---
const HR_REF = 155;          // reference: HR 155 (Deshpande 2023, Bischoff 2021)
const BR_MAP = 39;           // reference: the MAP the baroreflex defends = Elsayed 2023 day-3 invasive median
const SVR = 1.0;             // starting point (_make_preterm 28 wk)
const PVR = 1.75;            // starting point (_make_preterm 28 wk); reference PAP ratio 0.55
const CONT = 0.90;           // starting point: immature contractility, Heart.cont_factor_*
const RELAX = 1.10;          // starting point: immature diastolic function, Heart.relax_factor_*
const VEN_UVOL = 0.82;       // starting point: VLB/VUB unstressed volume (restores CVP after scaling)
const PDA_REL = 1.0 / 3.0;   // reference: ductal diameter 1.0 mm (Pda.diameter_pa_max = 3 mm)
// the foramen ovale keeps term_neonate's 1.5 mm with fo_lr_factor 1 (starting point)

// --- lungs and breathing ---
const RDS_EL = 9.067;        // starting point: alveolar el_base x (_make_preterm 28 wk, unsupported severe RDS)
const RDS_UVOL = 0.50;       // starting point: alveolar u_vol x
const GASEX = 0.45;          // starting point: alveolar-capillary diffusion x
const IPS_RES = 1900;        // starting point: intrapulmonary shunt resistance (Shunts.ips_res)
const SURFACTANT = 0.25;     // starting point: surfactant maturity (_add_surfactant 28 wk); post-surfactant may sit higher
const FIO2 = 0.25;           // reference: state definition
const MV_REF = 0.300;        // reference: minute volume 300 mL/kg/min (L/kg/min, per kg)
const RR = 62;               // reference: respiratory rate
const VT_RR = MV_REF / (RR * RR); // RR = sqrt(MV / (vt_rr_ratio x W)) at W = 1 kg -> 7.80e-5
const IE = 0.38;             // reference: Ti/Ttot
// chemoreceptor set-points = the reference resting gases, so the chemoreflex is neutral at the target
const CR = { CR_PCO2: 46, CR_PO2: 50, CR_PH: 7.26 };

// --- metabolism, blood, environment ---
const VO2_METABOLISM = 5.19; // reference total 6.0 minus term's Mob (myocardium) ~0.81 (starting point split)
const HB_MMOL = 14.5 / 1.611; // reference: Hb 14.5 g/dL -> 9.0 mmol/L
const P50 = 18.5;            // reference: De Halleux 2002, untransfused <= 27 wk, standard conditions
const ENV_TEMP = 35.0;       // reference: incubator air (degC)
const REL_HUMIDITY = 0.70;   // reference: incubator humidity

const eng = await createEngine();
// imported after createEngine, which registers the extensionless-import hook the engine modules need
const { calc_gas_composition } = await import("../component_models/GasComposition.js");
const src = new URL("../model_definitions/term_neonate.json", import.meta.url);
const dst = new URL(`../model_definitions/${NAME}.json`, import.meta.url);
const j = JSON.parse(fs.readFileSync(src, "utf8"));
const model = eng.build(j.model_definition); // freezes _baseline_weight = 3.545 (the scaling denominator)
const M = model.models;
const TERM_W = model._baseline_weight;
const log = [];

// 1. size: volumes scale with weight (ModelScaler.scale_to_weight sets model.weight)
eng.scale("weight_scale", WEIGHT);
const volFactor = WEIGHT / TERM_W;
log.push(`size: ${TERM_W} -> ${WEIGHT} kg (volumes x${volFactor.toFixed(4)})`);
if (SVR !== 1.0) eng.scale("systemic_resistances", SVR);
if (PVR !== 1.0) eng.scale("pulmonary_resistances", PVR);
log.push(`resistances: systemic x${SVR}, pulmonary x${PVR}`);

// 2. lungs: RDS phenotype, recruited by CPAP
for (const n of ["ALL", "ALR"]) { M[n].el_base *= RDS_EL; M[n].u_vol *= RDS_UVOL; }
for (const n of ["GASEX_LL", "GASEX_RL"]) { M[n].dif_o2 *= GASEX; M[n].dif_co2 *= GASEX; }
M.Shunts.ips_res = IPS_RES;
log.push(`lungs: el_base x${RDS_EL}, u_vol x${RDS_UVOL}, diffusion x${GASEX}, ips_res ${IPS_RES}`);

// 3. breathing: spontaneous, per-kg reference minute volume, rapid-shallow pattern
const B = M.Breathing;
B.breathing_enabled = true;
B.minute_volume_ref = MV_REF;
B.vt_rr_ratio = VT_RR;
B.ie_ratio = IE;
for (const [n, v] of Object.entries(CR)) M[n].set_value = v;
log.push(`breathing: minute_volume_ref ${MV_REF} L/kg/min, vt_rr_ratio ${VT_RR.toExponential(3)}, ie_ratio ${IE}; CR set-points ${JSON.stringify(CR)}`);

// 4. CPAP: FiO2 at the airway reservoir; the device stays off and MOUTH_DS open
calc_gas_composition(M.MOUTH, FIO2, M.MOUTH.temp || 37, M.MOUTH.humidity || 1.0);
if (M.Gas) M.Gas.fio2 = FIO2;
if (M.Ventilator) { M.Ventilator.is_enabled = false; M.Ventilator.ettube_diameter = 2.5; }
log.push(`CPAP: FiO2 ${FIO2} at MOUTH, Ventilator off (ET tube 2.5 mm if used)`);

// 5. heart, baroreflex, slow volume/pressure controller, preload
M.Heart.heart_rate_ref = HR_REF;
const termBrMap = M.BR_MAP.set_value;
M.BR_MAP.set_value = BR_MAP;
log.push(`heart: heart_rate_ref ${HR_REF}; BR_MAP ${termBrMap} -> ${BR_MAP}`);
log.push(describeHormoneReferences(scaleHormoneReferences(model, { volumeFactor: volFactor, mapRef: BR_MAP, mapRefBaseline: termBrMap })));
for (const n of ["VLB", "VUB"]) if (M[n]) M[n].u_vol *= VEN_UVOL;
M.Heart.cont_factor_left = CONT; M.Heart.cont_factor_right = CONT;
M.Heart.relax_factor_left = RELAX; M.Heart.relax_factor_right = RELAX;
M.Pda.diameter_relative = PDA_REL;
log.push(`preload: VLB/VUB u_vol x${VEN_UVOL}; myocardium cont ${CONT}, relax ${RELAX}; PDA ${(PDA_REL * M.Pda.diameter_pa_max).toFixed(2)} mm; FO ${M.Shunts.diameter_fo} mm`);

// 6. metabolism, blood, environment
M.Metabolism.vo2 = VO2_METABOLISM;
M.Blood.set_solute("hemoglobin", HB_MMOL);
M.Blood.set_P50(P50);
M.Thermoregulation.env_temp = ENV_TEMP;
M.Thermoregulation.rel_humidity = REL_HUMIDITY;
log.push(`metabolism: vo2 ${VO2_METABOLISM}; Hb ${HB_MMOL.toFixed(2)} mmol/L; P50 ${P50}; incubator ${ENV_TEMP} degC / ${REL_HUMIDITY * 100} %`);

model.weight = WEIGHT;
model.height = HEIGHT;
model.gestational_age = GA;
model.age = AGE;

const desc =
  "Preterm neonate born at 28 weeks (1.0 kg) at 72 h: stable on nasal CPAP 6 cmH2O with FiO2 0.25 after " +
  "surfactant (mild RDS), a small restrictive left-to-right PDA (~1 mm) and a small PFO, untransfused " +
  "(delayed cord clamping), trophic feeds + parenteral nutrition, caffeine, humidified incubator. CPAP is " +
  "represented by the inspired FiO2 plus a recruited-lung state. Validated against " +
  "docs/Preterm28wkReference.md.";
j.name = NAME;
setDiagramTitle(j, NAME);
j.user = "timothy";
j.description = desc;
j.provenance = "hand-authored";
j.provenance_note = "generated from term_neonate by scripts/_make_preterm_28wk_72h.mjs; reference set docs/Preterm28wkReference.md";
model.name = NAME;
model.description = desc;

j.model_definition = serializeState(model);
const text = JSON.stringify(j, null, 1) + "\n";
JSON.parse(text);
fs.writeFileSync(dst, text);
process.stderr.write(`wrote ${fileURLToPath(dst)}\n${log.join("\n")}\n`);

// 3-5: the shared patchers and the warm/bake step
const run = (script, ...args) => {
  const outText = execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { encoding: "utf8" });
  process.stderr.write(outText);
};
run("./_add_surfactant.mjs", `${NAME}=${SURFACTANT}`);
run("./reseed_preterm.mjs", "--file", NAME, "--seconds", String(SECONDS), "--write");
run("./_add_apnea.mjs", NAME);
