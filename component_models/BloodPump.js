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

    // pump head-flow (H-Q) characteristic (centrifugal) and roller flow-source parameters, mirroring
    // the live ECLS pump (device_models/Ecls.js). This class is standby — no scenario instantiates it —
    // but is kept consistent so it can be dropped into a circuit. Centrifugal head (mmHg) =
    // hq_a*(rpm/1000)^2 - hq_b*(rpm/1000)*Q - hq_c*Q^2 (Q in L/min); roller trims an integral drive to
    // hold Q_target = ml_per_rev*rpm/1000.
    this.pump_hq_a = 9.9; // head vs rpm^2 term (mmHg per krpm^2) — default matches Ecls PediMag fit
    this.pump_hq_b = 30.3; // head falloff vs rpm*flow (mmHg per krpm per L/min) — Euler-slip term
    this.pump_hq_c = 0.0; // head falloff vs flow^2 (mmHg per (L/min)^2); 0 in the datasheet fit
    this.roller_ml_per_rev = 1.5; // roller stroke volume (mL per revolution)
    this.roller_kp = 30.0; // roller flow-controller gain (mmHg per (L/min) error per step)
    this.roller_drive_max = 900.0; // clamp on roller drive pressure (mmHg)

    // local properties
    this._inlet = null; // holds a reference to the inlet BloodResistor
    this._outlet = null; // holds a reference to the outlet BloodResistor
    this._pump_flow_ema = 0.0; // short-EMA of pumped flow (L/min): the H-Q / roller controller input
    this._pump_flow_ema_tc = 0.3; // time constant (s) for that EMA
    this._roller_drive = 0.0; // integral-controller drive pressure (mmHg) for roller mode

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

    // pump drive: head-flow (H-Q) characteristic (centrifugal) or roller flow source, mirroring Ecls.
    // Flow input is a short EMA of the pumped flow (outlet resistor, L/min) — lagged feedback keeps the
    // operating point stable. Guard against missing connectors so an unwired pump does not crash.
    const q_lmin = this._outlet ? this._outlet.flow * 60.0 : 0.0;
    const dt = this._t > 0.0 ? this._t : 0.0005;
    const ema_frac = this._pump_flow_ema_tc > 0.0 ? Math.min(1.0, dt / this._pump_flow_ema_tc) : 1.0;
    this._pump_flow_ema += (q_lmin - this._pump_flow_ema) * ema_frac;
    const q = Math.max(0.0, this._pump_flow_ema);

    if (this.pump_mode === 0) {
      // centrifugal: rotodynamic head, clamped >= 0. Drive the inlet resistor's downstream (pump) node.
      const krpm = this.pump_rpm / 1000.0;
      const head = this.pump_hq_a * krpm * krpm - this.pump_hq_b * krpm * q - this.pump_hq_c * q * q;
      this.pump_pressure = -Math.max(head, 0.0);
      this._roller_drive = 0.0;
      if (this._inlet) { this._inlet.p1_ext = 0.0; this._inlet.p2_ext = this.pump_pressure; }
      if (this._outlet) { this._outlet.p1_ext = 0.0; this._outlet.p2_ext = 0.0; }
    } else {
      // roller: positive-displacement flow source. Integral controller holds Q_target regardless of
      // afterload. Drive the outlet resistor's downstream node (forward), not upstream.
      const q_target = this.roller_ml_per_rev * this.pump_rpm / 1000.0;
      this._roller_drive += this.roller_kp * (q_target - q);
      this._roller_drive = Math.min(Math.max(this._roller_drive, 0.0), this.roller_drive_max);
      this.pump_pressure = -this._roller_drive;
      if (this._outlet) { this._outlet.p1_ext = 0.0; this._outlet.p2_ext = this.pump_pressure; }
      if (this._inlet) { this._inlet.p1_ext = 0.0; this._inlet.p2_ext = 0.0; }
    }
  }
}
