import { TimeVaryingElastance } from "../base_models/TimeVaryingElastance";
import { mix_blood_in } from "../helpers/BloodMixing";

// This class represents a blood time-varying elastance model, which is a subclass of the TimeVaryingElastance class.
// This class adds functionality to handle blood-specific properties such as temperature, viscosity, solute and drug concentrations.
export class HeartChamber extends TimeVaryingElastance {
  // static properties
  static model_type = "HeartChamber";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties unique to a HeartChamber
    this.temp = 37.0; // blood temperature (dgs C)
    this.viscosity = 6.0; // blood viscosity (centipoise, cP = mPa·s)
    this.solutes = {}; // dictionary holding all solutes
    this.drugs = {}; // dictionary holding all drug concentrations
    this.ans_sens = 1.0; // sensitivity of this blood time varying elastance for autonomic control. 0.0 is no effect, 1.0 is full effect
    this.ans_activity = 1.0; // activiaty of the ans
    this.el_max_mob_factor = 1.0; // contractility factor from the myocardial oxygen balance model (Mob); 1.0 = no effect
    this.el_max_drug_factor = 1.0; // contractility (inotropy) factor from the Drugs PK/PD model; 1.0 = no effect
    this.el_min_drug_factor = 1.0; // lusitropy (diastolic relaxation) factor from the Drugs PK/PD model; <1.0 = better relaxation, 1.0 = no effect

    // load-induced contractility factors written by the HeartFunction model (1.0 = no effect, NOT reset each step)
    this.el_max_load_factor = 1.0; // acute, reversible contractility depression from high wall stress (afterload mismatch / over-dilation)
    this.el_max_remodel_factor = 1.0; // chronic remodeling change in contractility (maladaptive decline)
    this.el_k_remodel_factor = 1.0; // chronic remodeling change in diastolic stiffness (concentric stiffening)
    this.u_vol_remodel_factor = 1.0; // chronic remodeling change in unstressed volume (eccentric cavity dilation)

    // initialize dependent properties unique to a HeartChamber
    this.to2 = 0.0; // total oxygen concentration (mmol/l)
    this.tco2 = 0.0; // total carbon dioxide concentration (mmol/l)
    this.ph = -1.0; // ph (unitless)
    this.pco2 = -1.0; // pco2 (mmHg)
    this.po2 = -1.0; // po2 (mmHg)
    this.so2 = -1.0; // o2 saturation
    this.hco3 = -1.0; // bicarbonate concentration (mmol/l)
    this.be = -1.0; // base excess (mmol/l)
    this.el = 0.0;

    this.elmin_calc = 0.0
    this.elmax_calc = 0.9
  }
  // this method overrides the calc_elastances method of the 
  calc_elastances() {    
    // calculate the elastances and non-linear elastance incorporating the factors
    //  β-adrenergic receptors dominate in the myocardium
    
    // ans influences ANS diastolic function B1 receptor activation -> lusitropic effect
    this.el_min_eff = this.el_min
        + (this.el_min_factor - 1) * this.el_min
        + (this.el_min_factor_ps - 1) * this.el_min
        + (this.el_min_factor_scaling_ps - 1) * this.el_min
        + (this.el_min_drug_factor - 1) * this.el_min   // drug lusitropy (Drugs PK/PD): <1 lowers el_min = better relaxation
        - (this.ans_activity - 1) * this.el_min * this.ans_sens

    // ans influences ANS systolic function B1 receptor activation -> positive intropic effect
    this.el_max_eff = this.el_max
        + (this.el_max_factor - 1) * this.el_max
        + (this.el_max_factor_ps - 1) * this.el_max
        + (this.el_max_factor_scaling_ps - 1) * this.el_max
        + (this.el_max_mob_factor - 1) * this.el_max
        + (this.el_max_drug_factor - 1) * this.el_max    // drug inotropy (Drugs PK/PD model)
        + (this.el_max_load_factor - 1) * this.el_max    // acute load-induced contractility depression (HeartFunction)
        + (this.el_max_remodel_factor - 1) * this.el_max // chronic remodeling contractility change (HeartFunction)
        + (this.ans_activity - 1) * this.el_max * this.ans_sens

    this.el_k_eff = this.el_k
        + (this.el_k_factor - 1) * this.el_k
        + (this.el_k_factor_ps - 1) * this.el_k
        + (this.el_k_factor_scaling_ps - 1) * this.el_k
        + (this.el_k_remodel_factor - 1) * this.el_k     // chronic remodeling diastolic stiffening (HeartFunction)

    // make sure that el_max is not smaller than el_min
    if (this.el_max_eff < this.el_min_eff) {
      this.el_max_eff = this.el_min_eff;
    }

    // reset the non persistent factors
    this.el_min_factor = 1.0;
    this.el_max_factor = 1.0;
    this.el_k_factor = 1.0;
  }

  // override calc_volumes to incorporate the chronic eccentric-dilation remodeling factor (HeartFunction)
  calc_volumes() {
    this.u_vol_eff = this.u_vol
        + (this.u_vol_factor - 1) * this.u_vol
        + (this.u_vol_factor_ps - 1) * this.u_vol
        + (this.u_vol_factor_scaling_ps - 1) * this.u_vol
        + (this.u_vol_remodel_factor - 1) * this.u_vol; // chronic eccentric cavity dilation (HeartFunction)
    // the factor layers add up and can take the sum below zero; an unstressed volume can't be negative
    if (this.u_vol_eff < 0.0) this.u_vol_eff = 0.0;

    // reset the non persistent factors
    this.u_vol_factor = 1.0;
  }

  // the method overrides the 'volume_in' method of the TimeVaryingElastance class and
  // mixes the incoming blood composition (see helpers/BloodMixing.js)
  volume_in(dvol, comp_from) {
    // call the parent method from the TimeVaryingElastance class to update the volume
    super.volume_in(dvol, comp_from);

    // mix to2, tco2, solutes, drugs, temperature and viscosity by the incoming volume fraction
    mix_blood_in(this, dvol, comp_from);
  }
}
