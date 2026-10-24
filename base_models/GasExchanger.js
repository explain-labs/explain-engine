import { BaseModelClass } from "./BaseModelClass";
import { calc_blood_composition } from "../component_models/BloodComposition"
import { GAS_CONSTANT } from "../helpers/Units";

export class GasExchanger extends BaseModelClass {
  // static properties
  static model_type = "GasExchanger";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties
    this.comp_blood = ""; // name of the blood component
    this.comp_gas = ""; // name of the gas component
    this.dif_o2 = 0.0; // diffusion constant for oxygen (mmol/mmHg * s)
    this.dif_co2 = 0.0; // diffusion constant for carbon dioxide (mmol/mmHg * s)

    // Optional membrane transfer ceiling (mmol/s). 0 = disabled = legacy pure-diffusion behaviour, so
    // this is inert for the native-lung exchangers (GASEX_LL/GASEX_RL), which never set it. Only the
    // ECLS oxygenator sets it (driven by the Ecls device) to model a rated-flow membrane: once blood
    // flow exceeds the membrane's rated flow, the per-step flux is capped, so the outlet compartment
    // cannot fully saturate and post-oxygenator saturation falls — instead of pinning at ~100%.
    this.o2_cap = 0.0; // max O2 transfer (mmol/s); 0 = no ceiling
    this.co2_cap = 0.0; // max CO2 transfer (mmol/s); 0 = no ceiling

    // non-persistent factors
    this.dif_o2_factor = 1.0; // factor modifying the oxygen diffusion constant
    this.dif_co2_factor = 1.0; // factor modifying the carbon diffusion constant

    // persistent factors
    this.dif_o2_factor_ps = 1.0; // factor modifying the oxygen diffusion constant
    this.dif_co2_factor_ps = 1.0; // factor modifying the carbon diffusion constant

    // scaling factors (the persistent scaling layer)
    this.dif_o2_factor_scaling_ps = 1.0; // scaling factor for the oxygen diffusion constant
    this.dif_co2_factor_scaling_ps = 1.0; // scaling factor for the carbon diffusion constant
    
    // dependent properties
    this.flux_o2 = 0.0; // O2 moved this step, blood -> gas (mmol per step; uptake is negative)
    this.flux_co2 = 0.0; // CO2 moved this step, blood -> gas (mmol per step)

    // local variables
    this._blood = null; // reference to the blood component
    this._gas = null; // reference to the gas component
    this.dif_o2_step = 0.0; // effective O2 diffusion constant incl. the factors (mmol/(mmHg·s))
    this.dif_co2_step = 0.0; // effective CO2 diffusion constant incl. the factors (mmol/(mmHg·s))
    // the blood-gas solve (calc_blood_composition, an iterative acid-base / O2 solve) runs every
    // bc_interval seconds instead of every step; the fluxes in between use the last po2/pco2
    this.bc_interval = 0.002;
    this._bc_counter = Infinity; // solve on the first step
  }

  calc_model() {
    // find the blood and gas components (cached; re-resolved when a name changes)
    if (this._blood_name !== this.comp_blood || this._gas_name !== this.comp_gas || !this._blood || !this._gas) {
      this._blood = this._model_engine.models[this.comp_blood];
      this._gas = this._model_engine.models[this.comp_gas];
      this._blood_name = this.comp_blood;
      this._gas_name = this.comp_gas;
      this._bc_counter = Infinity;
    }
    if (!this._blood || !this._gas) return;

    // set the blood composition of the blood component (every bc_interval, see the constructor)
    this._bc_counter += this._t;
    if (this._bc_counter >= this.bc_interval - 1e-12) {
      this._bc_counter = 0.0;
      calc_blood_composition(this._blood);
    }

    // get the partial pressures and gas concentrations from the components
    let po2_blood = this._blood.po2;
    let pco2_blood = this._blood.pco2;
    let to2_blood = this._blood.to2;
    let tco2_blood = this._blood.tco2;

    let co2_gas = this._gas.co2;
    let cco2_gas = this._gas.cco2;
    let po2_gas = this._gas.po2;
    let pco2_gas = this._gas.pco2;

    // guard against division by zero on either compartment (both volumes are used as denominators)
    if (this._blood.vol <= 0.0 || this._gas.vol <= 0.0) return;

    // incorporate the factors
    this.dif_o2_step = this.dif_o2 
        + (this.dif_o2_factor - 1) * this.dif_o2
        + (this.dif_o2_factor_ps - 1) * this.dif_o2
        + (this.dif_o2_factor_scaling_ps - 1) * this.dif_o2; // apply scaling factor to the diffusion factor

    this.dif_co2_step = this.dif_co2 
        + (this.dif_co2_factor - 1) * this.dif_co2
        + (this.dif_co2_factor_ps - 1) * this.dif_co2
        + (this.dif_co2_factor_scaling_ps - 1) * this.dif_co2; // apply scaling factor to the diffusion factor

    // the factor layers add up, so several writers lowering them at once (Surfactant derecruitment
    // plus atelectasis) can take the sum below zero; a negative diffusion constant would pump gas
    // against its gradient and blow up the blood gases, so floor it at no exchange
    if (this.dif_o2_step < 0.0) this.dif_o2_step = 0.0;
    if (this.dif_co2_step < 0.0) this.dif_co2_step = 0.0;


    // calculate the O2 flux from the blood to the gas compartment.
    // If calc_blood_composition could not resolve po2 it leaves the -1 sentinel (e.g. when an
    // oxygenator drives the O2 content above the solver's po2 ceiling). The raw (po2_blood - po2_gas)
    // gradient would then read po2_blood as -1 — a huge spurious uptake that keeps pumping O2 in every
    // step, a runaway that inflates to2 and keeps po2 unsolvable. Skip the O2 flux while po2 is invalid;
    // advection dilutes the compartment back into a solvable range and normal exchange resumes.
    this.flux_o2 = po2_blood < 0.0 ? 0.0 : (po2_blood - po2_gas) * this.dif_o2_step * this._t;

    // membrane transfer ceiling: cap the per-step flux magnitude at o2_cap*dt (mmol). Inert when
    // o2_cap == 0 (native lung). This is what makes the ECLS oxygenator rated-flow-limited.
    if (this.o2_cap > 0.0) {
      const o2_lim = this.o2_cap * this._t;
      if (this.flux_o2 > o2_lim) this.flux_o2 = o2_lim;
      else if (this.flux_o2 < -o2_lim) this.flux_o2 = -o2_lim;
    }

    // never move more than the donor holds (flooring the donor afterwards would leave the receiver
    // with the full flux and create molecules)
    this.flux_o2 = this._limit(this.flux_o2, to2_blood * this._blood.vol, co2_gas * this._gas.vol);

    // calculate the new O2 concentrations of the gas and blood compartments
    let new_to2_blood = (to2_blood * this._blood.vol - this.flux_o2) / this._blood.vol;
    let new_co2_gas = (co2_gas * this._gas.vol + this.flux_o2) / this._gas.vol;

    // calculate the CO2 flux from the blood to the gas compartment (same invalid-partial-pressure guard
    // as O2: a failed acid-base solve leaves pco2 at the -1 sentinel, which would drive a spurious flux).
    this.flux_co2 = pco2_blood < 0.0 ? 0.0 : (pco2_blood - pco2_gas) * this.dif_co2_step * this._t;

    // membrane transfer ceiling for CO2 (see O2 above). Inert when co2_cap == 0.
    if (this.co2_cap > 0.0) {
      const co2_lim = this.co2_cap * this._t;
      if (this.flux_co2 > co2_lim) this.flux_co2 = co2_lim;
      else if (this.flux_co2 < -co2_lim) this.flux_co2 = -co2_lim;
    }

    this.flux_co2 = this._limit(this.flux_co2, tco2_blood * this._blood.vol, cco2_gas * this._gas.vol);

    // calculate the new CO2 concentrations of the gas and blood compartments
    let new_tco2_blood = (tco2_blood * this._blood.vol - this.flux_co2) / this._blood.vol;
    let new_cco2_gas = (cco2_gas * this._gas.vol + this.flux_co2) / this._gas.vol;

    // transfer the new concentrations, guarding each compartment by fixed_composition so a fixed
    // (infinite-reservoir) compartment stays constant, mirroring BloodDiffusor
    if (!this._blood.fixed_composition) {
      this._blood.to2 = new_to2_blood;
      this._blood.tco2 = new_tco2_blood;
    }
    if (!this._gas.fixed_composition) {
      this._gas.co2 = new_co2_gas;
      this._gas.cco2 = new_cco2_gas;

      // the net molar exchange changes the gas volume (O2 uptake exceeds CO2 output when RQ < 1): at
      // the compartment's pressure and temperature dn mmol occupy dn / c_ideal litres. Every species
      // keeps its moles in the new volume, so the alveolar gas shrinks and the pressure drop draws
      // gas in through the airways (the mass flow behind apnoeic oxygenation and absorption)
      const gas = this._gas;
      const dn = this.flux_o2 + this.flux_co2;
      const c_ideal = gas.pres > 0.0 ? (gas.pres / (GAS_CONSTANT * (273.15 + gas.temp))) * 1000.0 : 0.0;
      if (dn !== 0.0 && c_ideal > 0.0) {
        const v0 = gas.vol;
        const v1 = v0 + dn / c_ideal;
        if (v1 > 0.0) {
          const k = v0 / v1;
          gas.co2 *= k;
          gas.cco2 *= k;
          gas.cn2 *= k;
          gas.ch2o *= k;
          gas.cother *= k;
          gas.vol = v1;
        }
      }
    }

    // reset the non-persistent factors
    this.dif_o2_factor = 1.0;
    this.dif_co2_factor = 1.0;
  }

  // clamp a flux (mmol, + = blood to gas) to the amount the donor side holds
  _limit(flux, n_blood, n_gas) {
    if (flux > 0.0) return Math.min(flux, Math.max(n_blood, 0.0));
    if (flux < 0.0) return Math.max(flux, -Math.max(n_gas, 0.0));
    return flux;
  }
}
