import { BaseModelClass } from "../base_models/BaseModelClass";
import { calc_blood_composition } from "./BloodComposition"
// ----------------------------------------------------------------------------
export class Blood extends BaseModelClass {
  // static properties
  static model_type = "Blood";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties
    // Blood viscosity follows the haematocrit: eta = viscosity_plasma * exp(viscosity_hct_k * Hct), with
    // Hct = Hb[g/dL] / MCHC (33 g/dL). k = 3.13 is a low-shear (in vivo) value; with plasma 1.3 cP a
    // neonatal Hb of 10 mmol/L (Hct 0.49) gives ~6 cP. Each step every compartment's viscosity is
    // derived from its own Hb, and BloodVessel resistances scale with viscosity / viscosity_ref.
    this.viscosity_plasma = 1.3; // plasma viscosity (cP)
    this.viscosity_hct_k = 3.13; // exponential haematocrit coefficient (per unit Hct)
    this.viscosity = 6.0; // blood viscosity at the reference Hb (cP), derived in init_model
    this.viscosity_ref = 0.0; // viscosity at which the vessel resistances are calibrated (cP), derived in init_model
    this.temp = 37.0; // temperature (dgs C)
    this.blood_temp_tc = 10.0; // perfusion equilibration time constant (s) for warming blood toward the body/core temperature
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

  init_model(args = []) {
    // set the values of the independent properties
    args.forEach((arg) => {
      this[arg["key"]] = arg["value"];
    });

    this._blood_components = [];
    for (const model_name in this._model_engine.models) {
      const model = this._model_engine.models[model_name];
      if (this.blood_containing_modeltypes.includes(model.model_type) && model.blood_pool !== false) {
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
        // thermal-coupling fields (the compartment warms toward body_temp over blood_temp_tc).
        // body_temp is the perfusion target written by Thermoregulation each update (= core), or a
        // device setpoint when temp_ext_override is set (e.g. an ECLS heater-cooler). Initialized
        // here rather than in each compartment constructor to keep one source of truth.
        if (model.body_temp === undefined) model.body_temp = model.temp;
        if (model.blood_temp_tc === undefined) model.blood_temp_tc = this.blood_temp_tc;
        if (model.temp_ext_override === undefined) model.temp_ext_override = false;
      }
    }

    // the scenario's resistances are calibrated at the blood it was built with: take the reference
    // viscosity from the volume-weighted Hb of the circulating blood (falls back to solutes.hemoglobin)
    let hb_vol = 0.0;
    let vol = 0.0;
    this._blood_components.forEach((model) => {
      if (model.is_enabled && model.vol > 0.0 && model.solutes["hemoglobin"] !== undefined) {
        hb_vol += model.solutes["hemoglobin"] * model.vol;
        vol += model.vol;
      }
    });
    this.viscosity_ref = this.calc_viscosity(vol > 0.0 ? hb_vol / vol : this.solutes["hemoglobin"]);
    this.viscosity = this.viscosity_ref;
    this._blood_components.forEach((model) => {
      model.viscosity_ref = this.viscosity_ref;
    });

        // get the components where we measure the bloodgases
    this._ascending_aorta = this._model_engine.models["AA"];
    this._descending_aorta = this._model_engine.models["AD"];

    // copy the initial arterial solutes
    this.art_solutes = { ...this.solutes };

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_model() {

    // Warm (or cool) every blood compartment toward its perfusion target over blood_temp_tc — the
    // body warming the blood, as a rate process instead of the old instantaneous stamp. Runs every
    // step so a device/advected perturbation survives and convects around the circuit. Incompressible,
    // so temperature only (no volume/solute change); the clamped fraction cannot overshoot. This is
    // the blood counterpart of GasCapacitance.add_heat. The heat this exchanges with the tissue node
    // is accounted for by Thermoregulation via q_perfusion (same conductance), closing the loop.
    for (const model of this._blood_components) {
      if (model.fixed_composition) continue;
      const tc = model.blood_temp_tc > 0.0 ? model.blood_temp_tc : this.blood_temp_tc;
      const frac = tc > 0.0 ? Math.min(1.0, this._t / tc) : 1.0;
      model.temp += (model.body_temp - model.temp) * frac;
      // viscosity follows the compartment's own haematocrit (dilution, transfusion, polycythaemia)
      model.viscosity = this.calc_viscosity(model.solutes["hemoglobin"]);
    }

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
      // pulmonary artery = true mixed-venous blood (the RV mixes both RA halves; RAIVCI_RASVC.mix_flow
      // only partly mixes them, as IVC/SVC streaming does in the real atrium); the Monitor reads SvO2 here
      if (this._model_engine.models["PA"]) calc_blood_composition(this._model_engine.models["PA"])

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

  // Set the perfusion target (the tissue/core temperature the blood warms toward) on every blood
  // compartment, except those a device currently controls (temp_ext_override). This is the effector
  // channel Thermoregulation drives each update — it replaces the old instantaneous set_temperature
  // stamp, so blood temperature is now a relaxed, advecting field rather than a re-pinned constant.
  set_perfusion_target(core_temp) {
    this._blood_components.forEach((model) => {
      if (!model.temp_ext_override) model.body_temp = core_temp;
    });
  }

  // Report the blood pool's thermal state for the two-node heat balance: total heat capacity
  // C_blood = Sum(vol_i * density * cp) and the heat-capacity-weighted mean temperature. Density in
  // kg/L, cp in J/kg/K → C in J/K. Used by Thermoregulation to compute the perfusion heat exchange.
  get_thermal_state(density, cp) {
    let c_blood = 0.0;
    let ct = 0.0;
    this._blood_components.forEach((model) => {
      // disabled compartments (placenta, idle ECLS prime) are not perfused, and fixed-composition ones (the
      // maternal pool PL_MAT) are held by their owner and skipped by the relaxation in calc_model, so they
      // exchange no heat with the tissue node either
      if (!model.is_enabled || model.fixed_composition) return;
      const c_i = model.vol * density * cp;
      c_blood += c_i;
      ct += c_i * model.temp;
    });
    const t_mean = c_blood > 0.0 ? ct / c_blood : this.temp;
    return { c_blood, t_mean };
  }

  // blood viscosity (cP) from the haemoglobin concentration (mmol/L)
  calc_viscosity(hemoglobin) {
    const hct = Math.min(Math.max((hemoglobin ?? 0.0) / 0.6206 / 33.0, 0.0), 0.9);
    return this.viscosity_plasma * Math.exp(this.viscosity_hct_k * hct);
  }

  // set the blood viscosity at the reference Hb (e.g. plasma proteins, cold agglutinins): scales the
  // plasma viscosity, so the vessel resistances follow viscosity / viscosity_ref. Hb-driven changes
  // need no setter (they follow the haemoglobin).
  set_viscosity(new_viscosity) {
    if (!(new_viscosity > 0.0) || !(this.viscosity > 0.0)) return;
    this.viscosity_plasma *= new_viscosity / this.viscosity;
    this.viscosity = new_viscosity;
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
