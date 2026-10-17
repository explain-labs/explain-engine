// Shared unit conversions.

// Oxygen (and CO2) volumes in physiology are STPD: Hüfner's 1.36 mL O2/g Hb, the 0.0031 mL/dL/mmHg
// solubility and clinical VO2 (mL/kg/min) are all at 0 °C and 760 mmHg, where one mmol of ideal gas
// occupies 22.414 mL. Use this for every mL O2 ↔ mmol O2 conversion; it does not depend on the
// blood temperature.
export const O2_MMOL_PER_ML = 1.0 / 22.414;

// Ideal gas constant in L·mmHg/(mol·K).
export const GAS_CONSTANT = 62.36367;

// Saturation water vapour pressure (mmHg) at temperature temp (°C): exp(20.386 − 5132/T), 46.5 mmHg
// at 37 °C.
export function svp_h2o(temp) {
  return Math.exp(20.386 - 5132 / (temp + 273.15));
}
