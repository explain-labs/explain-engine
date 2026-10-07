import { Capacitance } from "../base_models/Capacitance";

// This class represents a gas capacitance model, which is a subclass of the Capacitance class.
// This class adds functionality to handle gas-specific properties such as temperature, humidity ans gas concentrations.

export class GasCapacitance extends Capacitance {
  // static properties
  static model_type = "GasCapacitance";

  constructor(model_ref, name = "") {
    // call the parent constructor
    super(model_ref, name);

    // initialize independent properties unique to a GasCapacitance
    this.pres_atm = 760; // atmospheric pressure (mmHg)
    this.pres_cc = 0.0; // external pressure (mmHg)
    this.pres_mus = 0.0; // muscle pressure (mmHg)
    this.fixed_composition = false; // flag for fixed gas composition
    this.target_temp = 0.0; // target temperature (dgs C)
    this.h2o_tc = 0.2; // water vapour equilibration time constant (s)
    this.temp_tc = 1.0; // thermal equilibration time constant (s)

    // initialize dependent properties unique to a GasCapacitance
    this.ctotal = 0.0; // total gas molecule concentration (mmol/l)
    this.co2 = 0.0; // oxygen concentration (mmol/l)
    this.cco2 = 0.0; // carbon dioxide concentration (mmol/l)
    this.cn2 = 0.0; // nitrogen concentration (mmol/l)
    this.cother = 0.0; // other gases concentration (mmol/l)
    this.ch2o = 0.0; // water vapor concentration (mmol/l)
    this.pres_rel = 0.0; // pressure relative to atmospheric (mmHg)
    this.po2 = 0.0; // partial pressure of oxygen (mmHg)
    this.pco2 = 0.0; // partial pressure of carbon dioxide (mmHg)
    this.pn2 = 0.0; // partial pressure of nitrogen (mmHg)
    this.pother = 0.0; // partial pressure of other gases (mmHg)
    this.ph2o = 0.0; // partial pressure of water vapor (mmHg)
    this.fo2 = 0.0; // fraction of oxygen of total gas volume
    this.fco2 = 0.0; // fraction of carbon dioxide of total gas volume
    this.fn2 = 0.0; // fraction of nitrogen of total gas volume
    this.fother = 0.0; // fraction of other gases of total gas volume
    this.fh2o = 0.0; // fraction of water vapor of total gas volume
    this.temp = 0.0; // gas temperature (dgs C)
    this.humidity = 1.0; // target relative humidity (fraction) the gas equilibrates toward

    // Series dead space (opt-in, configured by Respiration for the airway DS). With
    // series_segments > 1 the gas COMPOSITION is carried through a chain of sub-tanks instead of one
    // well-mixed volume, so gas moves through the airway as a plug: what enters at one end leaves the
    // other end later. Pressure and volume stay a single node, so the network is unchanged.
    this.series_segments = 1; // number of composition sub-tanks (1 = classic well-mixed compartment)
    this.distal_models = []; // neighbours at the distal end (the alveoli); every other one is proximal
    this.tube_port_model = ""; // neighbour reached through the ET-tube lumen (VENT_GASCIRCUIT)
    this.tube_volume = 0.0; // L, rigid ET-tube lumen ahead of the tube port (0 = not intubated)
    this.tube_segments = 3; // composition sub-tanks of the tube lumen
    this.dispersion_coeff = 0.0; // axial (Taylor-type) dispersion strength between sub-tanks (0 = none)
    this.dispersion_tau_max = 0.1; // s, cap on the dispersion mixing time

    // local properties
    this._gas_constant = 62.36367; // ideal gas law constant (L·mmHg/(mol·K))
    this._cp_molar = 29.1; // molar heat capacity of air at constant pressure (J/(mol·K))
    this._latent_h2o = 43400.0; // latent heat of vaporisation of water near 37 C (J/mol)

    // Energy this compartment has drawn from its wall since the last drain (J), metered by
    // add_heat / add_watervapour and consumed by Gas.drain_respiratory_heat -> Thermoregulation.
    // SIGNED: warming and evaporation take heat from the wall (positive), while gas cooling and
    // condensing give it back (negative) — that is how airway heat/water recovery on expiration is
    // credited. Underscore-prefixed on purpose: ModelEngine's state dump drops `_` keys, so these
    // stay out of scenario JSON and out of anything reseed_*.mjs bakes.
    this._q_wall_sensible = 0.0;
    this._q_wall_latent = 0.0;
  }

  // override the calc_model method from the Capoacitance class
  calc_model() {
    // series dead space: heat and water act on the bulk; replay the same change on every sub-tank
    const seg = this._seg_active();
    const pre = seg ? GasCapacitance.SPECIES.map((k) => this[k]) : null;

    // add heat to the gas
    this.add_heat();
    // add water vapor to the gas
    this.add_watervapour();

    if (seg) {
      this._seg_replay_bulk_change(pre);
      this._seg_disperse();
    }
    // calculate the elastance and volumes
    this.calc_elastances();
    this.calc_volumes();
    
    // calculate the pressure
    this.calc_pressure();

    // update the gas composition
    this.calc_gas_composition();
  }

  calc_pressure() {
    // call parent method to calculate the elastance
    super.calc_pressure();

    // incorporate the external pressures and atmospheric pressure
    this.pres = this.pres + this.pres_cc + this.pres_mus + this.pres_atm;
    this.pres_rel = this.pres - this.pres_atm

    // reset the external pressure
    this.pres_cc = 0.0;
    this.pres_mus = 0.0;
  }

  // the method overrides the 'volume_in' method of the Capacitance class and 
  volume_in(dvol, comp_from) {
    // a series dead space hands out the composition of the END the gas leaves from (and updates its
    // sub-tanks); every other compartment hands out its single well-mixed composition. This must
    // run before any early return, or the donor's sub-tanks would not see the outflow.
    const src = comp_from._seg_take ? comp_from._seg_take(this, dvol) : null;

    // call the parent method from the Capacitance class to update the volume
    super.volume_in(dvol, comp_from);

    // a fixed-composition compartment is an infinite reservoir: hold its composition
    // (and temperature) constant, just as the parent already holds its volume constant
    if (this.fixed_composition) return;

    // guard against division by zero on an empty compartment (would produce NaN concentrations)
    if (this.vol <= 0.0) return;

    // Gas is compressible, so a parcel crossing a pressure gradient expands (or is compressed):
    // the same molecules occupy a different volume here than they did in comp_from, and their
    // molar density scales by P_here / P_there. Mixing raw concentrations is only valid between
    // compartments at the same pressure — without this correction a pressurised source injects its
    // own molar density downstream, e.g. the 1160 mmHg ventilator supply driving the alveoli to
    // ~63 mmol/l where 760 mmHg at 37 C allows only ~40.
    //
    // Temperature is deliberately NOT folded in here: the parcel arrives at comp_from's
    // temperature, and add_heat performs the thermal expansion (and matching dilution) once the
    // compartment relaxes toward target_temp. Doing it here as well would double-count.
    //
    // This is a no-op (k = 1) between compartments at equal pressure, which is every pairing in
    // the model except the pressurised supplies. Those are all fixed_composition reservoirs whose
    // volume_out is a no-op, so no donor-side amount is contradicted by rescaling here.
    let k = 1.0;
    if (comp_from.pres > 0.0 && this.pres > 0.0) k = this.pres / comp_from.pres;

    // every species scales by the same k, so the gas FRACTIONS delivered are unchanged — this
    // corrects molar density only, never composition
    const in_co2 = (src ? src[0] : comp_from.co2) * k;
    const in_cco2 = (src ? src[1] : comp_from.cco2) * k;
    const in_cn2 = (src ? src[2] : comp_from.cn2) * k;
    const in_ch2o = (src ? src[3] : comp_from.ch2o) * k;
    const in_cother = (src ? src[4] : comp_from.cother) * k;

    // series dead space: the parcel enters the sub-tank chain at the end it arrives from
    if (this._seg_active()) {
      this._seg_receive(comp_from, dvol, [in_co2, in_cco2, in_cn2, in_ch2o, in_cother]);
      this.temp = (this.temp * this.vol + (comp_from.temp - this.temp) * dvol) / this.vol;
      return;
    }

    // process the changes in gas composition
    this.co2 = (this.co2 * this.vol + (in_co2 - this.co2) * dvol) / this.vol;
    this.cco2 = (this.cco2 * this.vol + (in_cco2 - this.cco2) * dvol) / this.vol;
    this.cn2 = (this.cn2 * this.vol + (in_cn2 - this.cn2) * dvol) / this.vol;
    this.ch2o = (this.ch2o * this.vol + (in_ch2o - this.ch2o) * dvol) / this.vol;
    this.cother = (this.cother * this.vol + (in_cother - this.cother) * dvol) / this.vol;

    // adjust temperature due to gas influx
    this.temp = (this.temp * this.vol + (comp_from.temp - this.temp) * dvol) / this.vol;
  }

  add_heat() {
    // a fixed-composition compartment is an infinite reservoir: it holds its temperature, just as
    // volume_in already holds its composition and temperature against advective mixing. without
    // this a heated gas supply would silently decay back to the ambient target it was built with
    if (this.fixed_composition) return;

    // relax the temperature toward the target over temp_tc seconds. the fraction is clamped so a
    // stepsize larger than the time constant can not overshoot into oscillation
    let frac = this.temp_tc > 0.0 ? Math.min(1.0, this._t / this.temp_tc) : 1.0;
    let dT = (this.target_temp - this.temp) * frac;

    // meter the sensible heat the wall had to supply for this temperature change. the amount is
    // taken BEFORE the expansion below, and summed from the species rather than ctotal, which
    // calc_gas_composition only refreshes at the end of calc_model and so lags a step here
    const n_gas = ((this.co2 + this.cco2 + this.cn2 + this.cother + this.ch2o) * this.vol) / 1000.0;
    this._q_wall_sensible += n_gas * this._cp_molar * dT;

    // add heat to the gas
    this.temp += dT;

    // expand (or contract) the gas for the temperature change via the ideal gas law. ctotal is
    // mmol/l, so ctotal * vol / 1000 is the amount in mol
    if (this.pres > 0.0) {
      let v0 = this.vol;
      let dV = (((this.ctotal * v0) / 1000.0) * this._gas_constant * dT) / this.pres;
      let v1 = v0 + dV;
      if (v1 > 0.0) {
        // heating moves no molecules in or out, so every concentration dilutes by v0/v1. without
        // this the compartment keeps its concentrations while growing, which creates gas from
        // nothing and leaves ctotal inconsistent with the ideal gas law
        let s = v0 / v1;
        this.co2 *= s;
        this.cco2 *= s;
        this.cn2 *= s;
        this.cother *= s;
        this.ch2o *= s;
        this.vol = v1;
      }
    }

    // ensure the volume does not go below zero
    if (this.vol < 0) this.vol = 0;
  }

  // Relax the water vapour content toward what this compartment's wall can sustain.
  //
  // Two distinct mechanisms, so the target is asymmetric:
  //   - EVAPORATION can raise ph2o up to humidity * pH2Ot. Here `humidity` is how wet the wall
  //     is: airway mucosa is 1.0, a dry medical gas line is 0.0.
  //   - CONDENSATION can lower ph2o, but only out of genuine supersaturation, and only down to
  //     pH2Ot. The condensate is discarded — there is no liquid reservoir in this model.
  // Between the two the wall is neither source nor sink, so nothing happens. That dead band is
  // what stops a dry gas line from acting as a dehumidifier on wet gas that flows into it. For a
  // saturated wall (humidity 1.0) the band has zero width and this reduces to "track saturation".
  add_watervapour() {
    // a fixed-composition compartment is an infinite reservoir, so hold its water content
    if (this.fixed_composition || this.vol <= 0.0 || !(this.pres > 0.0)) return;

    let pH2Ot = this.calc_watervapour_pressure();
    let p_evap = pH2Ot * Math.min(1.0, Math.max(0.0, this.humidity));

    let p_target;
    if (this.ph2o > pH2Ot) p_target = pH2Ot; // supersaturated -> condense
    else if (this.ph2o < p_evap) p_target = p_evap; // subsaturated -> evaporate
    else return; // dead band

    // a saturation pressure at or above the total pressure means the gas is boiling, where the
    // partial-pressure formulation breaks down
    if (p_target >= this.pres) return;

    // the water concentration that yields p_target against the current dry gas load, solved
    // directly rather than iterated: ch2o / (c_dry + ch2o) * pres == p_target
    let c_dry = this.co2 + this.cco2 + this.cn2 + this.cother;
    if (c_dry <= 0.0) return;
    let ch2o_target = (c_dry * p_target) / (this.pres - p_target);

    // relax over h2o_tc seconds. targeting a concentration rather than an absolute amount is what
    // makes the time constant independent of compartment size; the clamp keeps it stable when the
    // stepsize exceeds the time constant
    let frac = this.h2o_tc > 0.0 ? Math.min(1.0, this._t / this.h2o_tc) : 1.0;
    let dc = (ch2o_target - this.ch2o) * frac;

    // the evaporated (or condensed) water takes up volume
    let v0 = this.vol;
    let n_h2o = dc * v0; // mmol of water added, or removed when condensing

    // meter the latent heat the wall had to supply to evaporate this water (returned to the wall
    // when condensing, where n_h2o is negative). this is the dominant respiratory heat term
    this._q_wall_latent += (n_h2o / 1000.0) * this._latent_h2o;

    let dV = ((this._gas_constant * (273.15 + this.temp)) / this.pres) * (n_h2o / 1000.0);
    let v1 = v0 + dV;
    if (v1 <= 0.0) return;

    // only water crosses the wall, so the dry species keep their molecules and simply dilute into
    // the new volume. condensing gives n_h2o < 0 and v1 < v0, concentrating them instead
    let s = v0 / v1;
    this.co2 *= s;
    this.cco2 *= s;
    this.cn2 *= s;
    this.cother *= s;
    this.ch2o = (this.ch2o * v0 + n_h2o) / v1;
    this.vol = v1;
  }

  calc_watervapour_pressure() {
    // calculate the water vapor pressure based on the temperature
    return Math.exp(20.386 - 5132 / (this.temp + 273.15));
  }

  calc_gas_composition() {
    // calculate the total gas concentration
    this.ctotal = this.ch2o + this.co2 + this.cco2 + this.cn2 + this.cother;

    // series dead space: report the partial pressures and fractions of the airway-opening end (what a
    // capnograph samples); the bulk ctotal above still drives the gas law
    if (this._seg_active()) {
      const c = this._segs[this._seg_first_ds()].c;
      const ct = c[0] + c[1] + c[2] + c[3] + c[4];
      if (ct > 0.0) {
        this.po2 = (c[0] / ct) * this.pres;
        this.pco2 = (c[1] / ct) * this.pres;
        this.pn2 = (c[2] / ct) * this.pres;
        this.ph2o = (c[3] / ct) * this.pres;
        this.pother = (c[4] / ct) * this.pres;
        this.fo2 = c[0] / ct;
        this.fco2 = c[1] / ct;
        this.fn2 = c[2] / ct;
        this.fh2o = c[3] / ct;
        this.fother = c[4] / ct;
        return;
      }
    }

    // calculate the partial pressures and fractions of each gas
    // check if the total gas concentration is zero to avoid division by zero
    if (this.ctotal === 0.0) return;

    // calculate the partial pressures
    this.ph2o = (this.ch2o / this.ctotal) * this.pres;
    this.po2 = (this.co2 / this.ctotal) * this.pres;
    this.pco2 = (this.cco2 / this.ctotal) * this.pres;
    this.pn2 = (this.cn2 / this.ctotal) * this.pres;
    this.pother = (this.cother / this.ctotal) * this.pres;

    // calculate the fractions of each gas
    this.fh2o = this.ch2o / this.ctotal;
    this.fo2 = this.co2 / this.ctotal;
    this.fco2 = this.cco2 / this.ctotal;
    this.fn2 = this.cn2 / this.ctotal;
    this.fother = this.cother / this.ctotal;
  }

  // ---------------------------------------------------------------------------------------------
  // Series dead space. The chain is [tube lumen sub-tanks (rigid) ..., DS sub-tanks (compliant) ...],
  // ordered proximal -> distal. DS sub-tanks share the compartment volume equally; tube sub-tanks
  // have a fixed volume and only exist while intubated. Bulk concentrations (this.co2 ...) are kept
  // equal to the mean of the DS sub-tanks, so heat, water vapour and the gas law work unchanged.
  // ---------------------------------------------------------------------------------------------
  static SPECIES = ["co2", "cco2", "cn2", "ch2o", "cother"];

  _seg_active() {
    if (!(this.series_segments > 1)) return false;
    const n_t = this.tube_volume > 0.0 ? Math.max(1, Math.round(this.tube_segments)) : 0;
    const n = Math.round(this.series_segments);
    if (!this._segs || this._segs_n !== n || this._segs_nt !== n_t || this._segs_tv !== this.tube_volume) {
      this._seg_build(n, n_t);
    }
    return true;
  }

  _seg_build(n, n_t) {
    // (re)build the chain from the current bulk composition; a rebuild while running only happens
    // on a configuration change (intubation, tube size) and starts the new chain well mixed
    const c0 = GasCapacitance.SPECIES.map((k) => this[k]);
    this._segs = [];
    for (let i = 0; i < n_t; i++) this._segs.push({ rigid: true, v: this.tube_volume / n_t, c: [...c0] });
    for (let i = 0; i < n; i++) this._segs.push({ rigid: false, c: [...c0] });
    this._segs_n = n;
    this._segs_nt = n_t;
    this._segs_tv = this.tube_volume;
    this._seg_q = 0.0; // net proximal flow this step (L/s, + = towards distal)
    this._seg_t_rev = 0.0; // time since the proximal flow last reversed (s)
    this._seg_q_sign = 0;
  }

  _seg_first_ds() {
    return this._segs_nt;
  }

  _seg_port(model) {
    // which end of the chain a neighbour connects to
    const name = model?.name ?? "";
    if (this.distal_models.includes(name)) return "distal";
    if (this._segs_nt > 0 && name === this.tube_port_model) return "tube";
    return "airway";
  }

  _seg_sync_bulk() {
    const n = this._segs_n, f = this._segs_nt;
    for (let k = 0; k < 5; k++) {
      let sum = 0.0;
      for (let i = f; i < f + n; i++) sum += this._segs[i].c[k];
      this[GasCapacitance.SPECIES[k]] = sum / n;
    }
  }

  _mix(a, va, b, vb) {
    // concentration of va of a mixed with vb of b
    const v = va + vb;
    if (v <= 0.0) return a;
    return [0, 1, 2, 3, 4].map((k) => (a[k] * va + b[k] * vb) / v);
  }

  _ds_receive(from_distal, dvol, c_in, v_old) {
    // dvol enters one end of the compliant DS chain; every sub-tank grows by dvol/n, so the parcel
    // pushes gas along: tank j receives the running carry and passes on what it doesn't keep
    const n = this._segs_n, f = this._segs_nt, keep = dvol / n, v = v_old / n;
    let carry = c_in, amount = dvol;
    for (let s = 0; s < n; s++) {
      const t = this._segs[from_distal ? f + n - 1 - s : f + s];
      t.c = this._mix(t.c, v, carry, amount);
      carry = t.c;
      amount -= keep;
    }
  }

  _ds_remove(from_distal, dvol, v_old) {
    // dvol leaves one end of the DS chain; every sub-tank shrinks by dvol/n, so gas shifts towards
    // the exit. Uses the old compositions (explicit), exit tank first.
    const n = this._segs_n, f = this._segs_nt, v = v_old / n;
    const order = [];
    for (let s = 0; s < n; s++) order.push(this._segs[from_distal ? f + n - 1 - s : f + s]);
    const old = order.map((t) => t.c);
    for (let m = 0; m < n; m++) {
      const out = (dvol * (n - m)) / n;
      const inn = (dvol * (n - m - 1)) / n;
      const keepv = Math.max(v - out, 0.0);
      order[m].c = m + 1 < n ? this._mix(old[m], keepv, old[m + 1], inn) : old[m];
    }
  }

  _seg_receive(comp_from, dvol, c_in) {
    if (dvol <= 0.0) return;
    const port = this._seg_port(comp_from);
    const v_old = this.vol - dvol; // the parent has already added dvol
    if (port === "distal") {
      this._ds_receive(true, dvol, c_in, v_old);
      this._seg_q -= dvol / this._t;
    } else {
      let carry = c_in;
      if (port === "tube") {
        // rigid lumen: each sub-tank takes the parcel in and passes the same volume on
        for (let i = 0; i < this._segs_nt; i++) {
          const t = this._segs[i];
          t.c = this._mix(t.c, t.v, carry, dvol);
          carry = t.c;
        }
      }
      this._ds_receive(false, dvol, carry, v_old);
      this._seg_q += dvol / this._t;
    }
    this._seg_sync_bulk();
  }

  _seg_take(receiver, dvol) {
    // called by the receiving compartment: return the composition leaving through its end and
    // update the chain. The parent volume_out has already removed dvol from this.vol.
    if (!this._seg_active() || dvol <= 0.0) return null;
    const port = this._seg_port(receiver);
    const v_old = this.vol + dvol;
    let out;
    if (port === "distal") {
      out = [...this._segs[this._segs_nt + this._segs_n - 1].c];
      this._ds_remove(true, dvol, v_old);
      this._seg_q += dvol / this._t;
    } else if (port === "tube") {
      // rigid lumen shifts one parcel towards the tube port, refilled from the first DS sub-tank
      out = [...this._segs[0].c];
      for (let i = 0; i < this._segs_nt; i++) {
        const t = this._segs[i];
        const next = i + 1 < this._segs_nt ? this._segs[i + 1].c : this._segs[this._segs_nt].c;
        t.c = this._mix(t.c, Math.max(t.v - dvol, 0.0), next, dvol);
      }
      this._ds_remove(false, dvol, v_old);
      this._seg_q -= dvol / this._t;
    } else {
      out = [...this._segs[this._segs_nt].c];
      this._ds_remove(false, dvol, v_old);
      this._seg_q -= dvol / this._t;
    }
    this._seg_sync_bulk();
    return out;
  }

  _seg_replay_bulk_change(pre) {
    // add_heat / add_watervapour scale every dry species by one factor s and set water to s*old + b;
    // apply the same affine change to each sub-tank so the chain stays consistent with the bulk
    const s = pre[2] > 0.0 ? this.cn2 / pre[2] : 1.0;
    const b = this.ch2o - s * pre[3];
    for (const t of this._segs) {
      t.c[0] *= s;
      t.c[1] *= s;
      t.c[2] *= s;
      t.c[4] *= s;
      t.c[3] = t.c[3] * s + b;
    }
  }

  _seg_disperse() {
    // Axial dispersion between neighbouring sub-tanks: an exchanged volume e = coeff * q^2 * tau * dt /
    // V_seg per interface (the u^2 * tau form of Taylor-type dispersion written per segment, which
    // needs no airway geometry: A * dx = V_seg). tau is the time the flow has run in one direction,
    // capped, so fast oscillation (HFOV) disperses per cycle in proportion to f * Vt^2.
    const q = this._seg_q;
    this._seg_q = 0.0;
    const sign = q > 1e-9 ? 1 : q < -1e-9 ? -1 : 0;
    if (sign !== 0 && sign !== this._seg_q_sign) {
      this._seg_t_rev = 0.0;
      this._seg_q_sign = sign;
    } else {
      this._seg_t_rev += this._t;
    }
    if (!(this.dispersion_coeff > 0.0) || sign === 0) return;
    const tau = Math.min(this._seg_t_rev, this.dispersion_tau_max);
    const n = this._segs.length;
    const v_ds = this.vol / this._segs_n;
    for (let i = 0; i + 1 < n; i++) {
      const a = this._segs[i], b = this._segs[i + 1];
      const va = a.rigid ? a.v : v_ds, vb = b.rigid ? b.v : v_ds;
      const v_seg = Math.min(va, vb);
      if (!(v_seg > 0.0)) continue;
      // exchanged volume, capped at half the smaller sub-tank (fully mixed pair); mass-conserving
      // for unequal sub-tanks (tube lumen vs DS)
      const e = Math.min(0.5 * v_seg, (this.dispersion_coeff * q * q * tau * this._t) / v_seg);
      for (let k = 0; k < 5; k++) {
        const d = (b.c[k] - a.c[k]) * e;
        a.c[k] += d / va;
        b.c[k] -= d / vb;
      }
    }
    this._seg_sync_bulk();
  }
}
