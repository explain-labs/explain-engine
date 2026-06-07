import { BaseModelClass } from "../base_models/BaseModelClass";

export class Kidneys extends BaseModelClass {
  // static properties
  static model_type = "Kidneys";

  constructor(model_ref, name = "") {
    super(model_ref, name);
  }

  calc_model() {
    // basic placeholder — no kidney physics implemented yet
  }
}
