import { BaseModelClass } from "./BaseModelClass";
import { exchange_blood } from "../helpers/BloodMixing";
import { exchange_gas } from "../helpers/GasMixing";

export class Resistor extends BaseModelClass {
  // static properties
  static model_type = "Resistor";

  constructor(model_ref, name = "") {
    // call the constructor of the parent class
    super(model_ref, name);

    // initialize independent properties
    this.r_for = 1.0; // forward flow resistance Rf (mmHg*s/l)
    this.r_back = 1.0; // backward flow resistance Rb (mmHg*s/l )
    this.r_k = 0.0; // non-linear resistance coefficient K1 (mmHg·s²/L²)
    this.comp_from = ""; // holds the name of the upstream component
    this.comp_to = ""; // holds the name of the downstream component
    this.no_flow = false; // flags whether flow is allowed across this resistor
    // a second, independent gate for a controller that does NOT own this resistor: an owning
    // BloodVessel re-copies its own no_flow every step and would overwrite a gate written there
    this.no_flow_ext = false;
    this.no_back_flow = false; // flags whether backflow is allowed across this resistor
    // Numerical scheme, not physiology: when true the flow is computed backward-Euler for the pair
    // of compartments this resistor joins, flow = Δp / (R + dt·(E_from + E_to)), instead of the
    // explicit Δp / R. Explicit integration of two capacitances joined by a small resistance is
    // stable only while dt·(E_from + E_to)/R < 2 (< 4/3 for three equal ones in a row, as the
    // aorta AA–AAR–AD is); the implicit form is stable for any elastance and equals the explicit
    // one to first order when R >> dt·ΣE. Default false: only resistors that join near-merged
    // compartments need it (see docs/Resistor.md).
    this.implicit = false;
    this.p1_ext = 0.0; // external pressure on the inlet (mmHg)
    this.p2_ext = 0.0; // external pressure on the outlet (mmHg)
    this.fixed_composition = false;
    // Mixing without net flow (L/s): an equal volume exchanged both ways each step. Blood: eddies and
    // vortex flow between compartments that are one continuous pool (helpers/BloodMixing.js
    // exchange_blood). Gas: molecular diffusion and cardiogenic mixing (helpers/GasMixing.js
    // exchange_gas). Advection by `flow` only carries upstream contents downstream. 0 (default) = off.
    this.mix_flow = 0.0;

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
    this.r_k_eff = 0; // calculated non-linear resistance coefficient (mmHg·s²/L²)
    this._prev_flow = 0.0; // flow from previous model step (L/s)
    this._ref_version = -1; // _models_version the cached _comp_from/_comp_to were resolved at
    this._ref_from = null; // comp_from / comp_to names they were resolved for
    this._ref_to = null;
  }

  // this routine is called in every model step by the ModelEngine Class
  calc_model() {
    // find the up- and downstream components and store the references. Cached: re-resolved when a
    // name changes (e.g. ECLS re-cannulation) or the engine's model set may have changed
    // (_models_version is bumped at every calculate() call and realtime tick)
    const version = this._model_engine._models_version;
    if (this._ref_version !== version || this._ref_from !== this.comp_from || this._ref_to !== this.comp_to) {
      this._comp_from = this._model_engine.models[this.comp_from];
      this._comp_to = this._model_engine.models[this.comp_to];
      this._ref_version = version;
      this._ref_from = this.comp_from;
      this._ref_to = this.comp_to;
    }

    // calculate the resistances
    this.calc_resistance();

    // calculate the flow
    this.calc_flow();

    // exchange without net flow (never across a closed connection)
    if (this.mix_flow > 0.0 && !this.no_flow && !this.no_flow_ext && this._comp_from && this._comp_to) {
      if (typeof this._comp_from.to2 === "number" && typeof this._comp_to.to2 === "number") {
        exchange_blood(this._comp_from, this._comp_to, this.mix_flow * this._t);
      } else if (typeof this._comp_from._end_conc === "function" && typeof this._comp_to._end_conc === "function") {
        exchange_gas(this._comp_from, this._comp_to, this.mix_flow * this._t);
      }
    }
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

      // backward-Euler pair correction (see `implicit` above)
      if (this.implicit) {
        const k = this._t * (this._elastance(this._comp_from) + this._elastance(this._comp_to));
        this.r_for_eff += k;
        this.r_back_eff += k;
      }
  }

  // current elastance of a compartment for the implicit correction: a capacitance's el_eff, or a
  // time-varying elastance's instantaneous value between its minimum and maximum
  _elastance(c) {
    if (!c) return 0.0;
    if (typeof c.el_max_eff === "number" && typeof c.act_factor === "number")
      return c.el_min_eff + (c.el_max_eff - c.el_min_eff) * c.act_factor;
    return typeof c.el_eff === "number" ? c.el_eff : 0.0;
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
    if (this.no_flow || this.no_flow_ext) {
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
