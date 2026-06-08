import { BaseModelClass } from "./BaseModelClass";

export class Resistor extends BaseModelClass {
  // static properties
  static model_type = "Resistor";

  constructor(model_ref, name = "") {
    // call the constructor of the parent class
    super(model_ref, name);

    // initialize independent properties
    this.r_for = 1.0; // forward flow resistance Rf (mmHg*s/l)
    this.r_back = 1.0; // backward flow resistance Rb (mmHg*s/l )
    this.r_k = 0.0; // non-linear resistance coefficient K1 (unitless)
    this.comp_from = ""; // holds the name of the upstream component
    this.comp_to = ""; // holds the name of the downstream component
    this.no_flow = false; // flags whether flow is allowed across this resistor
    this.no_back_flow = false; // flags whether backflow is allowed across this resistor
    this.p1_ext = 0.0; // external pressure on the inlet (mmHg)
    this.p2_ext = 0.0; // external pressure on the outlet (mmHg)
    this.fixed_composition = false;
    this.is_externally_managed = false; // flag read by owning models to skip their own flow calc

    // non-persistent property factors. These factors reset to 1.0 after each model step
    this.r_factor = 1.0; // non-persistent resistance factor
    this.r_k_factor = 1.0; // non-persistent non-linear coefficient factor

     // persistent property factors. These factors are persistent and do not reset
    this.r_factor_ps = 1.0; //  persistent resistance factor
    this.r_k_factor_ps = 1.0; // persistent non-linear coefficient factor

    // scaling factors
    this.r_factor_scaling_ps = 1.0; // persistent scaling factor for the resistance
    this.r_k_factor_scaling_ps = 1.0; // persistent scaling factor for the non-linear coefficient

    // initialize dependent properties
    this.flow = 0.0;  // flow f(t) (L/s)
    
    // local variables
    this._comp_from = {}; // holds a reference to the upstream component
    this._comp_to = {}; // holds a reference to the downstream component
    this.r_for_eff = 1000;  // calculated forward resistance (mmHg/L*s)
    this.r_back_eff = 1000; // calculated backward resistance (mmHg/L*s)
    this.r_k_eff = 0; // calculated non-linear resistance factor (unitless)
    this._prev_flow = 0.0; // flow from previous model step (L/s)
  }

  // this routine is called in every model step by the ModelEngine Class
  calc_model() {
    // find the up- and downstream components and store the references
    this._comp_from = this._model_engine.models[this.comp_from];
    this._comp_to = this._model_engine.models[this.comp_to];

    // calculate the resistances
    this.calc_resistance();

    // calculate the flow
    this.calc_flow();
  }

  // calculate resistance
  calc_resistance() {
       // incorporate all factors influencing this resistor
       this.r_for_eff = this.r_for 
          + (this.r_factor - 1) * this.r_for
          + (this.r_factor_ps - 1) * this.r_for
          + (this.r_factor_scaling_ps - 1) * this.r_for; // apply scaling factor to the forward resistance

       this.r_back_eff = this.r_back 
          + (this.r_factor - 1) * this.r_back
          + (this.r_factor_ps - 1) * this.r_back
          + (this.r_factor_scaling_ps - 1) * this.r_back; // apply scaling factor to the backward resistance

       this.r_k_eff = this.r_k 
          + (this.r_k_factor - 1) * this.r_k
          + (this.r_k_factor_ps - 1) * this.r_k
          + (this.r_k_factor_scaling_ps - 1) * this.r_k; // apply scaling factor to the non-linear coefficient

      // reset the non persistent factors
      this.r_factor = 1.0;
      this.r_k_factor = 1.0;
  }

  calc_flow() {
    // get the pressure of the volume containing compartments and incorporate the external pressures
    let _p1_t = this._comp_from.pres + this.p1_ext;
    let _p2_t = this._comp_to.pres + this.p2_ext;

    // reset the external pressures
    this.p1_ext = 0.0;
    this.p2_ext = 0.0;

    // reset the current flow
    this.flow = 0.0;

    // return if no flow is allowed across this resistor
    if (this.no_flow) {
      this._prev_flow = 0.0;
      // return from this function
      return;
    }

    // calculate the forward flow between two components
    if (_p1_t >= _p2_t) {
      // guard against a non-positive resistance (would produce Infinity/NaN flow)
      if (this.r_for_eff <= 0.0) {
        this._prev_flow = 0.0;
        return;
      }
      // calculate the forward flow. The non-linear term uses the previous step's flow (explicit
      // lagged scheme) — not this.flow, which was just reset to 0 above.
      this.flow = (_p1_t - _p2_t - this.r_k_eff * Math.pow(this._prev_flow, 2)) / this.r_for_eff;

      // update the volumes of the connected components but do not remove the volume which could not be removed from the upstream component (to prevent volume loss)
      const vol_not_removed = this._comp_from.volume_out(this.flow * this._t);
      this._comp_to.volume_in(this.flow * this._t - vol_not_removed, this._comp_from);

      // store the previous flow
      this._prev_flow = this.flow;
      
      // return from this function
      return;
    }

    // calculate the backward flow between two components
    if (_p1_t < _p2_t && !this.no_back_flow) {
      // guard against a non-positive resistance (would produce Infinity/NaN flow)
      if (this.r_back_eff <= 0.0) {
        this._prev_flow = 0.0;
        return;
      }
      // calculate the backward flow. The non-linear term uses the previous step's flow (explicit
      // lagged scheme) — not this.flow, which was just reset to 0 above.
      this.flow = (_p1_t - _p2_t + this.r_k_eff * Math.pow(this._prev_flow, 2)) / this.r_back_eff;

      // update the volumes of the connected components but do not remove the volume which could not be removed from the upstream component (to prevent volume loss)
      let vol_not_removed = this._comp_to.volume_out(-this.flow * this._t);
      this._comp_from.volume_in(-this.flow * this._t - vol_not_removed,this._comp_to);

      // store the previous flow
      this._prev_flow = this.flow;

      // return from this function
      return;
    }

    // reached only when p1 < p2 and backflow is blocked: no flow occurred this step,
    // so clear the stored flow to keep the non-linear term consistent next step
    this._prev_flow = 0.0;
  }
}
