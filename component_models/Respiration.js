import { BaseModelClass } from "../base_models/BaseModelClass";

const MMHG_TO_CMH2O = 1.35951;

// standard normal cumulative distribution (Abramowitz & Stegun 7.1.26 erf, |error| < 1.5e-7)
function phi(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const erf = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1.0 + erf) : 0.5 * (1.0 - erf);
}

/*
compliance of the chestwall 4.2 ml/cmH2O/kg => 0.00544 L/mmHg/kg => 0.01904 L/mmHg
-> elastance = 52.5 mmHg/L
*/
export class Respiration extends BaseModelClass {
  // static properties
  static model_type = "Respiration";

  /*
    The Respiration class is not a model but houses methods that influence groups of models. 
    These groups contain models related to the respiratory tract. For example, the method 
    `change_lower_airway_resistance` influences the resistance of the lower airways by 
    setting the `r_factor` of the `DS_ALL` and `DS_ALR` gas resistors stored in a list 
    called `lower_airways`.
    */
  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent properties
    // -----------------------------------------------
    this.upper_airways = ["MOUTH_DS"]
    this.lower_airways = ["DS_ALL", "DS_ALR"]
    this.lower_airways_left = ["DS_ALL"]
    this.lower_airways_right = ["DS_ALR"]
    this.dead_space = ["DS"]
    this.thorax = ["THORAX"]
    this.pleural_space_left = []
    this.pleural_space_right = []
    this.lungs = ["ALL", "ALR"]
    this.left_lung = ["ALL"]
    this.right_lung = ["ALR"]
    this.gas_echangers = ["GASEX_LL", "GASEX_RL"]
    this.gas_exchanger_left_lung = ["GASEX_LL"]
    this.gas_exchanger_right_lung = ["GASEX_RL"]
    this.intrapulmonary_shunt = ["IPS"]

    this.el_lungs_factor = 1.0;
    this.el_thorax_factor = 1.0;
    
    // series dead space (see GasCapacitance): composition sub-tanks in the dead space so it acts as
    // plug-flow (Fowler/Bohr) dead space, plus axial dispersion between them. 1 = classic well-mixed.
    this.dead_space_segments = 32;
    this.dead_space_dispersion = 0.015;

    this.res_upper_airways_factor = 1.0;
    this.res_lower_airways_factor = 1.0;

    this.gex_factor = 1.0

    // atelectasis: collapsed fraction of each lung (0 = fully aerated, clamped at atelectasis_max).
    // A collapsed unit loses its aerated volume, its share of the lung's compliance and its gas
    // exchange surface, while its blood keeps flowing past it unoxygenated (intrapulmonary shunt),
    // less the share that hypoxic pulmonary vasoconstriction diverts (atelectasis_hpv, 0..1).
    this.atelectasis_left = 0.0;
    this.atelectasis_right = 0.0;
    this.atelectasis_hpv = 0.3;
    this.atelectasis_max = 0.9;
    // recruitment: the collapsed units have normally distributed opening and closing pressures
    // (cmH2O, on the lung's distending pressure ALx.pres_in). Above its opening pressure a unit
    // reopens (tau_open), below its closing pressure it collapses again (tau_close); in between
    // it holds (hysteresis). Recruited units stay unstable: only PEEP keeps them open. Off =
    // obstructive/resorption atelectasis, which pressure does not reopen.
    this.atelectasis_recruitable = true;
    this.atelectasis_open_pressure = 25.0;
    this.atelectasis_open_sd = 3.0;
    this.atelectasis_close_pressure = 8.5;
    this.atelectasis_close_sd = 1.5;
    this.atelectasis_tau_open = 3.0;
    this.atelectasis_tau_close = 30.0;
    // bronchus obstruction (a mucus plug, or the left main bronchus behind a right-mainstem tube): no
    // gas in or out of that lung, and the trapped gas is absorbed into the blood, so the lung collapses
    // (resorption atelectasis). Oxygen absorbs fast and nitrogen slowly: the time constant runs from
    // tau_air (trapped room air) to tau_o2 (trapped oxygen) with the trapped gas's O2 fraction.
    this.airway_obstructed_left = false;
    this.airway_obstructed_right = false;
    this.atelectasis_resorb_tau_air = 1800.0;
    this.atelectasis_resorb_tau_o2 = 240.0;
    this.intrapulmonary_shunt_left = ["IPSL"]
    this.intrapulmonary_shunt_right = ["IPSR"]
    this.pulmonary_capillaries_left = ["LL_ART_LL_CAP", "LL_CAP_LL_VEN"]
    this.pulmonary_capillaries_right = ["RL_ART_RL_CAP", "RL_CAP_RL_VEN"]


    // -----------------------------------------------
    // dependent properties
    // -----------------------------------------------


    // local properties
    this._update_interval = 0.015; // update interval (s)
    this._update_counter = 0.0; // update interval counter (s)
    this._prev_el_lungs_factor = 1.0;
    this._prev_el_thorax_factor = 1.0;
    this._prev_gex_factor = 1.0;
    this._prev_res_upper_airways_factor = 1.0;
    this._prev_res_lower_airways_factor = 1.0;
    this._prev_atelectasis_left = 0.0;
    this._prev_atelectasis_right = 0.0;
    this._unstable_left = 0.0; // fraction of the lung's units prone to collapse (set with the atelectasis)
    this._unstable_right = 0.0;
    this._prev_airway_obstructed_left = false;
    this._prev_airway_obstructed_right = false;
    this._tube_block_left = false; // the bronchus is blocked by a misplaced tube (Ventilator), not a plug
    this._tube_block_right = false;
    this._closed_left = false; // effective state: plugged or blocked by the tube
    this._closed_right = false;
    this._trapped_fo2_left = 0.21; // O2 fraction of the trapped gas, captured at obstruction
    this._trapped_fo2_right = 0.21;
    this._trapped_pres_left = 0.0; // recoil pressure of the trapped lung, captured at obstruction (mmHg)
    this._trapped_pres_right = 0.0;
  }

  calc_model() {
    // the blood side of atelectasis rides on non-persistent resistor factors, so it is re-written
    // every step (not throttled); it is skipped entirely while both lungs are aerated
    if (this._prev_atelectasis_left > 0) this.apply_atelectasis_perfusion("left", this._prev_atelectasis_left);
    if (this._prev_atelectasis_right > 0) this.apply_atelectasis_perfusion("right", this._prev_atelectasis_right);

    this._update_counter += this._t;
    if (this._update_counter > this._update_interval) {
      const dt_update = this._update_counter;
      this._update_counter = 0.0;

      // series dead space configuration (live-editable): the dead-space compartments carry their
      // composition through sub-tanks, with the lungs as their distal end
      for (const name of this.dead_space) {
        const ds = this._model_engine.models[name];
        if (!ds) continue;
        ds.series_segments = this.dead_space_segments;
        ds.distal_models = this.lungs;
        ds.dispersion_coeff = this.dead_space_dispersion;
      }

      if (this._prev_el_lungs_factor !== this.el_lungs_factor) {
        // update the model
        this.set_el_lung_factor(this.el_lungs_factor)
        // store the current value
        this._prev_el_lungs_factor = this.el_lungs_factor
      }

      if (this._prev_el_thorax_factor !== this.el_thorax_factor) {
        // update the model
        this.set_el_thorax_factor(this.el_thorax_factor)
        // store the current value
        this._prev_el_thorax_factor = this.el_thorax_factor
      }

      if (this._prev_res_upper_airways_factor !== this.res_upper_airways_factor) {
        this.set_upper_airway_resistance(this.res_upper_airways_factor)
        this._prev_res_upper_airways_factor = this.res_upper_airways_factor
      }

      if (this._prev_res_lower_airways_factor !== this.res_lower_airways_factor) {
        this.set_lower_airway_resistance(this.res_lower_airways_factor)
        this._prev_res_lower_airways_factor = this.res_lower_airways_factor
      }

      if (this._prev_gex_factor !== this.gex_factor) {
        this.set_gasexchange(this.gex_factor);
        this._prev_gex_factor = this.gex_factor;
      }

      if (this._prev_atelectasis_left !== this.atelectasis_left) this.set_atelectasis_left(this.atelectasis_left);
      if (this._prev_atelectasis_right !== this.atelectasis_right) this.set_atelectasis_right(this.atelectasis_right);

      if (this._prev_airway_obstructed_left !== this.airway_obstructed_left) this.set_airway_obstructed_left(this.airway_obstructed_left);
      if (this._prev_airway_obstructed_right !== this.airway_obstructed_right) this.set_airway_obstructed_right(this.airway_obstructed_right);

      // an obstructed lung resorbs (pressure can't reach it); an open one recruits under pressure
      if (this._closed_left) this.resorb_atelectasis("left", dt_update);
      else if (this.atelectasis_recruitable && this._unstable_left > 0) this.recruit_atelectasis("left", dt_update);
      if (this._closed_right) this.resorb_atelectasis("right", dt_update);
      else if (this.atelectasis_recruitable && this._unstable_right > 0) this.recruit_atelectasis("right", dt_update);
    }
  }

  set_el_lung_factor(new_factor) {
    // el_base_factor_ps is a persistent factor accumulating effects from several models, so apply the
    // delta (not the absolute value). Compute it once so every lung gets the same change.
    const delta = new_factor - this._prev_el_lungs_factor;
    this.lungs.forEach(lung_name => {
      const m = this._model_engine.models[lung_name];
      if (!m) return;
      let f_ps = m.el_base_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.el_base_factor_ps = f_ps;
    });
    this.el_lungs_factor = new_factor;
  }

  set_el_thorax_factor(new_factor) {
    const delta = new_factor - this._prev_el_thorax_factor;
    this.thorax.forEach(thorax_name => {
      const m = this._model_engine.models[thorax_name];
      if (!m) return;
      let f_ps = m.el_base_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.el_base_factor_ps = f_ps;
    });
    this.el_thorax_factor = new_factor;
  }

  set_upper_airway_resistance(new_factor) {
    const delta = new_factor - this._prev_res_upper_airways_factor;
    this.upper_airways.forEach(uaw_name => {
      const m = this._model_engine.models[uaw_name];
      if (!m) return;
      let f_ps = m.r_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.r_factor_ps = f_ps;
    });
    this.res_upper_airways_factor = new_factor;
  }

  set_lower_airway_resistance(new_factor) {
    const delta = new_factor - this._prev_res_lower_airways_factor;
    this.lower_airways.forEach(law_name => {
      const m = this._model_engine.models[law_name];
      if (!m) return;
      let f_ps = m.r_factor_ps + delta;
      if (f_ps < 0) f_ps = 0;
      m.r_factor_ps = f_ps;
    });
    this.res_lower_airways_factor = new_factor;
  }

  set_gasexchange(new_factor) {
    const delta = new_factor - this._prev_gex_factor;
    this.gas_echangers.forEach(gex_name => {
      const m = this._model_engine.models[gex_name];
      if (!m) return;
      // the O2 and CO2 diffusion factors track the same target; clamp each at 0 independently
      let f_ps_o2 = m.dif_o2_factor_ps + delta;
      let f_ps_co2 = m.dif_co2_factor_ps + delta;
      if (f_ps_o2 < 0) f_ps_o2 = 0;
      if (f_ps_co2 < 0) f_ps_co2 = 0;
      m.dif_o2_factor_ps = f_ps_o2;
      m.dif_co2_factor_ps = f_ps_co2;
    });
    this.gex_factor = new_factor;
  }

  // the user entry point: sets the collapsed fraction AND the unstable region it defines, so 0
  // resolves the atelectasis completely
  set_atelectasis_left(new_fraction) {
    this.atelectasis_left = this._apply_atelectasis_gas("left", new_fraction, this._prev_atelectasis_left);
    this._prev_atelectasis_left = this.atelectasis_left;
    this._unstable_left = this.atelectasis_left;
  }

  set_atelectasis_right(new_fraction) {
    this.atelectasis_right = this._apply_atelectasis_gas("right", new_fraction, this._prev_atelectasis_right);
    this._prev_atelectasis_right = this.atelectasis_right;
    this._unstable_right = this.atelectasis_right;
  }

  // a bronchial plug (the user's): airway_obstructed_left/right
  set_airway_obstructed_left(state) {
    this.airway_obstructed_left = !!state;
    this._prev_airway_obstructed_left = this.airway_obstructed_left;
    this._update_bronchus("left");
  }

  set_airway_obstructed_right(state) {
    this.airway_obstructed_right = !!state;
    this._prev_airway_obstructed_right = this.airway_obstructed_right;
    this._update_bronchus("right");
  }

  // a misplaced tube blocking a main bronchus (set by the Ventilator), kept apart from the plug so
  // either can be cleared without opening a bronchus the other still blocks
  set_tube_block(side, state) {
    if (side === "left") this._tube_block_left = !!state;
    else this._tube_block_right = !!state;
    this._update_bronchus(side);
  }

  _update_bronchus(side) {
    const closed = side === "left"
      ? this.airway_obstructed_left || this._tube_block_left
      : this.airway_obstructed_right || this._tube_block_right;
    const was_closed = side === "left" ? this._closed_left : this._closed_right;
    const models = this._model_engine.models;
    const airways = side === "left" ? this.lower_airways_left : this.lower_airways_right;
    for (const name of airways) if (models[name]) models[name].no_flow = closed;
    if (closed && !was_closed) {
      // capture the trapped gas: its O2 fraction sets the resorption speed, its recoil pressure is held
      // while the gas is absorbed (the lung deflates instead of pressurising as it stiffens)
      const lungs = (side === "left" ? this.left_lung : this.right_lung).map((n) => models[n]).filter(Boolean);
      const n = Math.max(lungs.length, 1);
      const fo2 = lungs.reduce((sum, m) => sum + (m.fo2 ?? 0.21), 0) / n;
      const pres = lungs.reduce((sum, m) => sum + (m.pres_in ?? 0), 0) / n;
      if (side === "left") { this._trapped_fo2_left = fo2; this._trapped_pres_left = pres; }
      else { this._trapped_fo2_right = fo2; this._trapped_pres_right = pres; }
    }
    if (side === "left") this._closed_left = closed;
    else this._closed_right = closed;
  }

  resorb_atelectasis(side, dt) {
    // the trapped gas is absorbed: the collapsed fraction rises toward atelectasis_max. The collapsed
    // units join the unstable region, so once the bronchus is open again pressure can recruit them.
    const models = this._model_engine.models;
    const fo2 = side === "left" ? this._trapped_fo2_left : this._trapped_fo2_right;
    const share_o2 = Math.min(Math.max((fo2 - 0.21) / 0.79, 0.0), 1.0);
    const tau = this.atelectasis_resorb_tau_air + (this.atelectasis_resorb_tau_o2 - this.atelectasis_resorb_tau_air) * share_o2;
    const c_prev = side === "left" ? this._prev_atelectasis_left : this._prev_atelectasis_right;
    const c = c_prev + (this.atelectasis_max - c_prev) * Math.min(dt / Math.max(tau, dt), 1.0);
    if (side === "left") {
      this.atelectasis_left = this._apply_atelectasis_gas("left", c, c_prev);
      this._prev_atelectasis_left = this.atelectasis_left;
      this._unstable_left = Math.max(this._unstable_left, this.atelectasis_left);
    } else {
      this.atelectasis_right = this._apply_atelectasis_gas("right", c, c_prev);
      this._prev_atelectasis_right = this.atelectasis_right;
      this._unstable_right = Math.max(this._unstable_right, this.atelectasis_right);
    }
    // the absorbed gas leaves: hold the trapped lung at its captured recoil pressure (alveoli are
    // linear, el_k = 0), so it deflates as its aerated volume shrinks
    const p = side === "left" ? this._trapped_pres_left : this._trapped_pres_right;
    for (const name of side === "left" ? this.left_lung : this.right_lung) {
      const m = models[name];
      if (!m || !(m.el_eff > 0)) continue;
      const excess = m.vol - (m.u_vol_eff + Math.max(p, 0) / m.el_eff);
      if (excess > 0) m.volume_out(excess);
    }
  }

  recruit_atelectasis(side, dt) {
    // within the unstable region, x = collapsed share. At distending pressure p:
    //   can_stay_closed = 1 - PHI((p - TOP) / sd_open)    units whose opening pressure is above p
    //   must_close      = 1 - PHI((p - TCP) / sd_close)   units whose closing pressure is above p
    // x relaxes down to can_stay_closed (recruitment, tau_open) or up to must_close
    // (derecruitment, tau_close) and holds in between. The pressure is instantaneous, so the
    // recruitment follows the time spent at pressure (a sustained inflation beats brief breaths).
    const unstable = side === "left" ? this._unstable_left : this._unstable_right;
    const c_prev = side === "left" ? this._prev_atelectasis_left : this._prev_atelectasis_right;
    const lungs = (side === "left" ? this.left_lung : this.right_lung).map((n) => this._model_engine.models[n]).filter(Boolean);
    if (lungs.length === 0) return;
    const p = (lungs.reduce((sum, m) => sum + m.pres_in, 0) / lungs.length) * MMHG_TO_CMH2O;

    const can_stay_closed = 1.0 - phi((p - this.atelectasis_open_pressure) / Math.max(this.atelectasis_open_sd, 0.1));
    const must_close = 1.0 - phi((p - this.atelectasis_close_pressure) / Math.max(this.atelectasis_close_sd, 0.1));
    let x = c_prev / unstable;
    if (x > can_stay_closed) x += (can_stay_closed - x) * Math.min(dt / Math.max(this.atelectasis_tau_open, dt), 1.0);
    else if (x < must_close) x += (must_close - x) * Math.min(dt / Math.max(this.atelectasis_tau_close, dt), 1.0);
    else return;

    const c = Math.min(Math.max(x, 0.0), 1.0) * unstable;
    if (side === "left") {
      this.atelectasis_left = this._apply_atelectasis_gas("left", c, c_prev);
      this._prev_atelectasis_left = this.atelectasis_left;
    } else {
      this.atelectasis_right = this._apply_atelectasis_gas("right", c, c_prev);
      this._prev_atelectasis_right = this.atelectasis_right;
    }
  }

  _apply_atelectasis_gas(side, new_fraction, prev_fraction) {
    // gas side: with a fraction c of the lung's units collapsed, the aerated volume (u_vol) and the
    // exchange surface (dif) scale with the open fraction (1 - c), and the elastance with 1 / (1 - c)
    // (fewer units in parallel). Applied as deltas on the persistent layers, like the other set_*.
    const c = Math.min(Math.max(Number(new_fraction) || 0, 0), this.atelectasis_max);
    const open = (f) => 1.0 - f;
    const d_open = open(c) - open(prev_fraction);
    const d_el = 1.0 / open(c) - 1.0 / open(prev_fraction);
    const lungs = side === "left" ? this.left_lung : this.right_lung;
    const gasex = side === "left" ? this.gas_exchanger_left_lung : this.gas_exchanger_right_lung;
    lungs.forEach((name) => {
      const m = this._model_engine.models[name];
      if (!m) return;
      m.u_vol_factor_ps = Math.max(m.u_vol_factor_ps + d_open, 0);
      m.el_base_factor_ps = Math.max(m.el_base_factor_ps + d_el, 0);
    });
    gasex.forEach((name) => {
      const m = this._model_engine.models[name];
      if (!m) return;
      m.dif_o2_factor_ps = Math.max(m.dif_o2_factor_ps + d_open, 0);
      m.dif_co2_factor_ps = Math.max(m.dif_co2_factor_ps + d_open, 0);
    });
    return c;
  }

  apply_atelectasis_perfusion(side, c) {
    // blood side: the lung's arterial -> venous bed is the capillary path (gas-exchanging) in parallel
    // with the intrapulmonary shunt. Both see the same pressure drop, so their flow split equals their
    // conductance split. The collapsed units' perfusion moves to the shunt, except the share hypoxic
    // vasoconstriction (hpv) removes from the lung altogether:
    //   G_tot' = G_tot * (1 - c*hpv)
    //   s'     = s0 + (1 - s0) * c*(1 - hpv) / (1 - c*hpv)      (s0 = shunt share when aerated)
    // Written on the resistors' non-persistent r_factor (r_factor_ps belongs to Surfactant, the
    // scaling layer to the Calibrator/ModelScaler), computed against the persistent layers so it
    // composes with them.
    const models = this._model_engine.models;
    const shunts = (side === "left" ? this.intrapulmonary_shunt_left : this.intrapulmonary_shunt_right)
      .map((n) => models[n]).filter(Boolean);
    const caps = (side === "left" ? this.pulmonary_capillaries_left : this.pulmonary_capillaries_right)
      .map((n) => models[n]).filter(Boolean);
    if (shunts.length === 0 || caps.length === 0) return;

    // effective resistance without the non-persistent layer (Resistor's additive factor composition)
    const r_base = (r) => r.r_for * (r.r_factor_ps + r.r_factor_scaling_ps - 1.0);
    const g_ips = shunts.reduce((g, r) => g + (r.no_flow ? 0 : 1.0 / r_base(r)), 0);
    const r_cap = caps.reduce((sum, r) => sum + r_base(r), 0); // capillary path is in series
    if (!(r_cap > 0) || !(g_ips >= 0)) return;
    const g_cap = 1.0 / r_cap;
    const g_tot = g_ips + g_cap;

    const hpv = Math.min(Math.max(this.atelectasis_hpv, 0), 1);
    const s0 = g_ips / g_tot;
    const g_tot_new = g_tot * (1.0 - c * hpv);
    // without an open shunt path the collapsed units' blood can only be diverted, not shunted
    const s_new = g_ips > 0 ? s0 + (1.0 - s0) * (c * (1.0 - hpv)) / (1.0 - c * hpv) : 0.0;

    // scale every shunt and capillary resistor by the conductance ratio of its branch
    const k_ips = g_ips > 0 ? g_ips / (s_new * g_tot_new) : 1.0;
    const k_cap = g_cap / ((1.0 - s_new) * g_tot_new);
    if (g_ips > 0) shunts.forEach((r) => { r.r_factor = 1.0 + (k_ips - 1.0) * r_base(r) / r.r_for; });
    caps.forEach((r) => { r.r_factor = 1.0 + (k_cap - 1.0) * r_base(r) / r.r_for; });
  }
}
