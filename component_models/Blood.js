import { BaseModelClass } from "../base_models/BaseModelClass";
import { calc_blood_composition } from "./BloodComposition"
// ----------------------------------------------------------------------------
export class Blood extends BaseModelClass {
  // static properties
  static model_type = "Blood";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties
    this.viscosity = 6.0; // blood viscosity (centiPoise = Pa * s)
    this.temp = 37.0; // temperature (dgs C)
    this.to2 = 0.0; // total oxygen concentration (mmol/l)
    this.tco2 = 0.0; // total carbon dioxide concentration (mmol/l)
    this.solutes = {}; // dictionary holding the initial circulating solutes
    this.P50_0 = 20.0; // PO2 at which 50% of Hgb is saturated by O2 (fetal = 18.8 (high Hb O2 affinity), neonatal = 20.0, adult = 26.7)
    this.haldane_coeff = 1.0; // Haldane effect strength (0 = off): lower SO2 raises CO2-carrying capacity
    this.blood_containing_modeltypes = [
      "BloodVessel",
      "HeartChamber",
      "BloodCapacitance",
      "BloodTimeVaryingElastance",
      "BloodPump",
      "MicroVascularUnit"
    ];

    // initialize dependent properties
    this.preductal_art_bloodgas = {}; // dictionary containing the preductal arterial bloodgas
    this.art_bloodgas = {}; // dictionary containing the (postductal) arterial bloodgas
    this.ven_bloodgas = {}; // dictionary containing the venous bloodgas
    this.art_solutes = {}; // dictionary containing the arterial solute concentrations
    
    // initialize local properties (preceded with _)
    this._update_interval = 1.0; // interval at which the calculations are done
    this._update_counter = 0.0; // update counter intermediate
    this._ascending_aorta = null; // reference to ascending aorta model
    this._descending_aorta = null; // reference to descending aorta model
    this._blood_components = [];
  }

  init_model(args = {}) {
    // set the values of the independent properties
    args.forEach((arg) => {
      this[arg["key"]] = arg["value"];
    });

    this._blood_components = [];
    for (const model_name in this._model_engine.models) {
      const model = this._model_engine.models[model_name];
      if (this.blood_containing_modeltypes.includes(model.model_type)) {
        this._blood_components.push(model);
        // propagate the Haldane coefficient and O2-Hb affinity baseline to every blood component
        // (outside the bootstrap guard). P50_0 lets a scenario pick the dissociation curve —
        // e.g. fetal HbF (18.8) vs neonatal (20.0) vs adult (26.7). A per-compartment P50_0 already
        // present in the loaded state is respected (e.g. a maternal pool kept at adult affinity).
        model.haldane_coeff = this.haldane_coeff;
        if (model.P50_0 === undefined) model.P50_0 = this.P50_0;
        // only bootstrap composition for freshly-constructed compartments (empty solutes). A
        // restored/loaded state already carries per-compartment composition, so guarding on
        // empty solutes (rather than the to2/tco2==0 proxy) preserves it even when a restored
        // compartment legitimately has to2==0 && tco2==0.
        if (Object.keys(model.solutes).length === 0) {
          model.to2 = this.to2;
          model.tco2 = this.tco2;
          model.solutes = { ...this.solutes };
          model.temp = this.temp;
          model.viscosity = this.viscosity;
        }
      }
    }

    // get the components where we measure the bloodgases
    this._ascending_aorta = this._model_engine.models["AA"];
    this._descending_aorta = this._model_engine.models["AD"];

    // copy the initial arterial solutes
    this.art_solutes = { ...this.solutes };

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_model() {

    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      this._update_counter = 0.0;

      // preductal arterial bloodgas
      calc_blood_composition(this._ascending_aorta);
      this.preductal_art_bloodgas = {
        ph: this._ascending_aorta.ph,
        pco2: this._ascending_aorta.pco2,
        po2: this._ascending_aorta.po2,
        hco3: this._ascending_aorta.hco3,
        be: this._ascending_aorta.be,
        so2: this._ascending_aorta.so2,
      };

      // postductal arterial bloodgas
      calc_blood_composition(this._descending_aorta);
      this.art_bloodgas = {
        ph: this._descending_aorta.ph,
        pco2: this._descending_aorta.pco2,
        po2: this._descending_aorta.po2,
        hco3: this._descending_aorta.hco3,
        be: this._descending_aorta.be,
        so2: this._descending_aorta.so2,
      };

      // venous bloodgas
      calc_blood_composition(this._model_engine.models["IVCI"])
      calc_blood_composition(this._model_engine.models["SVC"])
      // right-atrial (mixed-venous) bloodgas — the Monitor reads SvO2 from RAIVCI, so its
      // composition must be solved here too (otherwise so2 stays at the -1 sentinel)
      if (this._model_engine.models["RAIVCI"]) calc_blood_composition(this._model_engine.models["RAIVCI"])

      // arterial solute concentrations
      this.art_solutes = { ...this._descending_aorta.solutes };
    }
  }

  set_temperature(new_temp, bc_site = "") {
    this.temp = new_temp;
    if (bc_site) {
      this._model_engine.models[bc_site].temp = new_temp;
    } else {
      this._blood_components.forEach((model) => {
        model.temp = new_temp;
      });
    }
    
  }

  set_viscosity(new_viscosity) {
    this.viscosity = new_viscosity;
    this._blood_components.forEach((model) => {
      model.viscosity = new_viscosity;
    });
  }

  set_haldane_coeff(new_coeff) {
    this.haldane_coeff = new_coeff;
    this._blood_components.forEach((model) => {
      model.haldane_coeff = new_coeff;
    });
  }

  // set the O2-Hb affinity baseline (P50 at standard conditions) on every blood compartment —
  // e.g. fetal HbF (18.8), neonatal (20.0), adult (26.7). Lower P50 = higher affinity = higher SaO2 at a given pO2.
  set_P50(new_p50) {
    this.P50_0 = new_p50;
    this._blood_components.forEach((model) => {
      model.P50_0 = new_p50;
    });
  }

  set_to2(new_to2, bc_site = "") {
    if (bc_site) {
      this._model_engine.models[bc_site].to2 = new_to2;
    } else {
      this._blood_components.forEach((model) => {
        model.to2 = new_to2;
      });
    }
  }

  set_tco2(new_tco2, bc_site = "") {
    if (bc_site) {
      this._model_engine.models[bc_site].tco2 = new_tco2;
    } else {
      this._blood_components.forEach((model) => {
        model.tco2 = new_tco2;
      });
    }
  }

  set_solute(solute, solute_value, bc_site = "") {
    if (bc_site) {
      this._model_engine.models[bc_site].solutes[solute] = solute_value;
    } else {
      // update the reference value and propagate this specific solute to all blood components
      this.solutes[solute] = solute_value;
      this._blood_components.forEach((model) => {
        model.solutes[solute] = solute_value;
      });
    }
  }

}
