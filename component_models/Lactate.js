import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Lactate class turns the previously-static `lact` blood solute into a hypoxia-driven product —
  a slow process model in the same family as `Hormones` / `Glucose`: it holds no compartment of its
  own, resolves references lazily, runs on an `_update_interval`, and is NEUTRAL at rest (no O2 debt
  → no production; lactate sits at its baseline → no net clearance), so a scenario shipping it keeps
  its baseline ABG. It only diverges when tissue oxygenation falls (shock, asphyxia, severe hypoxia).

  It writes ONLY `solutes.lact`, which the existing Stewart acid-base solver already consumes as a
  strong anion (BloodComposition: sid = na + k + 2*ca + 2*mg - cl - lact). Raising lact lowers the
  strong-ion difference → lower pH / HCO3 / BE — i.e. a lactic metabolic acidosis — with NO change
  to the solver. The model must therefore run AFTER Metabolism (which sets each tissue's to2 this
  step) and BEFORE Blood (which solves composition), i.e. inserted just after Metabolism in the
  scenario's model map.

  PER TISSUE SITE (reusing Metabolism's consumption map + whole-body VO2):
    O2 debt   — at warm-up each site's resting to2 is captured; threshold = threshold_frac * resting.
                anaerobic fraction = clamp((threshold - to2) / threshold, 0, 1)   (the Mob activation idiom)
    PRODUCTION— local_o2_demand = (0.039 * vo2 * weight / 60) * dt * fvo2   [mmol O2, as Metabolism uses]
                lactate produced (mmol) = anaerobic * local_o2_demand * lact_per_o2_deficit
                  (≈ 2 lactate per glucose / 6 O2 per glucose ⇒ ~0.33 mmol lactate per mmol O2 deficit)
                added to that compartment's solutes.lact (mmol/L).
    CLEARANCE — every blood compartment's lact relaxes first-order toward lact_baseline (Cori cycle /
                hepatic + renal handling): lact += (baseline - lact) * lact_clearance * dt.

  No feedback into the O2 sensors (Mob/ANS read to2, not pH), so there is no oscillation risk; the
  lact→pH coupling is one-directional.
*/

export class Lactate extends BaseModelClass {
  // static properties
  static model_type = "Lactate";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.lactate_running = true; // master gate (false → no production, clearance still settles to baseline once)

    // -----------------------------------------------
    // wiring (resolved lazily)
    this.metabolism_name = "Metabolism"; // supplies the tissue map (metabolic_active_models) + vo2

    // -----------------------------------------------
    // production / clearance parameters
    this.lact_baseline = 1.0; // resting blood lactate (mmol/L) — clearance target
    this.threshold_frac = 0.5; // anaerobic threshold as a fraction of each site's resting-MINIMUM to2
    this.lact_per_o2_deficit = 0.33; // mmol lactate produced per mmol unmet O2 demand
    this.lact_clearance = 0.002; // first-order clearance rate toward baseline (1/s, t1/2 ~6 min)
    this.prod_gain = 1.0; // overall scaler on production (clinical-tuning convenience)

    // -----------------------------------------------
    // dependent properties (read-outs)
    this.arterial_lactate = 1.0; // AA lactate read-out (mmol/L)
    this.total_production_step = 0.0; // last per-update total lactate produced (mmol)
    this.anaerobic_fraction_max = 0.0; // worst-site anaerobic fraction this update (0..1)

    // -----------------------------------------------
    // local parameters
    this._update_interval = 1.0; // controller cadence (s)
    this._update_counter = 0.0;
    this._warmup_delay = 90.0; // s window over which the resting-MINIMUM site to2 is captured (covers the
                               // slow tissue-to2 oscillations seen in abnormal-circulation/cyanotic scenarios)
    this._warmup_counter = 0.0;
    this._seeded = false;
    this._baseline_to2 = {}; // per-site resting to2 captured at warm-up
    this._blood_components = null; // cached list of compartments carrying a lact solute
    this._metabolism = null;
  }

  init_model(args) {
    super.init_model(args);
  }

  calc_model() {
    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      const u = this._update_counter;
      this._update_counter = 0.0;
      this._update_lactate(u);
    }
  }

  _resolve_refs() {
    if (!this._metabolism) this._metabolism = this._model_engine.models[this.metabolism_name] ?? null;
    if (!this._blood_components) {
      this._blood_components = [];
      for (const name in this._model_engine.models) {
        const m = this._model_engine.models[name];
        if (m && m.solutes && m.solutes.lact !== undefined) this._blood_components.push(m);
      }
    }
  }

  _update_lactate(u) {
    this._resolve_refs();
    const weight = this._model_engine.weight;
    const sites = this._metabolism?.metabolic_active_models ?? {};
    const vo2 = this._metabolism?.vo2 ?? 8.1;
    const vo2_factor = this._metabolism?.vo2_factor ?? 1.0;
    const vo2_temp_factor = this._metabolism?.vo2_temp_factor ?? 1.0;

    // Capture each site's resting to2 as the running MINIMUM across the warm-up window, then arm. Using
    // the minimum (not a single instant) makes the threshold sit below the operating trough, so the model
    // stays neutral at rest even in chronically hypoxic scenarios (cyanotic CHD) whose steady-state tissue
    // to2 is low and swings cyclically near the threshold. Production stays gated off until _seeded.
    if (!this._seeded) {
      this._warmup_counter += u;
      for (const site of Object.keys(sites)) {
        let comp = this._model_engine.models[site];
        if (comp && comp.model_type === "MicroVascularUnit") comp = this._model_engine.models[site + "_CAP"];
        if (!comp) continue;
        const prev = this._baseline_to2[site];
        this._baseline_to2[site] = prev === undefined ? comp.to2 : Math.min(prev, comp.to2);
      }
      if (this._warmup_counter >= this._warmup_delay) this._seeded = true;
    }

    // --- production under O2 debt (skip until seeded; before that it is neutral) ---
    let total_prod = 0.0;
    let max_anaerobic = 0.0;
    if (this._seeded && this.lactate_running) {
      for (const [site, fvo2] of Object.entries(sites)) {
        let comp = this._model_engine.models[site];
        if (comp && comp.model_type === "MicroVascularUnit") comp = this._model_engine.models[site + "_CAP"];
        if (!comp || !comp.solutes || comp.vol <= 0.0) continue;
        const resting = this._baseline_to2[site];
        if (resting === undefined || resting <= 0.0) continue;
        const threshold = this.threshold_frac * resting;
        const anaerobic = this._clamp((threshold - comp.to2) / threshold, 0.0, 1.0);
        if (anaerobic > max_anaerobic) max_anaerobic = anaerobic;
        if (anaerobic <= 0.0) continue;
        const local_o2_demand = (0.039 * vo2 * vo2_factor * vo2_temp_factor * weight / 60.0) * u * fvo2; // mmol O2
        const lact_mmol = anaerobic * local_o2_demand * this.lact_per_o2_deficit * this.prod_gain;
        comp.solutes.lact += lact_mmol / comp.vol;
        total_prod += lact_mmol;
      }
    }
    this.total_production_step = total_prod;
    this.anaerobic_fraction_max = max_anaerobic;

    // --- first-order clearance of every compartment toward baseline (Cori / hepatic + renal) ---
    const k = this.lact_clearance * u;
    if (k > 0) {
      for (const comp of this._blood_components) {
        comp.solutes.lact += (this.lact_baseline - comp.solutes.lact) * k;
      }
    }

    // arterial read-out
    const aa = this._model_engine.models["AA"];
    if (aa?.solutes) this.arterial_lactate = aa.solutes.lact;
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
