

import { BaseModelClass } from "../base_models/BaseModelClass.js";
import { calc_gas_composition } from "../component_models/GasComposition"
import { calc_blood_composition } from "../component_models/BloodComposition";
import RealTimeMovingAverage from "../helpers/RealTimeMovingAverage";

// the blood-side resistors of the circuit: the two cannulas plus the connectors the ECLS
// BloodVessels create for their inputs (named `<input>_<vessel>`, see BloodVessel.init_model)
const ECLS_RESISTORS = [
  "ECLS_DRAINAGE",
  "ECLS_TUBING_IN_ECLS_PUMP",
  "ECLS_PUMP_ECLS_OXY",
  "ECLS_OXY_ECLS_TUBING_OUT",
  "ECLS_RETURN",
];

// Circuit calibration constants (sources: docs/Ecls.md, "Circuit calibration").
// Manufacturer cannula charts are measured with water at room temperature (~1 cP). Blood at 37 °C and
// a neonatal ECMO haematocrit (~30-35 %) is ~3 cP and 1.06 kg/L, so the viscous (linear) part of a
// water chart is scaled by the viscosity ratio and the inertial (quadratic) part by the density
// ratio. This puts the blood drop 30-60 % above the water chart at neonatal flows, inside the
// 10-80 % excess measured in blood by Broman et al (Perfusion 2020).
const BLOOD_VISCOSITY = 0.003; // Pa·s — blood at 37 °C, Hct ~30-35 % (Poiseuille tubing resistance)
const BLOOD_VISCOSITY_RATIO = 3.0; // blood / water-at-room-temperature viscosity (cannula linear term)
const BLOOD_DENSITY_RATIO = 1.06; // blood / water density (cannula quadratic term)
// The cannula resistance is evaluated at the circuit flow (a chord resistance dP(Q)/Q). Below this
// flow (L/min) the chord is held, so a stopped circuit keeps a finite, positive resistance.
const CANNULA_FLOW_FLOOR = 0.05;
// Lower bound on a cannula resistance (mmHg/(L/s)) for numerical stability, not physiology: the
// explicit step needs R*C well above the step size, and the ECLS compartments are stiff (elastance
// ~50000 mmHg/L, so R must stay above ~25 at a 0.5 ms step). Large adult cannulas at near-zero flow
// would otherwise fall below it and blow up. 100 mmHg/(L/s) is under 2 mmHg per L/min.
const CANNULA_RES_MIN = 100.0;
const MMHG_PER_PA = 1.0 / 133.322;
const BLOOD_DENSITY = 1060.0; // kg/m^3
const GRAVITY = 9.81; // m/s^2

// hydrostatic pressure (mmHg) of a blood column height_cm high (~0.78 mmHg per cm). The circuit
// transducers sit at pump level; with the pump below the patient they read the line pressure plus
// this column. It is a read-out offset only: in a closed loop the column adds on the drainage limb
// and subtracts on the return limb, so it does not change the circuit flow.
function hydrostatic_offset(height_cm) {
  return BLOOD_DENSITY * GRAVITY * (height_cm / 100.0) * MMHG_PER_PA;
}

// chord resistance (mmHg/(L/s)) of a cannula/lumen in blood at circuit flow q_lmin, from its
// water-chart fit dP = dp_a*Q + dp_b*Q^2 (mmHg, Q in L/min)
function cannula_resistance(fit, q_lmin) {
  const q = Math.max(Math.abs(q_lmin), CANNULA_FLOW_FLOOR);
  const per_lmin = fit.dp_a * BLOOD_VISCOSITY_RATIO + fit.dp_b * BLOOD_DENSITY_RATIO * q;
  return Math.max(per_lmin * 60.0, CANNULA_RES_MIN); // mmHg per L/min -> mmHg/(L/s)
}

// laminar (Poiseuille) resistance of a blood-filled tube, in mmHg/(L/s)
function poiseuille_resistance(diameter, length) {
  if (!(diameter > 0.0) || !(length > 0.0)) return 0.0;
  const r = diameter / 2.0;
  const pa_s_per_m3 = (8.0 * BLOOD_VISCOSITY * length) / (Math.PI * r ** 4);
  return pa_s_per_m3 * MMHG_PER_PA / 1000.0; // m^3 -> L
}

export class Ecls extends BaseModelClass {
  // static properties
  static model_type = "Ecls";

  /*

    */

  constructor(model_ref, name = "") {
    // initialize the base model class setting all the general properties of the model which all models have in common
    
    // Average umbilical cord length at term          : – 55 cm
    // Mean luminal CSA per artery at 37–39 weeks     : – 0.147 cm² (overall mean across 300 normal pregnancies) DOI: http://dx.doi.org/10.18203/2320-1770.ijrcog20183851
    // Mean volume of umbilical artery                : 55 * 0.147 = 8.1 cm3 = 8.1 ml per artery => 16.2 ml for two arteries
    // Mean luminal CSA umbilical vein at 37-39 weeks : - 0.58 cm2
    // Mean volume of umbilical vein                  : 55 * 0.58 = 31.9 cm3 = 31.9 ml  Spurway J, Logan P, Pak S. The development, structure and blood flow within the umbilical cord with particular reference to the venous system. Australas J Ultrasound Med. 2012 Aug;15(3):97-102. doi: 10.1002/j.2205-0140.2012.tb00013.x. Epub 2015 Dec 31. PMID: 28191152; PMCID: PMC5025097.
    // Mean volume of fetal part of placenta          : 427 ml DOI: 10.7863/jum.2008.27.11.1583

    super(model_ref, name);
    // -----------------------------------------------
    // initialize independent parameters
    this.ecls_running = false;
    this.ecls_clamped = true; // flags whether the umbilical vessels are clamped or not
    
    
    this.drainage_res_factor = 1.0; // factor to adjust the drainage resistance
    this.return_res_factor = 1.0; // factor to adjust the return resistance
    this.tubing_res_factor = 1.0; // factor to adjust the tubing in resistance
    this.pump_res_factor = 1.0; // factor to adjust the pump resistance
    this.oxy_res_for = 1500; // resistance of the oxygenator (mmHg/(L/s))
    this.oxy_res_back = 1500; // resistance of the oxygenator (mmHg/(L/s))
    this.oxy_res_factor = 1.0; // factor to adjust the oxygenator resistance
    this.oxy_vol = 0.09; // volume of the oxygenator (L)
    this.gas_flow = 0.5; // gas flow rate through the oxygenator (L/min)
    this.gas_fio2 = 0.205; // fraction of inspired oxygen in the gas flow through the oxygenator
    this.gas_fico2 = 0.000392; // fraction of inspired carbon dioxide in the gas flow through the oxygenator
    this.gas_humidity = 0.5; // humidity of the gas flow through the oxygenator (fraction)
    this.gas_temp = 20.0; // temperature of the gas flow through the oxygenator (dgs C)

    // blood-side heater-cooler (heat exchanger) — controls the temperature of the blood leaving the
    // oxygenator. OFF by default so ECLS_OXY behaves like any other blood compartment (neutral).
    // When active it drives ECLS_OXY toward blood_temp; that cooled/warmed blood advects into the
    // patient and, via the two-node coupling, pulls the whole blood pool and the core toward it —
    // this is how therapeutic hypothermia / controlled rewarming is represented.
    this.blood_temp_active = false; // master on/off for the heater-cooler
    this.blood_temp = 37.0; // target blood temperature at the oxygenator (dgs C)
    this.blood_temp_tc = 2.0; // heat-exchanger equilibration time constant (s) — fast
    this.dif_o2 = 0.0005; // diffusion constant for oxygen (mmol/mmHg * s)
    this.dif_co2 = 0.001; // diffusion constant for carbon dioxide (mmol/mmHg * s)
    this.pump_rpm = 1500.0; // pump speed in rotations per minute
    this.pump_mode = 0; // pump mode (0=centrifugal, 1=roller pump)
    this.pump_pressure =  0.0
    // height of the pump and its pressure transducers BELOW the patient's heart level (cm; negative =
    // above). Shifts the measured p_ven/p_int/p_art by the blood column (hydrostatic_offset); flow is
    // unaffected. 30 cm is an assumed console position, putting neonatal VV p_ven at ~ -13 mmHg
    // (13 Fr double lumen, 0.44 L/min), inside the -10 to -20 mmHg seen at the bedside.
    this.pump_height = 30.0;
    this.cannula_sizes_single = [6, 8, 10, 12]; // sizes of the drainage and return cannula in Fr
    this.cannula_size_double = [13, 14, 15]; // sizes of the drainage cannula in Fr for double lumen cannula (the return cannula is always 1 Fr larger than the drainage cannula in this case)
    
    this.drainage_site = "RA"; // site of drainage cannula insertion
    this.drainage_cannula_diameter = 0.0027; // diameter of the drainage cannula (m)
    this.drainage_cannula_length = 0.105; // length of the drainage cannula (m)

    this.return_site = "AAR"; // site of return cannula insertion
    this.return_cannula_diameter = 0.0027; // diameter of the return cannula (m)
    this.return_cannula_length = 0.105; // length of the return cannula (m)
    
    this.tubing_in_diameter = 0.00375; // diameter of the tubing (m)
    this.tubing_in_length = 1.0; // length of the tubing (m)

    this.tubing_out_diameter = 0.00375; // diameter of the tubing (m)
    this.tubing_out_length = 1.0; // length of the tubing (m)

    this.pump_res_for = 50; // resistance of the pump (mmHg/(L/s))
    this.pump_res_back = 50; // resistance of the pump (mmHg/(L/s))
    this.pump_vol = 0.031; // volume of the pump (L)

    // pump head-flow (H-Q) characteristic — active coefficients, copied from the selected entry in
    // `pumps` below. Centrifugal head (mmHg) = hq_a*(rpm/1000)^2 - hq_b*(rpm/1000)*Q - hq_c*Q^2 (Q in
    // L/min), a real rotodynamic characteristic (afterload/preload sensitive) rather than the old
    // flow-independent -rpm/25. Roller mode is a positive-displacement flow source: an integral
    // controller trims the drive pressure so circuit flow tracks Q_target = roller_ml_per_rev*rpm/1000.
    this.pump_hq_a = 21.16; // head vs rpm^2 term (mmHg per krpm^2) — default = Abbott PediMag
    this.pump_hq_b = 5.2; // head falloff vs rpm*flow (mmHg per krpm per L/min) — Euler-slip term
    this.pump_hq_c = 15.4; // head falloff vs flow^2 (mmHg per (L/min)^2)
    this.pump_max_rpm = 5500; // informational max rpm of the selected pump
    this.roller_ml_per_rev = 1.5; // roller stroke volume (mL per revolution)
    this.roller_kp = 30.0; // roller flow-controller gain (mmHg per (L/min) error per update)
    this.roller_drive_max = 900.0; // clamp on roller drive pressure (mmHg)

    // oxygenator membrane transfer — active fields, copied from the selected entry in `oxygenators`
    // below and pushed onto ECLS_GASEX. o2_cap/co2_cap (mmol/s) are the membrane transfer ceiling that
    // makes the oxygenator rated-flow-limited (post-oxy saturation falls once blood flow exceeds the
    // rated flow) instead of always fully saturating.
    this.oxy_o2_cap = 0.067; // max O2 transfer (mmol/s) of the selected oxygenator
    this.oxy_co2_cap = 0.054; // max CO2 transfer (mmol/s)
    this.oxy_surface_area = 0.38; // membrane surface area (m^2) — informational
    this.oxy_rated_flow = 1.5; // rated blood flow (L/min) — informational


    // Cannula libraries. Each entry carries the manufacturer's pressure-drop vs flow chart, fitted as
    // dP = dp_a*Q + dp_b*Q^2 (mmHg, Q in L/min). Those charts are measured in WATER at room temperature;
    // the circuit converts them to blood with BLOOD_VISCOSITY_RATIO (on the viscous, linear term) and
    // BLOOD_DENSITY_RATIO (on the inertial, quadratic term). Cannula pressure drop is mostly inertial
    // (entrance/exit losses), so it rises steeply with flow — the drop at the working flow, not a fixed
    // resistance, is what sets the pump speed. Sources and fits: docs/Ecls.md, "Circuit calibration".
    // Neonatal/pediatric arterial: Medtronic DLP pediatric one-piece arterial 8-14 Fr (77008-77014)
    // as the proxy for the Bio-Medicus neck cannula (its own chart is not published as data); adult
    // arterial: Bio-Medicus NextGen femoral arterial 15-21 Fr.
    this.return_cannulas = {
      "Biomedicus arterial 8 Fr": { inner_diameter: 0.002, length: 0.1, dp_a: 19.84, dp_b: 162.87 },
      "Biomedicus arterial 10 Fr": { inner_diameter: 0.00267, length: 0.105, dp_a: 4.2, dp_b: 59.62 },
      "Biomedicus arterial 12 Fr": { inner_diameter: 0.0032, length: 0.11, dp_a: 8.74, dp_b: 17.96 },
      "Biomedicus arterial 15 Fr": { inner_diameter: 0.004, length: 0.18, dp_a: 0.0, dp_b: 11.35 },
      "Biomedicus arterial 17 Fr": { inner_diameter: 0.0048, length: 0.2, dp_a: 0.0, dp_b: 6.08 },
      "Biomedicus arterial 19 Fr": { inner_diameter: 0.0055, length: 0.22, dp_a: 0.0, dp_b: 3.45 },
      "Biomedicus arterial 21 Fr": { inner_diameter: 0.006, length: 0.24, dp_a: 0.39, dp_b: 2.07 },
    };

    // Venous: Bio-Medicus NextGen pediatric venous 10-14 Fr (96830-110..114); 8 Fr has no published
    // chart and is extrapolated from 10 Fr by (ID ratio)^4; adult: Bio-Medicus NextGen femoral
    // bi-caval venous 21-25 Fr (96670-121..125).
    this.drainage_cannulas = {
      "Biomedicus venous 8 Fr": { inner_diameter: 0.0021, length: 0.1, dp_a: 29.4, dp_b: 129.5 },
      "Biomedicus venous 10 Fr": { inner_diameter: 0.0027, length: 0.105, dp_a: 10.78, dp_b: 47.42 },
      "Biomedicus venous 12 Fr": { inner_diameter: 0.0033, length: 0.11, dp_a: 6.61, dp_b: 17.08 },
      "Biomedicus venous 14 Fr": { inner_diameter: 0.0039, length: 0.115, dp_a: 4.79, dp_b: 9.27 },
      "Biomedicus venous 21 Fr": { inner_diameter: 0.006, length: 0.2, dp_a: 3.09, dp_b: 2.52 },
      "Biomedicus venous 23 Fr": { inner_diameter: 0.0068, length: 0.22, dp_a: 2.91, dp_b: 1.71 },
      "Biomedicus venous 25 Fr": { inner_diameter: 0.0075, length: 0.25, dp_a: 1.9, dp_b: 1.18 },
    };

    // Double-lumen (VV) cannula library: one device, two lumens, both in the right atrium. Each lumen
    // has its own water-chart fit: Getinge Avalon Elite bi-caval dual-lumen catheter (10013-CE /
    // 10016-CE manufacturer charts) and Medtronic Crescent RA jugular dual-lumen catheter (70413 /
    // 70415 / 70419; digitised from the brochure chart, UC202207936b, water at 21 °C). The narrow return (infusion) lumen is the bottleneck of neonatal
    // VV ECMO: at 0.5 L/min it costs ~110 mmHg in blood, more than an arterial cannula plus the
    // patient's arterial pressure on VA — which is why VV does not run at lower pump speeds.
    this.dl_cannulas = {
      "Avalon Elite 13 Fr": {
        drainage: { dp_a: 15.18, dp_b: 81.78 },
        return: { dp_a: 13.74, dp_b: 342.83 },
      },
      "Avalon Elite 16 Fr": {
        drainage: { dp_a: 6.27, dp_b: 32.1 },
        return: { dp_a: 0.0, dp_b: 168.95 },
      },
      "Crescent RA 13 Fr": {
        drainage: { dp_a: 19.75, dp_b: 57.75 },
        return: { dp_a: 38.72, dp_b: 228.87 },
      },
      "Crescent RA 15 Fr": {
        drainage: { dp_a: 12.46, dp_b: 25.87 },
        return: { dp_a: 15.85, dp_b: 109.61 },
      },
      "Crescent RA 19 Fr": {
        drainage: { dp_a: 4.61, dp_b: 9.8 },
        return: { dp_a: 5.95, dp_b: 40.41 },
      },
    };
    this.cannulation = "VA"; // "VA" (separate drainage + return cannula) or "VV-DL" (one double-lumen cannula)
    this.dl_cannula_type = "Avalon Elite 13 Fr"; // selects the double-lumen cannula in VV-DL mode
    this._va_return_site = null; // the VA return site, remembered while VV-DL forces return = drainage site

    // pump device library — real ECLS pumps with head-flow (H-Q) coefficients (centrifugal) or
    // positive-displacement parameters (roller). Coefficients are calibrated so each pump reaches its
    // rated flow at its rated rpm against a physiologic circuit afterload, with a datasheet-like
    // deadhead (Q=0) pressure at max_rpm. `prime` is the priming volume (L). Selecting `pump_type`
    // copies these into the active fields above and sets `pump_mode` from `type`.
    // H-Q coefficients (head = hq_a*(rpm/1000)^2 - hq_b*(rpm/1000)*Q mmHg, Q in L/min; hq_c=0) fit to
    // published pump characteristics: per-pump deadhead (Q=0) scaled as rpm^2 fixes hq_a, and the rated
    // flow at max rpm fixes the Euler-slip falloff hq_b. Notably the Rotaflow deadhead is consistent
    // across two independent data points (~108 mmHg @2000 rpm shut-off, ~700 mmHg @5000 rpm) giving
    // hq_a≈28. The linear (N·Q) falloff keeps a finite slope at low flow (afterload sensitivity) rather
    // than the flat low-flow curve a pure Q^2 term would give. See docs/BloodPump.md for the table/sources.
    this.pumps = {
      "Abbott PediMag": { // pediatric mag-lev centrifugal, ~1.5 L/min max, 14 mL prime
        // No H-Q curve is published. Deadhead ~640 mmHg @5500 rpm: the published 540 mmHg "max outflow
        // pressure" is read as a rated limit, as the CentriMag manual's 600 turned out to be (measured
        // deadhead 710, ratio 1.18). Curve shape = the CentriMag fit scaled to the PediMag's head
        // (x0.91) and flow range (1.5/10 L/min): flat at neonatal flows, as mag-lev pumps are. With
        // the calibrated circuit this gives ~0.55 L/min at 2800 rpm on VA (term neonate, 12/10 Fr).
        type: "centrifugal", max_rpm: 5500, prime: 0.014,
        hq_a: 21.16, hq_b: 5.2, hq_c: 15.4,
      },
      "Abbott CentriMag": { // adult mag-lev centrifugal, 0-5500 rpm, 0-10 L/min, 31 mL prime
        // least-squares fit (rms 4.8 mmHg) to the manufacturer H-Q curves (CentriMag Operation
        // Manual PL-0047 Rev 11, Fig. 14, pump only): deadhead ~95 mmHg @2000 to ~710 @5500 rpm, and
        // nearly flat with flow. (The "600 mmHg max pressure head" is a rated limit, not the deadhead.)
        type: "centrifugal", max_rpm: 5500, prime: 0.031,
        hq_a: 23.17, hq_b: 0.85, hq_c: 0.38,
      },
      "Getinge Rotaflow RF-32": { // adult centrifugal, ~10 L/min, 32 mL prime; deadhead ~700 mmHg @5000
        type: "centrifugal", max_rpm: 5000, prime: 0.032,
        hq_a: 28.0, hq_b: 13.0, hq_c: 0.0,
      },
      "Medtronic Bio-Pump BP-50": { // neonatal centrifugal cone, lower rpm range, 48 mL prime
        type: "centrifugal", max_rpm: 3000, prime: 0.048,
        hq_a: 20.0, hq_b: 28.9, hq_c: 0.0,
      },
      "Generic roller pump": { // positive-displacement, near-constant flow vs afterload
        type: "roller", max_rpm: 250, prime: 0.030,
        ml_per_rev: 1.5, roller_kp: 30.0, roller_drive_max: 900.0,
      },
    };
    this.pump_type = "Abbott PediMag"; // selects the pump; copies its coefficients / mode below

    // oxygenator device library — real membrane oxygenators with their rated blood flow (L/min),
    // membrane surface area (m^2), priming volume (L) and O2/CO2 transfer ceilings (mmol/s). o2_cap is
    // anchored to the Quadrox-i Neonatal datasheet (~90 mL O2/min ≈ 0.067 mmol/s at 1.5 L/min) and
    // scaled by rated flow for the larger devices; co2_cap likewise (~73 mL CO2/min ≈ 0.054 mmol/s).
    // dp_a is the blood-side pressure drop per flow (mmHg per L/min, in blood; hollow-fibre bundles are
    // laminar, so linear): Quadrox-i Neonatal ~45 (~8 mmHg @0.2 and ~65 @1.5 L/min; clinically 53 ± 15,
    // Perfusion 2013). The larger devices have no published figure at hand and are given the same
    // ~65 mmHg at their rated flow (dp_a = 65 / rated_flow).
    // Selecting `oxygenator_type` copies these into the active fields above (incl. oxy_res_for/back).
    this.oxygenators = {
      "Getinge Quadrox-i Neonatal": {
        surface_area: 0.38, rated_flow: 1.5, o2_cap: 0.067, co2_cap: 0.054, prime: 0.038, dp_a: 45.0,
      },
      "Getinge Quadrox-i Pediatric": {
        surface_area: 0.8, rated_flow: 2.8, o2_cap: 0.13, co2_cap: 0.10, prime: 0.081, dp_a: 23.2,
      },
      "Getinge Quadrox-i Small Adult": {
        surface_area: 1.3, rated_flow: 5.0, o2_cap: 0.22, co2_cap: 0.18, prime: 0.215, dp_a: 13.0,
      },
      "Medtronic Nautilus (Adult)": {
        surface_area: 1.8, rated_flow: 7.0, o2_cap: 0.31, co2_cap: 0.25, prime: 0.260, dp_a: 9.3,
      },
    };
    this.oxygenator_type = "Getinge Quadrox-i Neonatal"; // selects the oxygenator; copies caps below

    this.drainage_cannula_type = "Biomedicus venous 12 Fr";
    this.return_cannula_type = "Biomedicus arterial 10 Fr";

    if (this.drainage_cannulas[this.drainage_cannula_type]) {
      const selectedDrainageCannula = this.drainage_cannulas[this.drainage_cannula_type];
      this.drainage_cannula_diameter = selectedDrainageCannula.inner_diameter;
      this.drainage_cannula_length = selectedDrainageCannula.length;
    }
    if (this.return_cannulas[this.return_cannula_type]) {
      const selectedReturnCannula = this.return_cannulas[this.return_cannula_type];
      this.return_cannula_diameter = selectedReturnCannula.inner_diameter;
      this.return_cannula_length = selectedReturnCannula.length;
    }

    // apply the initially selected pump (copies H-Q / roller coefficients and sets pump_mode)
    this._prev_pump_type = "";
    this._apply_pump_selection();

    // apply the initially selected oxygenator (copies the membrane transfer ceilings)
    this._prev_oxygenator_type = "";
    this._apply_oxygenator_selection();

    // -----------------------------------------------
    // initialize dependent parameters
    this.p_ven = 0.0; // filtered venous pressure (mmHg)
    this.p_int = 0.0; // filtered pressure at the interface between the drainage cannula and the tubing (mmHg)
    this.p_art = 0.0; // filtered arterial pressure (mmHg)
    this.p_hydrostatic = 0.0; // hydrostatic offset added to the measured circuit pressures (mmHg)
    this.flow = 0.0; // blood flow through the ECLS circuit (L/s)
    this.flow_avg = 0.0; // moving average of the blood flow through the ECLS circuit (L/s)
    this.sat_ven_o2 = 0.0; // venous oxygen saturation (%)
    this.sat_postoxy_o2 = 0.0; // post-oxygenator oxygen saturation (%)
    this.pco2_postoxy = 0.0; // post-oxygenator pCO2 (mmHg)
    // circuit resistances, re-derived every update (any scenario value is overwritten):
    this.tubing_in_res = 0.0; // Poiseuille resistance of the inflow tubing, from its geometry (mmHg/(L/s))
    this.tubing_in_vol = 0.1; // volume of the tubing in (L)
    this.tubing_out_res = 0.0; // Poiseuille resistance of the outflow tubing, from its geometry (mmHg/(L/s))
    this.tubing_out_vol = 0.1; // volume of the tubing out (L)
    this.drainage_res = 0.0; // drainage cannula/lumen resistance at the current flow, in blood (mmHg/(L/s))
    this.return_res = 0.0; // return cannula/lumen resistance at the current flow, in blood (mmHg/(L/s))
    this.drainage_dp = 0.0; // pressure drop over the drainage cannula/lumen at the current flow (mmHg)
    this.return_dp = 0.0; // pressure drop over the return cannula/lumen at the current flow (mmHg)

    // -----------------------------------------------
    // local parameters
    this.prev_fio2 = 0.0; // previous fio2 value to detect changes in fio2
    this.prev_fico2 = 0.0; // previous fico2 value to detect changes in fico2
    this.prev_gas_flow = 0.0; // previous gas flow value to detect changes in gas flow
    this.pressure_avg_window = 400; // number of samples used for real-time pressure moving averages
    this.flow_avg_window = 400; // number of samples used for the real-time flow moving average (~0.9 s at 0.015 s updates)
    this._update_interval = 0.015; // update interval of the placenta model (s)
    this._update_counter = 0.0; // counter of the update interval (s)
    this._blood_comp_interval = 1.0; // low-frequency blood composition update interval (s)
    this._blood_comp_counter = 0.0; // counter for low-frequency blood composition updates (s)
    this._flow_avg_calculator = new RealTimeMovingAverage(this.flow_avg_window);
    this._p_ven_avg_calculator = new RealTimeMovingAverage(this.pressure_avg_window);
    this._p_int_avg_calculator = new RealTimeMovingAverage(this.pressure_avg_window);
    this._p_art_avg_calculator = new RealTimeMovingAverage(this.pressure_avg_window);
    this._pump_flow_ema = 0.0; // short-EMA of circuit flow (L/min): the H-Q / roller controller input
    this._pump_flow_ema_tc = 0.3; // time constant (s) for that EMA — tracks flow but damps the feedback loop
    this._roller_drive = 0.0; // integral-controller drive pressure (mmHg) for roller mode


    this._ecls_drainage = null; // reference to the drainage model instance
    this._ecls_tubing_in = null; // reference to the tubing in model instance
    this._ecls_pump = null; // reference to the pump model instance
    this._ecls_oxy = null; // reference to the oxygenator model instance
    this._ecls_tubing_out = null; // reference to the tubing out model instance
    this._ecls_return = null; // reference to the return model instance
    this._ecls_gas_source = null; // reference to the gas source model instance
    this._ecls_gas_oxy = null; // reference to the gas oxygenator model instance
    this._ecls_gas_out = null; // reference to the gas out model instance
    this._ecls_gas_insp_valve = null; // reference to the gas inspiration valve model instance
    this._ecls_gas_exp_valve = null; // reference to the gas expiration valve model instance
    this._ecls_gasex = null; // reference to the gas exchanger model instance (ECLS_GASEX)

    // heater-cooler bookkeeping: ECLS_OXY's own perfusion time constant, captured once before the
    // heater-cooler overrides it with the fast device tc, so it can be restored when released. null
    // means "not currently overriding" (nothing to restore).
    this._blood_temp_tc_restore = null;
  }

  // after the base assigns the scenario JSON (which may set pump_type) and instantiates the ECLS_*
  // sub-models, re-apply the pump selection so the active H-Q / roller coefficients and pump_mode
  // match the loaded pump from build time — not only once the running update loop notices the change.
  init_model(args = {}) {
    super.init_model(args);
    this._apply_pump_selection();
    this._apply_oxygenator_selection();
  }

  // copy the selected oxygenator's characteristics into the active fields. Cheap and idempotent;
  // re-run when oxygenator_type changes so a scenario/UI switch takes effect.
  _apply_oxygenator_selection() {
    const o = this.oxygenators[this.oxygenator_type];
    if (!o) return;
    this.oxy_o2_cap = o.o2_cap ?? this.oxy_o2_cap;
    this.oxy_co2_cap = o.co2_cap ?? this.oxy_co2_cap;
    this.oxy_surface_area = o.surface_area ?? this.oxy_surface_area;
    this.oxy_rated_flow = o.rated_flow ?? this.oxy_rated_flow;
    if (o.dp_a !== undefined) {
      this.oxy_res_for = o.dp_a * 60.0; // mmHg per L/min -> mmHg/(L/s)
      this.oxy_res_back = o.dp_a * 60.0;
    }
    this._prev_oxygenator_type = this.oxygenator_type;
  }

  // copy the selected pump's characteristics into the active fields and set pump_mode from its type.
  // Cheap and idempotent; re-run when pump_type changes so a scenario/UI switch takes effect.
  _apply_pump_selection() {
    const p = this.pumps[this.pump_type];
    if (!p) return;
    this.pump_mode = p.type === "roller" ? 1 : 0;
    this.pump_max_rpm = p.max_rpm ?? this.pump_max_rpm;
    if (p.type === "roller") {
      this.roller_ml_per_rev = p.ml_per_rev ?? this.roller_ml_per_rev;
      this.roller_kp = p.roller_kp ?? this.roller_kp;
      this.roller_drive_max = p.roller_drive_max ?? this.roller_drive_max;
    } else {
      this.pump_hq_a = p.hq_a ?? this.pump_hq_a;
      this.pump_hq_b = p.hq_b ?? this.pump_hq_b;
      this.pump_hq_c = p.hq_c ?? this.pump_hq_c;
    }
    this._prev_pump_type = this.pump_type;
  }

  // restore ECLS_OXY's perfusion time constant to its pre-override value and hand thermal control
  // back to Thermoregulation. Safe to call when no override is active (restore field is null).
  _release_heater_cooler() {
    if (!this._ecls_oxy) return;
    this._ecls_oxy.temp_ext_override = false;
    if (this._blood_temp_tc_restore !== null) {
      this._ecls_oxy.blood_temp_tc = this._blood_temp_tc_restore;
      this._blood_temp_tc_restore = null;
    }
  }

  // (re)resolve the circuit sub-model references from the engine model map
  _resolve_refs() {
    const models = this._model_engine.models;
    this._ecls_drainage = models["ECLS_DRAINAGE"];
    this._ecls_tubing_in = models["ECLS_TUBING_IN"];
    this._ecls_pump = models["ECLS_PUMP"];
    this._ecls_oxy = models["ECLS_OXY"];
    this._ecls_tubing_out = models["ECLS_TUBING_OUT"];
    this._ecls_return = models["ECLS_RETURN"];
    this._ecls_gas_source = models["ECLS_GAS_SOURCE"];
    this._ecls_gas_oxy = models["ECLS_GAS_OXY"];
    this._ecls_gas_out = models["ECLS_GAS_OUT"];
    this._ecls_gas_insp_valve = models["ECLS_GAS_INSP_VALVE"];
    this._ecls_gas_exp_valve = models["ECLS_GAS_EXP_VALVE"];
    this._ecls_gasex = models["ECLS_GASEX"];
  }

  // VV-DL: one double-lumen cannula, so both lumens sit in the drainage site. Remember the VA return
  // site while forcing it, and restore it on the way back to VA. Runs whether or not ECLS is running
  // so the sites (and the diagram that follows them) are right before the pump starts.
  _apply_cannulation() {
    if (this.cannulation === "VV-DL") {
      if (this._va_return_site === null && this.return_site !== this.drainage_site) {
        this._va_return_site = this.return_site;
      }
      this.return_site = this.drainage_site;
    } else if (this._va_return_site !== null) {
      this.return_site = this._va_return_site;
      this._va_return_site = null;
    }
  }

  calc_model() {
    this._apply_cannulation();

    if (!this.ecls_running) {
      this.flow = 0.0;
      this.flow_avg = 0.0;
      this.p_ven = 0.0;
      this.p_int = 0.0;
      this.p_art = 0.0;
      this._flow_avg_calculator.reset();
      this._p_ven_avg_calculator.reset();
      this._p_int_avg_calculator.reset();
      this._p_art_avg_calculator.reset();
      this._blood_comp_counter = 0.0;
      this._pump_flow_ema = 0.0; // clear the pump-control state so a restart begins from rest
      this._roller_drive = 0.0;

      // disable the circuit sub-models so a stopped ECLS no longer conducts. Resolve the refs here
      // too: scenarios ship the sub-models enabled, and a circuit that has never run would otherwise
      // keep them enabled (only their JSON no_flow kept it inert).
      if (!this._ecls_drainage) this._resolve_refs();
      [this._ecls_drainage, this._ecls_tubing_in, this._ecls_pump, this._ecls_oxy,
       this._ecls_tubing_out, this._ecls_return, this._ecls_gas_source, this._ecls_gas_oxy,
       this._ecls_gas_out, this._ecls_gas_insp_valve, this._ecls_gas_exp_valve,
       this._ecls_gasex].forEach((m) => {
        if (m) m.is_enabled = false;
      });
      // a disabled Resistor never runs calc_flow, so its last flow would linger — zero the circuit's
      // resistors (incl. the three owned by the ECLS BloodVessels) so readers see a stopped circuit
      for (const name of ECLS_RESISTORS) {
        const r = this._model_engine.models[name];
        if (r) r.flow = 0.0;
      }
      // release the heater-cooler so a stopped circuit leaves ECLS_OXY as a neutral blood
      // compartment (Thermoregulation resumes warming it toward core), restoring its original tc
      this._release_heater_cooler();
      return;
    }

    // blood-side heater-cooler: while active, take over the oxygenator blood compartment's thermal
    // target so it heads toward blood_temp instead of core. temp_ext_override tells Thermoregulation
    // and Blood not to reset it to core. When inactive, release it back to core-warmed behaviour.
    // (_ecls_oxy is resolved on the first update below; guard the pre-first-update steps.)
    if (this._ecls_oxy) {
      if (this.blood_temp_active) {
        // capture the compartment's own tc once, before we override it, so release can restore it
        if (this._blood_temp_tc_restore === null) {
          this._blood_temp_tc_restore = this._ecls_oxy.blood_temp_tc;
        }
        this._ecls_oxy.temp_ext_override = true;
        this._ecls_oxy.body_temp = this.blood_temp;
        this._ecls_oxy.blood_temp_tc = this.blood_temp_tc;
      } else if (this._ecls_oxy.temp_ext_override) {
        // heater-cooler turned off while ECLS keeps running: restore the original tc and hand back
        this._release_heater_cooler();
      }
    }

    this._blood_comp_counter += this._t;
    this._update_counter += this._t;
    if (this._update_counter > this._update_interval) {
        this._update_counter = 0.0;

        const newWindow = Math.max(1, Math.trunc(this.flow_avg_window));
        if (newWindow !== this._flow_avg_calculator.windowSize) {
          this._flow_avg_calculator = new RealTimeMovingAverage(newWindow);
        }

        const newPressureWindow = Math.max(1, Math.trunc(this.pressure_avg_window));
        if (newPressureWindow !== this._p_ven_avg_calculator.windowSize) {
          this._p_ven_avg_calculator = new RealTimeMovingAverage(newPressureWindow);
          this._p_int_avg_calculator = new RealTimeMovingAverage(newPressureWindow);
          this._p_art_avg_calculator = new RealTimeMovingAverage(newPressureWindow);
        }

        // get a reference to the associated models
        this._resolve_refs();

        // skip this tick if the circuit wiring is incomplete (any sub-model missing) rather than
        // dereferencing undefined below
        if (!this._ecls_drainage || !this._ecls_tubing_in || !this._ecls_pump || !this._ecls_oxy ||
            !this._ecls_tubing_out || !this._ecls_return || !this._ecls_gas_source ||
            !this._ecls_gas_oxy || !this._ecls_gas_out || !this._ecls_gas_insp_valve ||
            !this._ecls_gasex) {
          return;
        }

        // set the drainage and return sites (VV-DL has already forced return = drainage site)
        this._ecls_drainage.comp_from = this.drainage_site;
        this._ecls_return.comp_to = this.return_site;

        // cannula pressure-drop fits: both lumens of the double-lumen cannula in VV-DL, else the two
        // separately chosen cannulas
        let drainage_fit = null;
        let return_fit = null;
        if (this.cannulation === "VV-DL") {
          const dl = this.dl_cannulas[this.dl_cannula_type];
          if (dl) {
            drainage_fit = dl.drainage;
            return_fit = dl.return;
          }
        } else {
          const selectedDrainageCannula = this.drainage_cannulas[this.drainage_cannula_type];
          if (selectedDrainageCannula) {
            drainage_fit = selectedDrainageCannula;
            this.drainage_cannula_diameter = selectedDrainageCannula.inner_diameter;
            this.drainage_cannula_length = selectedDrainageCannula.length;
          }
          const selectedReturnCannula = this.return_cannulas[this.return_cannula_type];
          if (selectedReturnCannula) {
            return_fit = selectedReturnCannula;
            this.return_cannula_diameter = selectedReturnCannula.inner_diameter;
            this.return_cannula_length = selectedReturnCannula.length;
          }
        }

        // cannula resistances at the current circuit flow (chord of the nonlinear dP-Q curve, updated
        // every tick from the pump's flow EMA, which damps the feedback). Unknown selection: keep the
        // previous value.
        const q_circuit = this._pump_flow_ema;
        if (drainage_fit) this.drainage_res = cannula_resistance(drainage_fit, q_circuit);
        if (return_fit) this.return_res = cannula_resistance(return_fit, q_circuit);
        this.drainage_dp = this.drainage_res * this.drainage_res_factor * q_circuit / 60.0;
        this.return_dp = this.return_res * this.return_res_factor * q_circuit / 60.0;

        // tubing resistances from the tubing geometry (laminar flow of blood)
        this.tubing_in_res = poiseuille_resistance(this.tubing_in_diameter, this.tubing_in_length);
        this.tubing_out_res = poiseuille_resistance(this.tubing_out_diameter, this.tubing_out_length);

        // re-apply the pump library entry if the selection changed (scenario/UI switch)
        if (this.pump_type !== this._prev_pump_type) {
          this._apply_pump_selection();
        }
        // re-apply the oxygenator library entry if the selection changed
        if (this.oxygenator_type !== this._prev_oxygenator_type) {
          this._apply_oxygenator_selection();
        }

        // make sure all the associated models are in the same enabled/disabled state as the placenta model
        this._ecls_drainage.is_enabled = this.ecls_running;
        this._ecls_tubing_in.is_enabled = this.ecls_running;
        this._ecls_pump.is_enabled = this.ecls_running;
        this._ecls_oxy.is_enabled = this.ecls_running;
        this._ecls_tubing_out.is_enabled = this.ecls_running;
        this._ecls_return.is_enabled = this.ecls_running;
        this._ecls_gas_source.is_enabled = this.ecls_running;
        this._ecls_gas_oxy.is_enabled = this.ecls_running;
        this._ecls_gas_out.is_enabled = this.ecls_running;
        this._ecls_gas_insp_valve.is_enabled = this.ecls_running;
        // manage the expiratory valve symmetrically with the inspiratory one (it is a nested
        // component of ECLS_GAS_OXY and was previously left on its static JSON state). Block reverse
        // flow so the fixed-pressure ECLS_GAS_OUT reservoir cannot back-fill the oxygenator gas side.
        if (this._ecls_gas_exp_valve) {
          this._ecls_gas_exp_valve.is_enabled = this.ecls_running;
          this._ecls_gas_exp_valve.no_back_flow = true;
        }
        this._ecls_gasex.is_enabled = this.ecls_running;

        // clamp umbilical vessels if set to clamped
        this._ecls_drainage.no_flow = this.ecls_clamped;
        this._ecls_tubing_in.no_flow = this.ecls_clamped;
        this._ecls_pump.no_flow = this.ecls_clamped;
        this._ecls_oxy.no_flow = this.ecls_clamped;
        this._ecls_tubing_out.no_flow = this.ecls_clamped;
        this._ecls_return.no_flow = this.ecls_clamped;
        this._ecls_gasex.is_enabled = !this.ecls_clamped;

        // set the resistances of the associated models
        this._ecls_drainage.r_for = this.drainage_res * this.drainage_res_factor; // drainage cannula resistance
        this._ecls_drainage.r_back = this.drainage_res * this.drainage_res_factor; // drainage cannula resistance
        // NB: ECLS_TUBING_IN is a BloodCapacitance (pure compliance, owns no resistor). The inflow
        // tubing's resistance therefore rides on the pump's own inlet resistor (ECLS_PUMP owns the
        // TUBING_IN->PUMP connector), in series with the pump's internal resistance.
        const tubing_in_r = this.tubing_in_res * this.tubing_res_factor;
        this._ecls_pump.r_for = this.pump_res_for * this.pump_res_factor + tubing_in_r; // pump + inflow tubing
        this._ecls_pump.r_back = this.pump_res_back * this.pump_res_factor + tubing_in_r;
        this._ecls_oxy.r_for = this.oxy_res_for * this.oxy_res_factor; // set the oxygenator resistance to a medium value to simulate the oxygenator resistance
        this._ecls_oxy.r_back = this.oxy_res_back * this.oxy_res_factor; // set the oxygenator resistance to a medium value to simulate the oxygenator resistance
        this._ecls_tubing_out.r_for = this.tubing_out_res * this.tubing_res_factor; // set the tubing resistance to a low value to simulate the tubing resistance
        this._ecls_tubing_out.r_back = this.tubing_out_res * this.tubing_res_factor; // set the tubing resistance to a low value to simulate the tubing resistance
        this._ecls_return.r_for = this.return_res * this.return_res_factor; // set the return resistance to a high value to simulate the umbilical vein resistance
        this._ecls_return.r_back = this.return_res * this.return_res_factor; // set the return resistance to a high value to simulate the umbilical vein resistance

        // update the gas composition in the gas source model if fio2 or fico2 has changed
        if (this.prev_fio2 !== this.gas_fio2 || this.prev_fico2 !== this.gas_fico2) {
          calc_gas_composition(this._ecls_gas_source, this.gas_fio2, this.gas_temp, this.gas_humidity, this.gas_fico2);
          this.prev_fio2 = this.gas_fio2;
          this.prev_fico2 = this.gas_fico2;
        }

        // size the inspiratory valve so the sweep-gas flow tracks the gas_flow set-point. The gas line
        // GAS_SOURCE -[R_insp]-> GAS_OXY -[R_exp]-> GAS_OUT has both ends held at fixed pressure, so in
        // steady state Q = dP / (R_insp + R_exp)  =>  R_insp = dP / Q - R_exp. Recomputed every update
        // (cheap, robust to any pressure change) and reading the actual expiratory-valve resistance
        // rather than the previous hard-coded 50. Reproduces the calibrated 23950 at gas_flow 0.5.
        if (this.gas_flow > 0.0) {
          const dP = this._ecls_gas_source.pres - this._ecls_gas_out.pres;
          const q = this.gas_flow / 60.0; // requested sweep flow L/min -> L/s
          const r_exp = this._ecls_gas_exp_valve ? this._ecls_gas_exp_valve.r_for : 0.0;
          this._ecls_gas_insp_valve.r_for = Math.max(dP / q - r_exp, 1.0); // keep strictly positive
          this._ecls_gas_insp_valve.no_flow = false;
        } else {
          // gas_flow <= 0: shut the sweep gas off cleanly instead of dividing by zero
          this._ecls_gas_insp_valve.no_flow = true;
        }
        this.prev_gas_flow = this.gas_flow;

        // update the gasexchanger diffusion constants and membrane transfer ceilings (rated-flow limit)
        this._ecls_gasex.dif_o2 = this.dif_o2;
        this._ecls_gasex.dif_co2 = this.dif_co2;
        this._ecls_gasex.o2_cap = this.oxy_o2_cap;
        this._ecls_gasex.co2_cap = this.oxy_co2_cap;

        // --- pump drive: head-flow (H-Q) characteristic ---
        // Flow input is a short EMA of the circuit flow (L/min); lagged feedback keeps the operating
        // point stable without the 6 s display flow_avg's sluggishness.
        const q_lmin = this._ecls_return.flow * 60.0;
        const ema_frac = this._pump_flow_ema_tc > 0.0
          ? Math.min(1.0, this._update_interval / this._pump_flow_ema_tc) : 1.0;
        this._pump_flow_ema += (q_lmin - this._pump_flow_ema) * ema_frac;
        const q = Math.max(0.0, this._pump_flow_ema);

        if (this.pump_mode === 0) {
          // centrifugal: rotodynamic head = hq_a*krpm^2 − hq_b*krpm*Q − hq_c*Q^2 (mmHg). Head falls as
          // flow rises, so the operating point is afterload/preload sensitive. Clamped ≥ 0 — the pump
          // cannot generate reverse head.
          const krpm = this.pump_rpm / 1000.0;
          const head = this.pump_hq_a * krpm * krpm - this.pump_hq_b * krpm * q - this.pump_hq_c * q * q;
          this.pump_pressure = -Math.max(head, 0.0);
          this._roller_drive = 0.0; // keep the roller integrator clear while in centrifugal mode
        } else {
          // roller: positive-displacement flow source. An integral controller trims the drive pressure
          // so circuit flow tracks Q_target = roller_ml_per_rev*rpm/1000, making flow (nearly)
          // independent of afterload. Clamped to [0, roller_drive_max].
          const q_target = this.roller_ml_per_rev * this.pump_rpm / 1000.0;
          this._roller_drive += this.roller_kp * (q_target - q);
          this._roller_drive = Math.min(Math.max(this._roller_drive, 0.0), this.roller_drive_max);
          this.pump_pressure = -this._roller_drive;
        }
        this._ecls_pump.pump_rpm = this.pump_rpm;

        // Apply the drive to the driven vessel's DOWNSTREAM node (p2_ext) and zero the other vessel, so
        // a runtime pump_mode switch cannot leave a stale drive applied (the BloodVessel never
        // self-resets p1_ext/p2_ext; only its owned resistor does, each step). Centrifugal drives the
        // pump; roller drives the oxygenator (mirroring the pump case) — driving ECLS_OXY.p1_ext instead
        // would lower the upstream node and push the circuit backward.
        if (this.pump_mode === 0) {
          this._ecls_pump.p1_ext = 0.0;
          this._ecls_pump.p2_ext = this.pump_pressure;
          this._ecls_oxy.p1_ext = 0.0;
          this._ecls_oxy.p2_ext = 0.0;
        } else {
          this._ecls_oxy.p1_ext = 0.0;
          this._ecls_oxy.p2_ext = this.pump_pressure;
          this._ecls_pump.p1_ext = 0.0;
          this._ecls_pump.p2_ext = 0.0;
        }

        // get the measured pressures and flow from the associated models
        // as the transducers at pump level read them: the line pressure plus the blood column between
        // the patient and the pump (pump_height). The compartments themselves stay at patient level.
        this.p_hydrostatic = hydrostatic_offset(this.pump_height);
        const p_ven_raw = this._ecls_tubing_in.pres + this.p_hydrostatic; // pressure at inlet of drainage cannula
        const p_int_raw = this._ecls_pump.pres + this.p_hydrostatic; // pressure at pump interface
        const p_art_raw = this._ecls_tubing_out.pres + this.p_hydrostatic; // pressure at outlet of return cannula
        this.p_ven = this._p_ven_avg_calculator.addValue(p_ven_raw);
        this.p_int = this._p_int_avg_calculator.addValue(p_int_raw);
        this.p_art = this._p_art_avg_calculator.addValue(p_art_raw);
        this.flow = this._ecls_return.flow * 60.0; // blood flow through the ECLS circuit is the flow through the drainage cannula
        this.flow_avg = this._flow_avg_calculator.addValue(this.flow);

        if (this._blood_comp_counter >= this._blood_comp_interval) {
          this._blood_comp_counter -= this._blood_comp_interval;
          // Venous (pre-oxygenator) read-out from the drainage tubing; post-oxygenator read-outs from
          // ECLS_OXY itself — the actual membrane blood compartment — not ECLS_TUBING_OUT, which sits
          // one compartment downstream and lags the true oxygenator outlet by its advective mixing.
          calc_blood_composition(this._ecls_tubing_in);
          calc_blood_composition(this._ecls_oxy);
          this.sat_ven_o2 = this._ecls_tubing_in.so2;
          this.sat_postoxy_o2 = this._ecls_oxy.so2;
          this.pco2_postoxy = this._ecls_oxy.pco2;
        }
      }
  }
}
