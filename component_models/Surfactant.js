import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Surfactant class turns the previously-STATIC RDS lung phenotype (baked stiff alveoli + low FRC +
  reduced diffusion + intrapulmonary shunt) into a DYNAMIC, treatable process: pressure-driven alveolar
  recruitment / derecruitment with hysteresis, plus a surfactant-therapy response. It is a slow process
  controller in the same family as Hormones / Glucose / Lactate: it holds no compartment, resolves refs
  lazily, and is NEUTRAL at rest (a scenario that ships it keeps its calibrated RDS operating point), so
  it only changes things when PEEP/CPAP changes or surfactant is given.

  RECRUITMENT STATE — `open_fraction` [0..1], the fraction of alveoli that are open. Driven by the mean
  (breath-averaged) transpulmonary pressure P_tp = alveolar recoil pressure (GasCapacitance.pres_in,
  averaged over both lungs and smoothed over `pres_tc` s so tidal swings don't dominate):

    dOpen = [ k_open · max(0, P_tp − TOP) · (1 − open)   recruit above the opening threshold
            − k_close · max(0, TCP − P_tp) · open ] · dt  derecruit below the closing threshold

  Between TCP and TOP there is a hysteresis DEAD ZONE (open holds) — the signature of lung recruitment.

  AUTO-CENTERED THRESHOLDS (the robustness trick, like the Lactate min-to2 seed): at warm-up the baseline
  mean P_tp (P0) and open_fraction (f0) are captured, and the dead zone is centered on P0:

    TOP = P0 + open_margin  − surf_open_gain ·(surfactant − surf0)
    TCP = P0 − close_margin − surf_close_gain·(surfactant − surf0)

  so at the scenario's own baseline (surfactant == surf0, P_tp == P0) P0 sits inside the dead zone → open
  holds at f0 → the model is neutral & stable at ANY scenario's operating point with NO per-scenario
  threshold tuning. Raising PEEP pushes P_tp above TOP → recruit; losing PEEP pushes it below TCP →
  derecruit; SURFACTANT lowers TOP/TCP so the same airway pressure now recruits the lung.

  EFFECTS (all referenced to f0 so they are 1.0 at baseline). r = open_fraction − f0:
    ALL/ALR.el_base_factor   = 1 − el_gain·r     (recruit → more open units → lower elastance / compliant)
    ALL/ALR.u_vol_factor     = 1 + uvol_gain·r   (recruit → higher FRC)
    GASEX_*.dif_o2/co2_factor = 1 + dif_gain·r    (recruit → more gas-exchange surface)
    IPSL/IPSR.r_factor_ps    = 1 + ips_gain·r     (recruit → higher shunt resistance → less venous admixture)
  The first three use the NON-PERSISTENT factor layer (reset each step by the compartment, re-written
  here every step) so they compose with the Respiration controller, which owns the *_factor_ps layer.
  The shunt uses IPSL/IPSR's r_factor_ps (persistent) — owned here, released to 1.0 on disable.
*/

export class Surfactant extends BaseModelClass {
  // static properties
  static model_type = "Surfactant";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.surfactant_running = true; // master gate (false → owned channels released to neutral)

    // -----------------------------------------------
    // wiring (resolved lazily; these are runtime-built compartments)
    this.lung_models = ["ALL", "ALR"]; // alveolar GasCapacitance compartments
    this.gasex_models = ["GASEX_LL", "GASEX_RL"]; // alveolar-capillary gas exchangers
    this.shunt_models = ["IPSL", "IPSR"]; // intrapulmonary-shunt resistors (atelectasis venous admixture)

    // -----------------------------------------------
    // surfactant maturity [0..1]: 0 = severe deficiency (RDS), 1 = mature / fully treated. The baseline
    // value is captured as surf0; therapy raises it (lowering the recruitment thresholds).
    this.surfactant = 0.3;
    this.surfactant_target = null; // therapy target; null → hold at current value
    this.surfactant_tc = 180.0; // s — acute compliance/recruitment response develops over a few minutes

    // -----------------------------------------------
    // recruitment hysteresis (mmHg, relative to the captured baseline mean P_tp). The margins are kept
    // small and the surfactant gains large because the spontaneously-breathing preterm runs at a low
    // mean transpulmonary pressure (~1–3 mmHg), so a therapeutic dose must clearly pull the opening
    // threshold below the prevailing airway pressure to recruit.
    this.open_margin = 2.0; // P_tp must exceed P0 + this to recruit (at baseline surfactant)
    this.close_margin = 2.0; // P_tp must fall below P0 − this to derecruit
    this.surf_open_gain = 14.0; // mmHg the opening threshold drops per unit surfactant rise
    this.surf_close_gain = 12.0; // mmHg the closing threshold drops per unit surfactant rise
    this.k_open = 0.5; // recruitment rate (1/(mmHg·s))
    this.k_close = 0.5; // derecruitment rate (1/(mmHg·s))
    this.pres_tc = 4.0; // s — smoothing of the transpulmonary pressure (averages out tidal swings)

    // -----------------------------------------------
    // effect gains (per unit deviation of open_fraction from baseline f0) + clamps
    this.el_gain = 0.7; // elastance DROP per unit recruitment
    this.uvol_gain = 1.5; // FRC RISE per unit recruitment
    this.dif_gain = 2.0; // diffusion RISE per unit recruitment
    this.ips_gain = 6.0; // shunt-resistance RISE per unit recruitment (→ less shunt)
    this.el_factor_min = 0.2; this.el_factor_max = 3.0;
    this.uvol_factor_min = 0.3; this.uvol_factor_max = 3.0;
    this.dif_factor_min = 0.1; this.dif_factor_max = 5.0;
    this.ips_factor_min = 0.1; this.ips_factor_max = 30.0;

    // -----------------------------------------------
    // dependent properties (read-outs)
    this.open_fraction = 0.5; // recruited alveolar fraction
    this.transpulmonary_pressure = 0.0; // smoothed mean P_tp (mmHg)
    this.open_pressure = 0.0; // current TOP (mmHg)
    this.close_pressure = 0.0; // current TCP (mmHg)
    this.el_lung_factor = 1.0; // → ALL/ALR.el_base_factor
    this.uvol_lung_factor = 1.0; // → ALL/ALR.u_vol_factor
    this.dif_factor = 1.0; // → GASEX_*.dif_o2/co2_factor
    this.ips_factor = 1.0; // → IPSL/IPSR.r_factor_ps

    // -----------------------------------------------
    // local parameters
    this._warmup_delay = 30.0; // s before capturing the baseline P0 / f0
    this._warmup_counter = 0.0;
    this._seeded = false;
    this._p0 = 0.0; // captured baseline mean transpulmonary pressure
    this._f0 = 0.5; // captured baseline open_fraction (neutral reference)
    this._surf0 = 0.3; // captured baseline surfactant level
    this._ptp_smooth = null; // smoothed P_tp state
    this._was_active = false;
    this._lungs = null;
    this._gasex = null;
    this._shunts = null;
  }

  init_model(args) {
    super.init_model(args);
    this._surf0 = this.surfactant; // provisional; re-anchored at warm-up seed
  }

  calc_model() {
    // master gate — release owned channels once, then idle
    if (!this.surfactant_running) {
      if (this._was_active) this._release_channels();
      this._was_active = false;
      return;
    }
    this._resolve_refs();

    // --- surfactant therapy: first-order ramp toward the target (if any) ---
    if (this.surfactant_target != null && this.surfactant_tc > 0) {
      this.surfactant += this._t * ((1.0 / this.surfactant_tc) * (this.surfactant_target - this.surfactant));
    }

    // --- read & smooth the mean transpulmonary (alveolar recoil) pressure ---
    let p_sum = 0.0, n = 0;
    for (const lm of this._lungs) { if (lm) { p_sum += lm.pres_in; n++; } }
    const p_tp = n > 0 ? p_sum / n : 0.0;
    if (this._ptp_smooth === null) this._ptp_smooth = p_tp;
    this._ptp_smooth += this._t * ((1.0 / this.pres_tc) * (p_tp - this._ptp_smooth));
    this.transpulmonary_pressure = this._ptp_smooth;

    // --- seed the neutral baseline (P0, f0, surf0) once the circuit has settled ---
    if (!this._seeded) {
      this._warmup_counter += this._t;
      if (this._warmup_counter >= this._warmup_delay) {
        this._p0 = this._ptp_smooth;
        this._f0 = this.open_fraction;
        this._surf0 = this.surfactant;
        this._seeded = true;
      }
    }

    // --- hysteresis thresholds, auto-centered on the baseline pressure, lowered by surfactant ---
    const d_surf = this.surfactant - this._surf0;
    this.open_pressure = this._p0 + this.open_margin - this.surf_open_gain * d_surf;
    this.close_pressure = this._p0 - this.close_margin - this.surf_close_gain * d_surf;

    // --- recruit / derecruit (dead zone between TCP and TOP) — only after the baseline is seeded, so
    // open_fraction holds at its init value (= f0) during warm-up and the recruitment headroom is the
    // same for every scenario regardless of the warm-up pressure transient ---
    if (this._seeded) {
      const p = this._ptp_smooth;
      let d_open = 0.0;
      if (p > this.open_pressure) d_open += this.k_open * (p - this.open_pressure) * (1.0 - this.open_fraction);
      if (p < this.close_pressure) d_open -= this.k_close * (this.close_pressure - p) * this.open_fraction;
      this.open_fraction = this._clamp(this.open_fraction + d_open * this._t, 0.0, 1.0);
    }

    // --- map recruitment (relative to baseline f0) onto the lung-mechanics effector channels ---
    if (this._seeded) {
      const r = this.open_fraction - this._f0; // +ve = recruited above baseline, −ve = derecruited
      this.el_lung_factor = this._clamp(1.0 - this.el_gain * r, this.el_factor_min, this.el_factor_max);
      this.uvol_lung_factor = this._clamp(1.0 + this.uvol_gain * r, this.uvol_factor_min, this.uvol_factor_max);
      this.dif_factor = this._clamp(1.0 + this.dif_gain * r, this.dif_factor_min, this.dif_factor_max);
      this.ips_factor = this._clamp(1.0 + this.ips_gain * r, this.ips_factor_min, this.ips_factor_max);
    }
    this._apply_effectors();
    this._was_active = true;
  }

  _resolve_refs() {
    if (!this._lungs) this._lungs = this.lung_models.map((m) => this._model_engine.models[m] ?? null);
    if (!this._gasex) this._gasex = this.gasex_models.map((m) => this._model_engine.models[m] ?? null);
    if (!this._shunts) this._shunts = this.shunt_models.map((m) => this._model_engine.models[m] ?? null);
  }

  _apply_effectors() {
    // alveolar elastance + FRC via the NON-PERSISTENT layer (reset each step → re-written here every
    // step; composes additively with the Respiration controller, which owns the *_factor_ps layer)
    for (const lm of this._lungs) {
      if (!lm) continue;
      lm.el_base_factor = this.el_lung_factor;
      lm.u_vol_factor = this.uvol_lung_factor;
    }
    // alveolar-capillary diffusion (non-persistent layer on the gas exchangers)
    for (const ge of this._gasex) {
      if (!ge) continue;
      ge.dif_o2_factor = this.dif_factor;
      ge.dif_co2_factor = this.dif_factor;
    }
    // intrapulmonary shunt — IPSL/IPSR carry r_for/r_back from Shunts.ips_res; modulate the resistor's
    // PERSISTENT r_factor_ps (owned here, released on disable) so recruitment reduces venous admixture
    for (const sh of this._shunts) {
      if (!sh) continue;
      sh.r_factor_ps = this.ips_factor;
    }
  }

  _release_channels() {
    this._resolve_refs();
    this.el_lung_factor = 1.0;
    this.uvol_lung_factor = 1.0;
    this.dif_factor = 1.0;
    this.ips_factor = 1.0;
    for (const lm of this._lungs) { if (lm) { lm.el_base_factor = 1.0; lm.u_vol_factor = 1.0; } }
    for (const ge of this._gasex) { if (ge) { ge.dif_o2_factor = 1.0; ge.dif_co2_factor = 1.0; } }
    for (const sh of this._shunts) { if (sh) sh.r_factor_ps = 1.0; }
  }

  // dosing API (callable via callModelFunction / TaskScheduler): instill surfactant → ramp maturity up
  administer_surfactant(target = 1.0) {
    this.surfactant_target = this._clamp(target, 0.0, 1.0);
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
