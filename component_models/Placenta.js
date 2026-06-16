

import { BaseModelClass } from "../base_models/BaseModelClass.js";


export class Placenta extends BaseModelClass {
  // static properties
  static model_type = "Placenta";

  /*
    The Placenta class models the placental circulation and gas exchange using core models of the Explain model.
    The umbilical arteries and veins are modeled by BloodResistors connected to the descending aorta (DA) and
    inferior vena cava (IVCI). The fetal (PLF) and maternal placenta (PLM) are modeled by two BloodCapacitances.
    A BloodDiffusor model instance takes care of the GasExchange between the PLF and PLM.
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
    this.placenta_running = false
    this.umb_clamped = true; // flags whether the umbilical vessels are clamped or not
    this.umb_art_res = 800; // resistance of the umbilical arteries (mmHg*s/L)
    this.umb_art_res_factor = 1.0; // factor for the resistance of the umbilical arteries
    this.umb_ven_res = 100; // resistance of the umbilical vein (mmHg*s/L)
    this.umb_ven_res_factor = 1.0; // factor for the resistance of the umbilical vein
    this.plf_res = 2000; // resistance of the fetal placenta (mmHg*s/L)
    this.plf_res_factor = 1.0; // factor for the resistance of the fetal placenta
    this.mat_to2 = 6.85; // maternal placenta total oxygen content (mmol/L)
    this.mat_tco2 = 23; // maternal placenta total carbon dioxide content (mmol/L)
    this.dif_o2 = 0.0005; // diffusion constant for oxygen (mmol/mmHg * s)
    this.dif_co2 = 0.001; // diffusion constant for carbon dioxide (mmol/mmHg * s)


    // -----------------------------------------------
    // initialize dependent parameters
    this.umb_art_flow = 0.0; // flow in the umbilical artery (L/s)
    this.umb_art_velocity = 0.0; // velocity in the umbilical artery (m/s)
    this.umb_ven_flow = 0.0; // flow in the umbilical vein (L/s)
    this.umb_ven_velocity = 0.0; // velocity in the umbilical vein (m/s)

    // -----------------------------------------------
    // local parameters
    this._update_interval = 0.015; // update interval of the placenta model (s)
    this._update_counter = 0.0; // counter of the update interval (s)
    this._umb_art = null;
    this._umb_ven = null;
    this._plf_art = null;
    this._plf_cap = null;
    this._plf_ven = null;
    this._plm = null;
    this._gas_exchanger = null;
    this._umb_ven_ret = null; // umbilical-vein → body return resistor (PL_UMB_VEN → IVCI)
  }

  init_model(args) {
    super.init_model(args);

    this._umb_art = this._model_engine.models["PL_UMB_ART"];
    this._umb_ven = this._model_engine.models["PL_UMB_VEN"];
    this._plf_art = this._model_engine.models["PL_FETAL_ART"];
    this._plf_cap = this._model_engine.models["PL_FETAL_CAP"];
    this._plf_ven = this._model_engine.models["PL_FETAL_VEN"];
    this._plm = this._model_engine.models["PL_MAT"];
    this._gas_exchanger = this._model_engine.models["PL_GASEX"];

    // The umbilical-vein → body return is an autonomous Resistor (PL_UMB_VEN → IVCI): it is NOT
    // listed in IVCI's `inputs`, so no BloodVessel co-manages it. The Placenta owns its enable/clamp
    // state so that stopping or clamping the unit halts the venous return too — otherwise it would
    // leak placental blood into the fetal IVC. Its resistance is left at the scenario value.
    this._umb_ven_ret = this._model_engine.models["PL_UMB_VEN_IVCI"] || null;
  }

  calc_model() {
    this._update_counter += this._t;
    if (this._update_counter > this._update_interval) {
      this._update_counter = 0.0;

      // all sub-models are required; skip if the wiring is incomplete
      if (!this._umb_art || !this._umb_ven || !this._plf_art || !this._plf_cap ||
          !this._plf_ven || !this._plm || !this._gas_exchanger) return;

      // keep all associated models in the same enabled/disabled state as the placenta — done every
      // tick (not only while running) so STOPPING the placenta actually disables flow and gas exchange
      this._umb_art.is_enabled = this.placenta_running;
      this._umb_ven.is_enabled = this.placenta_running;
      this._plf_art.is_enabled = this.placenta_running;
      this._plf_cap.is_enabled = this.placenta_running;
      this._plf_ven.is_enabled = this.placenta_running;
      this._plm.is_enabled = this.placenta_running;
      this._gas_exchanger.is_enabled = this.placenta_running;
      // the return resistor we took over from IVCI follows the same enable state
      if (this._umb_ven_ret) this._umb_ven_ret.is_enabled = this.placenta_running;

      // the settings below are only meaningful while the placenta is running
      if (!this.placenta_running) return;

      // clamp umbilical vessels if set to clamped
      this._umb_art.no_flow = this.umb_clamped;
      this._umb_ven.no_flow = this.umb_clamped;
      this._plf_art.no_flow = this.umb_clamped;
      this._plf_cap.no_flow = this.umb_clamped;
      this._plf_ven.no_flow = this.umb_clamped;
      // also clamp the umbilical-vein → body return so a clamp stops flow on BOTH sides
      if (this._umb_ven_ret) this._umb_ven_ret.no_flow = this.umb_clamped;

      // set the resistances of the associated models
      const umb_art_r = this.umb_art_res * this.umb_art_res_factor;
      const umb_ven_r = this.umb_ven_res * this.umb_ven_res_factor;
      const plf_r = this.plf_res * this.plf_res_factor;
      this._umb_art.r_for = umb_art_r;
      this._umb_art.r_back = umb_art_r;
      this._umb_ven.r_for = umb_ven_r;
      this._umb_ven.r_back = umb_ven_r;
      this._plf_art.r_for = plf_r;
      this._plf_art.r_back = plf_r;
      this._plf_cap.r_for = plf_r;
      this._plf_cap.r_back = plf_r;
      this._plf_ven.r_for = plf_r;
      this._plf_ven.r_back = plf_r;

      // set the maternal placenta oxygen and carbon dioxide partial pressures in the gas exchanger
      this._plm.to2 = this.mat_to2;
      this._plm.tco2 = this.mat_tco2;

      // set the diffusion constants in the gas exchanger
      this._gas_exchanger.dif_o2 = this.dif_o2;
      this._gas_exchanger.dif_co2 = this.dif_co2;
    }
  }


}
