import { BaseModelClass } from "../base_models/BaseModelClass";

export class Shunts extends BaseModelClass {
  // static properties
  static model_type = "Shunts";

  /*
    The Shunts class calculates the resistances of the shunts (ductus arteriosus, foramen ovale, and ventricular septal defect) from the diameter and length.
    It sets the resistances on the correct models representing the shunts.
    */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // initialize independent properties
    // -----------------------------------------------
    this.diameter_fo = 2.0; // diameter of the foramen ovale in mm
    this.diameter_fo_max = 10.0; 
    this.diameter_vsd = 2.0;
    this.diameter_vsd_max = 10.0;

    this.atrial_septal_width = 3.0; // width of the atrial septum in mm
    this.ventricular_septal_width = 5.0; // width of the ventricular septum in mm
    this.fo_lr_factor = 10.0;
    this.viscosity = 6.0; 

    this.ips_res = 5000; // resistance of the left intrapulmonary shunt in mmHg * s / L


    // -----------------------------------------------
    // initialize dependent properties
    // -----------------------------------------------
    this.flow_fo = 0.0; // flow through the foramen ovale in L/s
    this.flow_vsd = 0.0; // flow through the muscular ventricular septal defect in L/s

    this.velocity_fo = 0.0; // velocity of flow through the foramen ovale in m/s
    this.velocity_vsd = 0.0; // velocity of flow through the perimembranous ventricular septal defect in m/s
    
    this.res_fo = 500;
    this.res_vsd = 500;

    // -----------------------------------------------
    // initialize local properties (preceded with _)
    // -----------------------------------------------
    this._fo_ivci = null;
    this._fo_svc = null;
    this._vsd = null; // muscular ventricular septal defect
    this._ipsl = null; // left intrapulmonar shunt
    this._ipsr = null; // right intrapulmonar shunt
    this._refs_resolved = false;
    this._refs_warned = false;
  }

  _resolve_refs() {
    // Resolve sub-model references once. Returns true when all required
    // models are present and cached; false otherwise (caller should skip
    // this step). The first unresolved attempt emits a single console
    // warning so missing wiring is visible without flooding the log.
    const models = this._model_engine.models;
    const fo_ivci = models["LA_RAIVCI"];
    const fo_svc = models["LA_RASVC"];
    const vsd = models["VSD"];
    const ipsl = models["IPSL"];
    const ipsr = models["IPSR"];

    if (!fo_ivci || !fo_svc || !vsd || !ipsl || !ipsr) {
      if (!this._refs_warned) {
        const missing = [
          !fo_ivci && "LA_RAIVCI",
          !fo_svc && "LA_RASVC",
          !vsd && "VSD",
          !ipsl && "IPSL",
          !ipsr && "IPSR",
        ].filter(Boolean).join(", ");
        console.warn(`Shunts: required models not found (${missing}); skipping calc_model.`);
        this._refs_warned = true;
      }
      return false;
    }

    this._fo_ivci = fo_ivci;
    this._fo_svc = fo_svc;
    this._vsd = vsd;
    this._ipsl = ipsl;
    this._ipsr = ipsr;
    this._refs_resolved = true;
    return true;
  }

  calc_model() {
    if (!this._refs_resolved && !this._resolve_refs()) return;

    // guard for a too large diameters
    this.diameter_fo = Math.min(this.diameter_fo, this.diameter_fo_max);
    this.diameter_vsd = Math.min(this.diameter_vsd, this.diameter_vsd_max);

    // if the diameter is zero, set the resistance to a very high value to represent no flow
    this._fo_ivci.no_flow = this.diameter_fo === 0;
    this._fo_svc.no_flow = this.diameter_fo === 0;
    this._vsd.no_flow = this.diameter_vsd === 0;

    // calculate the resistance across the FO and VSD
    this.res_fo = this.calc_resistance(this.diameter_fo, this.atrial_septal_width, this.viscosity);
    this.res_vsd = this.calc_resistance(this.diameter_vsd, this.ventricular_septal_width, this.viscosity);

    // transfer the resistances to the models
    this._fo_ivci.r_for = this.res_fo * this.fo_lr_factor;
    this._fo_ivci.r_back = this.res_fo;

    this._fo_svc.r_for = this.res_fo * this.fo_lr_factor;
    this._fo_svc.r_back = this.res_fo;

    this._vsd.r_for = this.res_vsd;
    this._vsd.r_back = this.res_vsd;

    // intrapulmonary shunts are not diameter-driven: they carry a fixed resistance (ips_res)
    this._ipsl.r_for = this.ips_res;
    this._ipsl.r_back = this.ips_res;

    this._ipsr.r_for = this.ips_res;
    this._ipsr.r_back = this.ips_res;

    // get the flows
    this.flow_fo = this._fo_ivci.flow + this._fo_svc.flow;
    this.flow_vsd = this._vsd.flow;

    // calculate the area of the fo and vsd
    let area_fo = Math.pow((this.diameter_fo * 0.001) / 2.0, 2.0) * Math.PI;
    let area_vsd = Math.pow((this.diameter_vsd * 0.001) / 2.0, 2.0) * Math.PI;

    // calculate the velocities over the fo and vsd
    this.velocity_fo = area_fo > 0 ? (this.flow_fo * 0.001) / area_fo: 0.0;
    this.velocity_vsd = area_vsd > 0 ? (this.flow_vsd * 0.001) / area_vsd: 0.0;

  }

  calc_resistance(diameter, length = 2.0, viscosity = 6.0) {
    if (diameter > 0.0 && length > 0.0) {
      // resistance is calculated using Poiseuille's Law: R = (8 * n * L) / (PI * r^4)
      // diameter (mm), length (mm), viscosity (cP)

      // convert viscosity from centiPoise to Pa * s
      const n_pas = viscosity / 1000.0;

      // convert the length to meters
      const length_meters = length / 1000.0;

      // calculate radius in meters
      const radius_meters = diameter / 2 / 1000.0;

      // calculate the resistance Pa * s / m^3
      let res =
        (8.0 * n_pas * length_meters) / (Math.PI * Math.pow(radius_meters, 4));

      // convert resistance from Pa * s / m^3 to mmHg * s / L
      res = res * 0.00000750062;
      return res;
    } else {
      return 100000000; // a very high resistance to represent no flow
    }
  }
}
