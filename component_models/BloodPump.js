import { BloodCapacitance } from "./BloodCapacitance";

export class BloodPump extends BloodCapacitance {
  // static properties
  static model_type = "BloodPump";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    this.pump_rpm = 0.0; // pump speed in rotations per minute
    this.pump_mode = 0; // pump mode (0=centrifugal, 1=roller pump)
    this.pump_pressure =  0.0
    this.inlet = ""; // name of the inlet BloodResistor
    this.outlet = ""; // name of the outlet BloodResistor
    this.pres_cc = 0.0; // external pressure from chest compressions (mmHg)
    this.pres_mus = 0.0; // external muscle pressure (mmHg)

    // local properties
    this._inlet = null; // holds a reference to the inlet BloodResistor
    this._outlet = null; // holds a reference to the outlet BloodResistor

  }


  calc_pressure() {
    // find the inlet and outlet resistors
    this._inlet = this._model_engine.models[this.inlet];
    this._outlet = this._model_engine.models[this.outlet];

    // calculate the recoil pressure
    this.pres_in = this.el_k_eff * Math.pow(this.vol - this.u_vol_eff, 2) + this.el_eff * (this.vol - this.u_vol_eff);

    // calculate the transmural pressure
    this.pres_tm = this.pres_in - this.pres_ext;

    // calculate the total pressure by incorporating the external pressures
    this.pres = this.pres_in + this.pres_ext + this.pres_cc + this.pres_mus;

    // reset the external pressures
    this.pres_ext = 0.0;
    this.pres_cc = 0.0;
    this.pres_mus = 0.0;

    // calculate the pump pressure and apply the pump pressures to the connected resistors
    // (guard against missing connectors so an unwired pump does not crash)
    this.pump_pressure = -this.pump_rpm / 25.0;
    if (this.pump_mode === 0) {
      if (this._inlet) {
        this._inlet.p1_ext = 0.0;
        this._inlet.p2_ext = this.pump_pressure;
      }
    } else {
      if (this._outlet) {
        this._outlet.p1_ext = this.pump_pressure;
        this._outlet.p2_ext = 0.0;
      }
    }
  }
}
