import { BloodCapacitance } from "./BloodCapacitance";
import { Resistor } from "../base_models/Resistor";

/*
The BloodVessel class extends the BloodCapacitance class and adds a Resistor to represent a blood vessel in the model.
So a BloodVessel has a resistance and has flow properties and can react to the autonomic nervous system (ANS).

A BloodVessel is under autonomic control where the ans activity and ans sensitivity determine how the resistance
and the elastance of this blood vessel change. The coupling between the resistance and elastance is determined 
by the alpha parameter

So, if the ans activity changes then the effect on the elastance is determined by the ans sensitivity and the alpha factor. 
The effect on the resistance is only determined by the the ans activity ands ans sensitivity parameter.

So if a vessel constricts under autonomic control not only it's resistance changes but also it's elastance!
This is a key fundamental concept in Explain and makes it unique from under models.
*/

export class BloodVessel extends BloodCapacitance {
  // static properties
  static model_type = "BloodVessel";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties unique to a BloodVessel
    this.inputs = []; // list of inputs for this blood vessel
    this.r_for = 1.0; // forward flow resistance Rf (mmHg*s/l)
    this.r_back = 1.0; // backward flow resistance Rb (mmHg*s/l )
    this.r_k = 0.0; // non-linear resistance coefficient K1 (unitless)
    this.no_flow = false; // flags whether flow is allowed across this resistor
    this.no_back_flow = false; // flags whether backflow is allowed across this resistor
    this.p1_ext = 0.0; // external pressure on the inlet (mmHg)
    this.p2_ext = 0.0; // external pressure on the outlet (mmHg)
    this.alpha = 0.0; // determines relation between resistance change and elastance change. Veins/venules: 0.75, arterioles: 0.63, large arteries: 0.5
    this.ans_sens = 0.0; // sensitivity of this blood vessel for autonomic control. 0.0 is no effect, 1.0 is full effect
    this.ans_activity = 1.0; // ans activity factor (unitless)

    // non-persistent property factors. These factors reset to 1.0 after each model step
    this.r_factor = 1.0; // non-persistent resistance factor
    this.r_k_factor = 1.0; // non-persistent non-linear coefficient factor

    // persistent property factors. These factors are persistent and do not reset
    this.r_factor_ps = 1.0; // persistent resistance factor
    this.r_k_factor_ps = 1.0; // persistent non-linear coefficient factor

    // scaling factors for the properties
    this.r_factor_scaling_ps = 1.0; // scaling factor for the resistance factor
    this.r_k_factor_scaling_ps = 1.0; // scaling factor for the non-linear coefficient factor

    // initialize dependent properties
    this.flow = 0.0; // flow f(t) (L/s)
    this.flow_forward = 0.0; // forward flow from the input blood vessels (L/s)
    this.flow_backward = 0.0; // backward flow to the input blood vessels (L/s)

    // state variables to store the current resistance and elastance values
    this.r_for_eff = 1000;  // calculated forward resistance (mmHg/L*s)
    this.r_back_eff = 1000; // calculated backward resistance (mmHg/L*s)
    this.r_k_eff = 0; // calculated non-linear resistance factor (unitless)

    // local properties
    this._resistors = {}; // list of connectors for this blood vessel
    this._r_total_factor = 1.0; // composed multiplicative R multiplier; cached by calc_resistances and reused by calc_elastances for the α-coupling

  }

  // override the parent class method
  init_model(args={}) {
    // call parent class method
    super.init_model(args);

    // initialize a resistor with the inputs
    this.inputs.forEach((inputName) => { 
      // check whether the resistor already exists (in case of a saved state)
      if (this._model_engine.models.hasOwnProperty(inputName + "_" + this.name)) {
        this._resistors[inputName + "_" + this.name] = this._model_engine.models[inputName + "_" + this.name];
        return; // if so, do not create a new resistor
      }

      // create a new resistor for each input
      let res = new Resistor(this._model_engine, inputName + "_" + this.name);

      // set the properties of the resistor
      let args = [
        { key: "name", value: inputName + "_" + this.name},
        { key: "description", value: "input connector for " + this.name },
        { key: "is_enabled", value: this.is_enabled },
        { key: "is_externally_managed", value: true },
        { key: "model_type", value: "Resistor" },
        { key: "r_for", value: this.r_for },
        { key: "r_back", value: this.r_back },
        { key: "r_k", value: this.r_k },
        { key: "no_flow", value: this.no_flow },
        { key: "no_back_flow", value: this.no_back_flow },
        { key: "comp_from", value: inputName },
        { key: "comp_to", value: this.name },
      ]
      // initialize the resistor with the arguments
      res.init_model(args);

      // add the resistor to the list of models
      this._model_engine.models[inputName + "_" + this.name] = res;

      // add the resistor to the dictionary of connectors
      this._resistors[inputName + "_" + this.name] = res;
    });
  }
  
  // keep the owned input resistors in sync with this vessel's enabled state, also when the
  // vessel itself is disabled — calc_model does not run then, which would otherwise leave the
  // resistors enabled and still conducting flow through a disabled vessel
  step_model() {
    Object.values(this._resistors).forEach((resistor) => {
      resistor.is_enabled = this.is_enabled;
    });
    super.step_model();
  }

  calc_model() {
    // call this class specific calculation methods
    this.calc_resistances();
    this.calc_elastances();

    // update the associated resistors
    Object.values(this._resistors).forEach((resistor) => {
      resistor.is_enabled = this.is_enabled;
      resistor.r_for = this.r_for_eff
      resistor.r_back = this.r_back_eff
      resistor.r_k = this.r_k_eff

      resistor.no_back_flow = this.no_back_flow
      resistor.no_flow = this.no_flow
      resistor.p1_ext = this.p1_ext
      resistor.p2_ext = this.p2_ext
    })

    // call parent class methods
    this.calc_volumes();  
    this.calc_pressure();

    // get the flows from the resistors
    this.get_flows();
  }

  get_flows() {
    //reset the flow values
    this.flow = 0.0;
    this.flow_forward = 0.0;
    this.flow_backward = 0.0;

    // get the flow values from the resistors
    Object.values(this._resistors).forEach((resistor) => {
      if (resistor.is_enabled) {
        if (resistor.flow > 0) {
          // get the forward flow across the input
          this.flow_forward += resistor.flow;
        } else {
          // get the backward flow across the input
          this.flow_backward += -resistor.flow;
        }
      }
    });
    
    // calculate the net flow through this blood vessel
    this.flow = this.flow_forward - this.flow_backward;
  }

  calc_resistances() {
    // Multiplicative composition of all resistance multipliers. Composing
    // factors as a product (rather than summing their deltas as before) lets
    // simultaneous factors compound correctly: e.g. r_factor=2 with r_factor_ps=2
    // gives a true 4x rise instead of the linearised 3x. The ANS contribution
    // is the per-vessel sensitivity-weighted multiplier (1 + (a-1)*ans_sens),
    // matching the pre-existing semantics.
    const ans_mult = 1 + (this.ans_activity - 1) * this.ans_sens;

    const r_total_factor =
      this.r_factor *
      this.r_factor_ps *
      this.r_factor_scaling_ps *
      ans_mult;

    this.r_for_eff = this.r_for * r_total_factor;
    this.r_back_eff = this.r_back * r_total_factor;

    // r_k carries its own factor stack but the same ANS coupling, composed
    // multiplicatively like the linear resistance above.
    const r_k_total_factor =
      this.r_k_factor *
      this.r_k_factor_ps *
      this.r_k_factor_scaling_ps *
      ans_mult;
    this.r_k_eff = this.r_k * r_k_total_factor;

    // Cache the composed linear-resistance multiplier for the elastance step
    // (single source of truth for the α-coupling).
    this._r_total_factor = r_total_factor;

    // reset the non persistent factors
    this.r_factor = 1.0;
    this.r_k_factor = 1.0;
  }

  calc_elastances() {
    // Multiplicative composition of the passive elastance multipliers
    // (aging, scaling, scenario edits — direct E modifiers, not R-coupled).
    const el_passive_mult =
      this.el_base_factor *
      this.el_base_factor_ps *
      this.el_base_factor_scaling_ps;

    // Geometric R→E coupling: apply α once to the *combined* resistance
    // multiplier, not per-factor. Falls back to 1 if calc_resistances has not
    // run yet (defensive — under normal model order it always has).
    const el_geom_mult = Math.pow(this._r_total_factor ?? 1.0, this.alpha);

    this.el_eff = this.el_base * el_passive_mult * el_geom_mult;

    // el_k carries its own multipliers and is not α-coupled to R (same as
    // before — the non-linear stiffening term is treated as a structural
    // property of the wall, not driven by vasoactivity).
    const el_k_passive_mult =
      this.el_k_factor *
      this.el_k_factor_ps *
      this.el_k_factor_scaling_ps;
    this.el_k_eff = this.el_k * el_k_passive_mult;

    // reset the non persistent factors
    this.el_base_factor = 1.0;
    this.el_k_factor = 1.0;
  }
}
