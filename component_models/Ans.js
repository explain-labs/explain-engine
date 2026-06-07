import { BaseModelClass } from "../base_models/BaseModelClass";
import { calc_blood_composition } from "./BloodComposition";

export class Ans extends BaseModelClass {
  // static properties
  static model_type = "Ans";

  constructor(model_ref, name = "") {
    // initialize the parent class
    super(model_ref, name);

    // initialize independent properties
    this.ans_active = true; // flag whether the ANS is active
    this.components = {}
    this.blood_composition_models= []; // list of models from which the ANS needs to calculate blood gases

    // initialize local properties
    this._update_interval = 0.05; // update interval of the ANS (seconds)
    this._update_counter = 0.0; // update counter (seconds)
   
  }

  calc_model() {
    // Increase the update counter
    this._update_counter += this._t;

    // Check if it's time to run the calculations
    if (this._update_counter >= this._update_interval) {
      // Reset the update counter
      this._update_counter = 0.0;

      // switch through all components
      Object.keys(this.components).forEach(component => 
        {
          this._model_engine.models[component].ans_active = this.ans_active;
        }
      );

      // calculate the necessary blood compositions
      this.blood_composition_models.forEach(model => {
        let m = this._model_engine.models[model];
        if (m.ans_active) {
          calc_blood_composition(m);
        }
      });
    }
  }
}
