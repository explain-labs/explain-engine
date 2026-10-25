import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Glucose class is the blood-glucose / insulin controller — a slow process model in the same
  family as `Hormones`, `Kidneys` and `Drugs`: it holds no compartment of its own, resolves
  references lazily, runs on an `_update_interval`, owns its source/sink while enabled, and
  auto-seeds itself so a scenario shipping it is NEUTRAL at rest (arterial glucose holds at its
  set-point, insulin/counter-reg == 1.0, total body glucose mass conserved). It only diverges on
  perturbation — IV dextrose (via the existing `Fluids` mechanism), a clamped hepatic output, or a
  changed utilization rate.

  `glucose` is a new blood solute (mmol/L). It advects through the whole circuit for free via the
  engine's existing `volume_in` solute mixing (BloodCapacitance/HeartChamber), exactly like Na/K —
  the controller only seeds the key and adjusts its source/sink. (A scenario should also list
  "glucose" in Blood.solutes so every compartment starts seeded; the lazy seed below is a safety net.)

  CAUSAL LOOP:
    SOURCE — endogenous hepatic glucose production added to the central vein (`IVCI`):
               prod_step = (hgp_rate/60) * weight * dt * production_factor      [mmol]
    SINK   — peripheral utilization distributed over the SAME compartments and fractions Metabolism
             uses (its `metabolic_active_models`), scaled by insulin-stimulated uptake:
               use_step  = (glu_use_rate/60) * weight * dt * uptake_factor      [mmol], split by fvo2
    CONTROL — insulin rises with hyperglycemia (↑uptake, ↓hepatic output); counter-regulation rises
              with hypoglycemia (↑hepatic output). At the set-point both == 1.0 and (with the default
              hgp_rate == glu_use_rate) production exactly balances utilization → neutral at rest.

  Deliberately NOT added to Kidneys.filterable_solutes (no glucosuria in this version).
*/

export class Glucose extends BaseModelClass {
  // static properties
  static model_type = "Glucose";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.glucose_running = true; // master gate (false → source/sink off, insulin/counterreg → 1.0)

    // -----------------------------------------------
    // wiring (resolved lazily)
    this.metabolism_name = "Metabolism"; // supplies the consumption-site map (metabolic_active_models)
    this.injection_site = "IVCI"; // central vein receiving endogenous hepatic glucose output
    this.plasma_model = "AA"; // representative arterial plasma whose glucose drives the controller

    // -----------------------------------------------
    // fluxes (neonatal scale) — mmol/kg/min
    this.glu_use_rate = 0.03; // peripheral glucose utilization (~5.4 mg/kg/min)
    this.hgp_rate = 0.03; // hepatic glucose production (default == utilization → neutral at rest)

    // set-point + controller dynamics (1.0 = baseline activity)
    this.glucose_setpoint = 0.0; // mmol/L; a stored value is kept, <= 0 → auto-seeded to the resting arterial value
    this.insulin_gain = 0.54; // insulin drive per fractional glucose excess (newborn: blunted secretion; a dextrose load decays at ~1.5 %/min)
    this.insulin_suppression_gain = 6.0; // insulin fall per fractional glucose deficit (suppression stays prompt)
    this.counterreg_gain = 6.0; // counter-regulatory drive per fractional glucose deficit
    this.insulin_tc = 120.0; // s — insulin responds over a couple of minutes
    this.counterreg_tc = 120.0; // s

    // effector sensitivities + clamps
    this.uptake_insulin_gain = 1.0; // uptake-factor rise per (insulin - 1)
    this.hgp_insulin_gain = 0.8; // hepatic-output suppression per (insulin - 1)
    this.hgp_counterreg_gain = 2.0; // hepatic-output rise per (counterreg - 1)
    this.hormone_min = 0.0;
    this.hormone_max = 10.0;
    this.uptake_factor_min = 0.1;
    this.uptake_factor_max = 5.0;
    this.production_factor_min = 0.0;
    this.production_factor_max = 8.0;
    this.glucose_default = 4.0; // value used to seed the solute key where it is missing

    // interstitial pool: glucose distributes through the extracellular fluid, not only the blood. The
    // pool exchanges with the blood at the consumption sites (same shares as the uptake)
    this.isf_volume = 0.31; // L/kg — interstitial fluid (term ECF ~0.40 L/kg minus the blood)
    this.isf_tc = 300.0; // s — time constant of the interstitial pool's equilibration with the blood
    this.isf_glucose = 0.0; // mmol/L — interstitial glucose (state); <= 0 → seeded at the sites' mean

    // insulin-independent uptake (brain: GLUT1/3), saturable at low glucose: uptake x
    // (G/(Km+G)) / (Gs/(Km+Gs)) with Gs the set-point
    this.insulin_independent_sites = ["BR_CAP"];
    this.independent_km = 1.0; // mmol/L

    // -----------------------------------------------
    // dependent properties (read-outs)
    this.glucose = 4.0; // sensed arterial glucose (mmol/L)
    this.insulin = 1.0; // insulin activity (1.0 = baseline)
    this.counterreg = 1.0; // counter-regulatory activity (1.0 = baseline)
    this.uptake_factor = 1.0; // applied insulin-stimulated uptake factor
    this.production_factor = 1.0; // applied hepatic-output factor
    this.glucose_use_step = 0.0; // last per-update total utilization (mmol)
    this.glucose_prod_step = 0.0; // last per-update total production (mmol)

    // -----------------------------------------------
    // local parameters
    this._update_interval = 1.0; // controller cadence (s)
    this._update_counter = 0.0;
    this._warmup_delay = 30.0; // s before the set-point auto-seed (let the arterio-venous gradient settle)
    this._warmup_counter = 0.0;
    this._seeded = false;
    this._keys_seeded = false;
    this._was_active = false;
    this._metabolism = null;
    this._plasma = null;
    this._inject = null;
  }

  init_model(args = []) {
    super.init_model(args);
    // a scenario that stores its set-point is neutral from the first step, without a warm-up re-seed
    this._seeded = this.glucose_setpoint > 0.0;
  }

  calc_model() {
    // master gate — relax to neutral once, then idle
    if (!this.glucose_running) {
      if (this._was_active) this._release();
      this._was_active = false;
      return;
    }

    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      const u = this._update_counter;
      this._update_counter = 0.0;
      this._update_glucose(u);
    }
    this._was_active = true;
  }

  _resolve_refs() {
    if (!this._metabolism) this._metabolism = this._model_engine.models[this.metabolism_name] ?? null;
    if (!this._plasma) this._plasma = this._model_engine.models[this.plasma_model] ?? null;
    if (!this._inject) this._inject = this._model_engine.models[this.injection_site] ?? null;
  }

  // make sure every blood compartment carries the glucose key (safety net; a scenario normally
  // ships "glucose" in Blood.solutes so this is a no-op after the first call)
  _seed_keys() {
    for (const name in this._model_engine.models) {
      const m = this._model_engine.models[name];
      if (m && m.solutes && m.solutes.glucose === undefined && m.blood_pool !== false) {
        m.solutes.glucose = this.glucose_default;
      }
    }
    this._keys_seeded = true;
  }

  _update_glucose(u) {
    this._resolve_refs();
    if (!this._keys_seeded) this._seed_keys();
    const weight = this._model_engine.weight;

    // --- sense arterial glucose ---
    if (this._plasma?.solutes) this.glucose = this._plasma.solutes.glucose ?? this.glucose;

    // auto-seed the set-point to the resting arterial value (neutral at rest)
    if (!this._seeded) {
      this._warmup_counter += u;
      if (this._warmup_counter >= this._warmup_delay) {
        this.glucose_setpoint = this.glucose;
        this._seeded = true;
      }
    }

    // --- controller (insulin vs counter-regulation) ---
    const glu_err = this.glucose_setpoint > 0 ? (this.glucose - this.glucose_setpoint) / this.glucose_setpoint : 0.0;
    // secretion above the set-point is blunted in the newborn; suppression below it stays prompt
    const ins_gain = glu_err > 0.0 ? this.insulin_gain : this.insulin_suppression_gain;
    const insulin_target = this._clamp(1.0 + ins_gain * glu_err, this.hormone_min, this.hormone_max);
    // counter-regulation defends against hypoglycaemia only; above the set-point hepatic output is
    // suppressed through insulin alone (a falling counter-regulation there double-counted that
    // suppression and cleared a dextrose load at ~20 %/min)
    const counterreg_target = this._clamp(1.0 - this.counterreg_gain * Math.min(glu_err, 0.0), this.hormone_min, this.hormone_max);
    this.insulin = this._lag(this.insulin, insulin_target, u, this.insulin_tc);
    this.counterreg = this._lag(this.counterreg, counterreg_target, u, this.counterreg_tc);

    this.uptake_factor = this._clamp(1.0 + this.uptake_insulin_gain * (this.insulin - 1.0), this.uptake_factor_min, this.uptake_factor_max);
    this.production_factor = this._clamp(1.0 - this.hgp_insulin_gain * (this.insulin - 1.0) + this.hgp_counterreg_gain * (this.counterreg - 1.0), this.production_factor_min, this.production_factor_max);

    // --- SINK: utilization, distributed like Metabolism's VO2. Insulin scales the uptake of the other
    // tissues; the insulin-independent sites (brain) take a saturable share that falls only at low glucose
    const use_base = (this.glu_use_rate * weight / 60.0) * u; // mmol over this update at baseline
    const km = this.independent_km;
    const gs = this.glucose_setpoint > 0 ? this.glucose_setpoint : this.glucose;
    const independent_factor = gs > 0 ? (this.glucose / (km + this.glucose)) / (gs / (km + gs)) : 1.0;
    const sites = this._metabolism?.metabolic_active_models ?? {};
    let use_total = 0.0;
    for (const [site, fvo2] of Object.entries(sites)) {
      let comp = this._model_engine.models[site];
      if (!comp || !comp.solutes || comp.vol <= 0.0) continue;
      const f = this.insulin_independent_sites.includes(site) ? independent_factor : this.uptake_factor;
      const want = use_base * fvo2 * f; // mmol to remove from this site
      const dmol = Math.min(want, Math.max(comp.solutes.glucose * comp.vol, 0.0));
      comp.solutes.glucose = (comp.solutes.glucose * comp.vol - dmol) / comp.vol;
      use_total += dmol;
    }
    this.glucose_use_step = use_total;

    // --- interstitial pool: first-order exchange with the blood at the same sites ---
    this._exchange_isf(sites, weight, u);

    // --- SOURCE: endogenous hepatic glucose output into the central vein ---
    if (this._inject?.solutes && this._inject.vol > 0.0) {
      const prod_total = (this.hgp_rate * weight / 60.0) * u * this.production_factor; // mmol
      this.glucose_prod_step = prod_total;
      this._inject.solutes.glucose += prod_total / this._inject.vol;
    }
  }

  _exchange_isf(sites, weight, u) {
    const v_isf = this.isf_volume * weight; // L
    if (!(v_isf > 0.0) || !(this.isf_tc > 0.0)) return;
    // seed at the share-weighted mean site concentration, so the exchange is zero at rest
    if (!(this.isf_glucose > 0.0)) {
      let c = 0.0, w = 0.0;
      for (const [site, share] of Object.entries(sites)) {
        const comp = this._model_engine.models[site];
        if (comp?.solutes?.glucose === undefined) continue;
        c += share * comp.solutes.glucose; w += share;
      }
      this.isf_glucose = w > 0 ? c / w : this.glucose;
    }
    // exchange conductance (L/s) so that the pool alone relaxes with isf_tc; limited per step so the
    // explicit update cannot overshoot either side
    const g = v_isf / this.isf_tc;
    let to_isf = 0.0;
    for (const [site, share] of Object.entries(sites)) {
      const comp = this._model_engine.models[site];
      if (!comp?.solutes || comp.vol <= 0.0) continue;
      const gs = Math.min(g * share * u, 0.5 * comp.vol, 0.5 * v_isf * share); // L-equivalent this update
      const dmol = gs * (comp.solutes.glucose - this.isf_glucose);
      comp.solutes.glucose -= dmol / comp.vol;
      to_isf += dmol;
    }
    this.isf_glucose += to_isf / v_isf;
  }

  _release() {
    this.insulin = 1.0;
    this.counterreg = 1.0;
    this.uptake_factor = 1.0;
    this.production_factor = 1.0;
    this.glucose_use_step = 0.0;
    this.glucose_prod_step = 0.0;
  }

  _lag(x, target, u, tc) {
    if (tc > 0) return x + u * ((1.0 / tc) * (-x + target));
    return target;
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
