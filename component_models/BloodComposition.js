
// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const kw              = 2.5119e-11; // water dissociation constant
const kc              = 7.94328235e-4; // carbonic acid dissociation constant
const kd              = 6.0255959e-8; // bicarbonate dissociation constant
const alpha_co2p      = 0.03067; // CO2 solubility coefficient
const left_hp_wide    = 5.848931925e-6; // lower bound for H⁺ concentration
const right_hp_wide   = 3.16227766017e-4; // upper bound for H⁺ concentration
const delta_ph_limits = 0.1; // delta for pH limits
const n               = 2.7; // Hill coefficient
const alpha_o2        = 1.38e-5; // O2 solubility coefficient
const left_o2_wide    = 0; // lower bound for pO2
const right_o2_wide   = 800.0; // upper bound for pO2
const delta_o2_limits = 10.0; // delta for pO2 limits
const brent_accuracy  = 1e-6;
const max_iterations  = 60;
const gas_constant    = 62.36367;
const DEFAULT_HALDANE_COEFF = 1.0; // default Haldane coefficient (0 = effect off); calibrate per scenario

// -----------------------------------------------------------------------------
// Independent variables
// -----------------------------------------------------------------------------

let P50_0 = 20.0; // PO2 at which 50% of Hgb is saturated by O2 (fetal = 18.8 (high Hb O2 affinity), neonatal = 20.0, adult = 26.7)
let P50 = 0;
let log10_p50 = 0;
let P50_n = 0;
let left_o2 = 0; // lower bound for pO2
let right_o2 = 800.0; // upper bound for pO2
let left_hp = 5.848931925e-6; // lower bound for H⁺ concentration
let right_hp = 3.16227766017e-4; // upper bound for H⁺ concentration

// -----------------------------------------------------------------------------
// State variables
// -----------------------------------------------------------------------------
let ph = 0.0;
let po2 = 0.0;
let so2 = 0.0;
let pco2 = 0.0;
let hco3 = 0.0;
let be = 0.0;
let to2 = 0.0;
let hemoglobin = 0.0;
let dpg = 5.0;
let temp = 0.0;
let tco2 = 0.0;
let sid = 0.0;
let albumin = 0.0;
let phosphates = 0.0;
let uma = 0.0;
let prev_ph = 7.37; // previous pH value, used to set the limits for H⁺ concentration
let prev_po2 = 18.7; // previous pO2 value, used to set the limits for pO2
let dpH = 0;             //Bohr effect: ↓pH → right shift → ↑P₅₀)
let dpCO2 = 0;       // CO₂-Bohr effect: ↑pCO2 → right shift → ↑P₅₀
let dT = 0;          // ↑T → right shift → ↑P₅₀
let dDPG = 0;          // ↑DPG → right shift → ↑P₅₀
let hemoglobin_gdl = 0.0;
let inv_mmol_to_ml = 0.0;
let haldane_coeff = 0.0; // Haldane effect: ↓SO₂ → ↑CO₂-carrying capacity → ↓pCO2 at given tCO2
let so2_prev = 0.98;     // SO₂ fraction from previous calculation (breaks the O₂↔CO₂ coupling)




export function calc_blood_composition(bc) {
    const sol = bc.solutes || {};
    const step_stamp = bc?._model_engine?.model_time_total;

    if (
      bc._bc_cache_initialized &&
      bc._bc_prev_tco2 === bc.tco2 &&
      bc._bc_prev_to2 === bc.to2 &&
      bc._bc_prev_temp === bc.temp &&
      bc._bc_prev_prev_ph === (bc.prev_ph || 7.37) &&
      bc._bc_prev_prev_po2 === (bc.prev_po2 || 18.7) &&
      bc._bc_prev_na === sol["na"] &&
      bc._bc_prev_k === sol["k"] &&
      bc._bc_prev_ca === sol["ca"] &&
      bc._bc_prev_mg === sol["mg"] &&
      bc._bc_prev_cl === sol["cl"] &&
      bc._bc_prev_lact === sol["lact"] &&
      bc._bc_prev_albumin === sol["albumin"] &&
      bc._bc_prev_phosphates === sol["phosphates"] &&
      bc._bc_prev_uma === sol["uma"] &&
      bc._bc_prev_hemoglobin === sol["hemoglobin"] &&
      (step_stamp === undefined || bc._bc_prev_step_stamp === step_stamp)
    ) {
      return;
    }

    _calc_blood_composition_js(bc);

    bc._bc_prev_step_stamp = step_stamp;
    bc._bc_prev_tco2 = bc.tco2;
    bc._bc_prev_to2 = bc.to2;
    bc._bc_prev_temp = bc.temp;
    bc._bc_prev_prev_ph = bc.prev_ph || 7.37;
    bc._bc_prev_prev_po2 = bc.prev_po2 || 18.7;
    bc._bc_prev_na = sol["na"];
    bc._bc_prev_k = sol["k"];
    bc._bc_prev_ca = sol["ca"];
    bc._bc_prev_mg = sol["mg"];
    bc._bc_prev_cl = sol["cl"];
    bc._bc_prev_lact = sol["lact"];
    bc._bc_prev_albumin = sol["albumin"];
    bc._bc_prev_phosphates = sol["phosphates"];
    bc._bc_prev_uma = sol["uma"];
    bc._bc_prev_hemoglobin = sol["hemoglobin"];
    bc._bc_cache_initialized = true;
}

// These functions are the same as in the wasm module, but implemented in JavaScript
function _calc_blood_composition_js(bc) {
    let sol = bc.solutes;
    tco2 = bc.tco2;
    to2 = bc.to2;
    sid = sol["na"] + sol["k"] + 2 * sol["ca"] + 2 * sol["mg"] - sol["cl"] - sol["lact"];
    albumin = sol["albumin"];
    phosphates = sol["phosphates"];
    uma = sol["uma"];
    hemoglobin = sol["hemoglobin"];
    temp = bc.temp;
    prev_ph = bc.prev_ph || 7.37; // previous pH value, used to set the limits for H⁺ concentration
    prev_po2 = bc.prev_po2 || 18.7; // previous pO2 value, used to set the limits for pO2

    // Haldane effect inputs: SO₂-dependent CO₂ binding capacity.
    // Use the previous-step SO₂ (stored on bc.so2 in percent) to break the O₂↔CO₂ coupling.
    // At steady state so2_prev == so2, so the one-step lag vanishes.
    haldane_coeff = bc.haldane_coeff ?? DEFAULT_HALDANE_COEFF;
    so2_prev = bc.so2 > 0 ? bc.so2 / 100.0 : 0.98;

    hemoglobin_gdl = hemoglobin / 0.6206;
    inv_mmol_to_ml = 760.0 / (gas_constant * (273.15 + temp));

    // set the wide limits based
    left_hp = left_hp_wide; // lower bound for H⁺ concentration
    right_hp = right_hp_wide; // upper bound for H⁺ concentration

    // set the limits based on the previous calculations if available
    if (prev_ph > 0) {
        left_hp = Math.pow(10.0, -(prev_ph + delta_ph_limits)) * 1000.0;
        right_hp = Math.pow(10.0, -(prev_ph - delta_ph_limits)) * 1000.0;
    }

    let hp = _brent_root_finding(_net_charge_plasma, left_hp, right_hp, max_iterations, brent_accuracy);
    if (hp > 0) {
        be =(hco3 - 25.1 + (2.3 * hemoglobin + 7.7) * (ph - 7.4)) * (1.0 - 0.023 * hemoglobin);
        bc.ph = ph;
        bc.pco2 = pco2;
        bc.hco3 = hco3;
        bc.be = be;
    } else {
        //console.log('small limit ab root finding failed in:', bc.name)
        // If the root finding failed, we will use the wide limits
        left_hp = left_hp_wide; // wide lower bound for H⁺ concentration
        if (left_hp < 0) left_hp = 0; // ensure lower bound is not negative
        right_hp = right_hp_wide; // wide upper bound for H⁺ concentration
        hp = _brent_root_finding(_net_charge_plasma, left_hp, right_hp, max_iterations, brent_accuracy);
        if (hp > 0) {
            be =(hco3 - 25.1 + (2.3 * hemoglobin + 7.7) * (ph - 7.4)) * (1.0 - 0.023 * hemoglobin);
            bc.ph = ph;
            bc.pco2 = pco2;
            bc.hco3 = hco3;
            bc.be = be;
        } else {
          console.log('definitive ab root finding failed in:', bc.name)
        }
    }

    dpH = ph - 7.40;             //Bohr effect: ↓pH → right shift → ↑P₅₀)
    dpCO2 = pco2 - 40.0;         // carbamino-specific CO₂-Bohr effect (~0.0015/mmHg); pH-mediated part runs via the -0.48·dpH term
    dT = temp - 37.0;            // ↑T → right shift → ↑P₅₀
    dDPG = dpg - 5.0;            // ↑DPG → right shift → ↑P₅₀

    log10_p50 = Math.log10(P50_0) - 0.48 * dpH + 0.0015 * dpCO2 + 0.024 * dT + 0.051 * dDPG;
    P50 = Math.pow(10.0, log10_p50);
    P50_n = Math.pow(P50, n);

    // set dynamic limits off
    let dyn_limits_used_oxy = false;
    // set the wide o2 intervals
    left_o2 = left_o2_wide; // lower bound po2
    right_o2 = right_o2_wide; // upper bound po2
    // if we have a previous po2 we can use this for dynamic limiting
    if (prev_po2 > 0) {
        left_o2 = prev_po2 - delta_o2_limits;
        if (left_o2 < 0) left_o2 = 0; // ensure lower bound is not negative
        right_o2 = prev_po2 + delta_o2_limits;
        dyn_limits_used_oxy = true;
    }

    // calculate the po2 and so2 using the brent root finding procedure
    let po2 = _brent_root_finding(_do2_content, left_o2, right_o2, max_iterations, brent_accuracy);
    if (po2 > -1) {
        bc.po2 = po2;
        bc.so2 = so2 * 100.0;
        bc.prev_po2 = po2;
    } else {
      // console.log('small limit oxy root finding failed in:', bc.name)
      if (dyn_limits_used_oxy) {
        // now try again with the wide limits
        left_o2 = left_o2_wide; // lower bound po2
        right_o2 = right_o2_wide; // upper bound po2
        po2 = _brent_root_finding(_do2_content, left_o2, right_o2, max_iterations, brent_accuracy);
        if (po2 > -1) {
          bc.po2 = po2;
          bc.so2 = so2 * 100.0;
          bc.prev_po2 = po2;
        } else {
          console.log('definitive oxy root finding failed in:', bc.name)
        }
      }
    }
}

function _net_charge_plasma(hp_estimate) {
    ph = -Math.log10(hp_estimate / 1000.0);
    // Haldane effect: lower SO₂ raises the CO₂-carrying capacity, so an extra SO₂-dependent
    // term in the denominator lowers dissolved CO₂ (and pCO2/hco3) at a given tCO2.
    let cco2p = tco2 / (1.0 + kc/hp_estimate + (kc*kd)/(hp_estimate * hp_estimate) + haldane_coeff * (1.0 - so2_prev));
    hco3       = (kc * cco2p) / hp_estimate;
    let co3p = (kd * hco3) / hp_estimate;
    let ohp  = kw / hp_estimate;

    pco2 = cco2p / alpha_co2p;

    let a_base = albumin*(0.123*ph - 0.631) + phosphates*(0.309*ph - 0.469);

    return hp_estimate + sid - hco3 - 2.0*co3p - ohp - a_base - uma;
}

function _calc_so2(po2_estimate) {
    let po2_n = Math.pow(po2_estimate, n);
    let denom = po2_n + P50_n;
    return po2_n / denom;
}

function _do2_content(po2_estimate) {
  // calculate the saturation from the current po2 from the current po2 estimate
  so2 = _calc_so2(po2_estimate);

  // calculate the to2 from the current po2 estimate
  // INPUTS: po2 in mmHg, so2 in fraction, hemoglobin in mmol/l
  // convert the hemoglobin unit from mmol/l to g/dL  (/ 0.6206)
  // convert to output from ml O2/dL blood to ml O2/l blood (* 10.0)
  let to2_new_estimate = (0.0031 * po2_estimate + 1.36 * hemoglobin_gdl * so2) * 10.0;
  to2_new_estimate = to2_new_estimate * inv_mmol_to_ml;

  // calculate the difference between the real to2 and the to2 based on the new po2 estimate and return it to the brent root finding function
  let dto2 = to2 - to2_new_estimate;

  return dto2;
}

function _brent_root_finding(f, x0, x1, max_iter, tolerance) {
  let fx0 = f(x0);
  let fx1 = f(x1);

  if (fx0 * fx1 > 0) {
    return -1;
  }

  if (Math.abs(fx0) < Math.abs(fx1)) {
    const tx = x0;
    x0 = x1;
    x1 = tx;
    const tfx = fx0;
    fx0 = fx1;
    fx1 = tfx;
  }

  let x2 = x0,
    fx2 = fx0,
    d = 0,
    mflag = true,
    steps_taken = 0;

  while (steps_taken < max_iter) {
    if (Math.abs(fx0) < Math.abs(fx1)) {
      const tx = x0;
      x0 = x1;
      x1 = tx;
      const tfx = fx0;
      fx0 = fx1;
      fx1 = tfx;
    }

    let new_point;
    if (fx0 !== fx2 && fx1 !== fx2) {
      let L0 = (x0 * fx1 * fx2) / ((fx0 - fx1) * (fx0 - fx2));
      let L1 = (x1 * fx0 * fx2) / ((fx1 - fx0) * (fx1 - fx2));
      let L2 = (x2 * fx1 * fx0) / ((fx2 - fx0) * (fx2 - fx1));
      new_point = L0 + L1 + L2;
    } else {
      new_point = x1 - (fx1 * (x1 - x0)) / (fx1 - fx0);
    }

    if (
      new_point < (3 * x0 + x1) / 4 ||
      new_point > x1 ||
      (mflag && Math.abs(new_point - x1) >= Math.abs(x1 - x2) / 2) ||
      (!mflag && Math.abs(new_point - x1) >= Math.abs(x2 - d) / 2) ||
      (mflag && Math.abs(x1 - x2) < tolerance) ||
      (!mflag && Math.abs(x2 - d) < tolerance)
    ) {
      new_point = (x0 + x1) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    let fnew = f(new_point);
    d = x2;
    x2 = x1;

    if (fx0 * fnew < 0) {
      x1 = new_point;
      fx1 = fnew;
    } else {
      x0 = new_point;
      fx0 = fnew;
    }

    steps_taken += 1;

    if (Math.abs(fnew) < tolerance) {
      return new_point;
    }
  }

  return -1;
}
