import { BaseModelClass } from "./BaseModelClass";
import { calc_blood_composition } from "../component_models/BloodComposition"

export class BloodDiffusor extends BaseModelClass {
  // static properties
  static model_type = "BloodDiffusor";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties
    this.comp_blood1 = "PLF"; // name of the first blood-containing model
    this.comp_blood2 = "PLM"; // name of the second blood-containing model
    this.dif_o2 = 0.01; // diffusion constant for o2 (mmol/mmHg * s)
    this.dif_co2 = 0.01; // diffusion constant for co2 (mmol/mmHg * s)
    this.dif_solutes = {}; // diffusion constant for the different solutes (L/s: mmol/s per mmol/L of gradient)

     // non-persistent property factors. These factors reset to 1.0 after each model step
    this.dif_o2_factor = 1.0; // non-persistent diffusion factor for o2 (unitless)
    this.dif_co2_factor = 1.0; // non-persistent diffusion factor for co2 (unitless)
    this.dif_solutes_factor = 1.0; // non-persistent diffusion factor for solutes (unitless)

    // persistent property factors. These factors are persistent and do not reset
    this.dif_o2_factor_ps = 1.0; // persistent diffusion factor for o2 (unitless)
    this.dif_co2_factor_ps = 1.0; // persistent diffusion factor for co2 (unitless)
    this.dif_solutes_factor_ps = 1.0; // persistent diffusion factor for solutes (unitless)

    // scaling factors
    this.dif_o2_factor_scaling = 1.0; // scaling factor for the o2 diffusion factor (unitless)
    this.dif_co2_factor_scaling = 1.0; // scaling factor for the co2 diffusion factor (unitless)
    this.dif_solutes_factor_scaling = 1.0; // scaling factor for the solute diffusion factor (unitless)
  
    // dependent properties
    this.dif_o2_step = 0.0; // effective o2 diffusion constant incl. the factors (mmol/(mmHg·s))
    this.dif_co2_step = 0.0; // effective co2 diffusion constant incl. the factors (mmol/(mmHg·s))

    // local variables
    this._comp_blood1 = null; // reference to the first blood-containing model
    this._comp_blood2 = null; // reference to the second blood-containing model
  }

  calc_model() {
    // find the two blood-containing models and store references
    this._comp_blood1 = this._model_engine.models[this.comp_blood1];
    this._comp_blood2 = this._model_engine.models[this.comp_blood2];
    if (!this._comp_blood1 || !this._comp_blood2) return;

    // calculate the blood composition of the blood components in this diffusor as we need the partial pressures for the gas diffusion
    calc_blood_composition(this._comp_blood1);
    calc_blood_composition(this._comp_blood2);

    // incorporate the factors
    this.dif_o2_step = this.dif_o2
        + (this.dif_o2_factor - 1) * this.dif_o2
        + (this.dif_o2_factor_ps - 1) * this.dif_o2
        + (this.dif_o2_factor_scaling - 1) * this.dif_o2;

    this.dif_co2_step = this.dif_co2
        + (this.dif_co2_factor - 1) * this.dif_co2
        + (this.dif_co2_factor_ps - 1) * this.dif_co2
        + (this.dif_co2_factor_scaling - 1) * this.dif_co2;

    let solutes_step = 1.0
        + (this.dif_solutes_factor - 1)
        + (this.dif_solutes_factor_ps - 1)
        + (this.dif_solutes_factor_scaling - 1);

    // diffuse the gases, where diffusion is partial pressure-driven. A failed acid-base / O2 solve
    // leaves po2/pco2 at the -1 sentinel, which would drive a spurious flux: skip that gas this step
    const b1 = this._comp_blood1;
    const b2 = this._comp_blood2;
    if (b1.po2 >= 0.0 && b2.po2 >= 0.0) {
      const do2 = (b1.po2 - b2.po2) * this.dif_o2_step * this._t;
      this._transfer(do2, () => b1.to2, (v) => (b1.to2 = v), () => b2.to2, (v) => (b2.to2 = v));
    }
    if (b1.pco2 >= 0.0 && b2.pco2 >= 0.0) {
      const dco2 = (b1.pco2 - b2.pco2) * this.dif_co2_step * this._t;
      this._transfer(dco2, () => b1.tco2, (v) => (b1.tco2 = v), () => b2.tco2, (v) => (b2.tco2 = v));
    }

    // diffuse the solutes, where the diffusion is concentration gradient-driven (dif_solutes in L/s:
    // the flux in mmol/s per mmol/L of gradient). A solute missing on either side is skipped
    Object.keys(this.dif_solutes).forEach((sol) => {
      const c1 = b1.solutes[sol];
      const c2 = b2.solutes[sol];
      if (typeof c1 !== "number" || typeof c2 !== "number") return;
      const dsol = (c1 - c2) * this.dif_solutes[sol] * solutes_step * this._t;
      this._transfer(dsol, () => b1.solutes[sol], (v) => (b1.solutes[sol] = v),
        () => b2.solutes[sol], (v) => (b2.solutes[sol] = v));
    });

    // reset the non-persistent factors
    this.dif_o2_factor = 1.0;
    this.dif_co2_factor = 1.0;
    this.dif_solutes_factor = 1.0;
  }

  // move `amount` (mmol, positive from blood1 to blood2) between the two compartments. The flux is
  // limited to what the donor holds (no concentration below zero), and a fixed-composition (infinite
  // reservoir) or empty compartment keeps its concentration; the other side still changes
  _transfer(amount, get1, set1, get2, set2) {
    const b1 = this._comp_blood1;
    const b2 = this._comp_blood2;
    const n1 = b1.vol > 0.0 ? get1() * b1.vol : 0.0;
    const n2 = b2.vol > 0.0 ? get2() * b2.vol : 0.0;
    const free1 = !b1.fixed_composition && b1.vol > 0.0;
    const free2 = !b2.fixed_composition && b2.vol > 0.0;
    if (amount > 0.0 && free1) amount = Math.min(amount, Math.max(n1, 0.0));
    if (amount < 0.0 && free2) amount = Math.max(amount, -Math.max(n2, 0.0));
    if (free1) set1((n1 - amount) / b1.vol);
    if (free2) set2((n2 + amount) / b2.vol);
  }
}
