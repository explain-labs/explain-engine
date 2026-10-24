// ModelScaler provides granular factor-based controls for scaling
// model parameters by subsystem: blood, heart, lung, and containers.
// A factor of 1.0 means no change, 0.5 means half, 2.0 means double.
//
// Each scaling group targets a predefined list of component names rather
// than scanning all models by type. This makes scaling explicit and
// predictable. The lists can be customized via the config object.

export default class ModelScaler {
  constructor(model, config = null) {
    this._model = model;
    this._config = config

    // tracking previous factor values for delta calculation
    this._prev = {
      blood_vol: 1.0,
      heart_vol: 1.0,
      lung_vol: 1.0,
      thorax_vol: 1.0,
      pericardium_vol: 1.0,
      blood_el: 1.0,
      blood_res: 1.0,
      pulm_el: 1.0,
      pulm_res: 1.0,
      pulm_uvol: 1.0,
      sys_el: 1.0,
      sys_res: 1.0,
      sys_uvol: 1.0,
      airway_el: 1.0,
      airway_uvol: 1.0,
      airway_upper_res: 1.0,
      airway_lower_res: 1.0,
      left_lung_el: 1.0,
      left_lung_res: 1.0,
      left_lung_uvol: 1.0,
      right_lung_el: 1.0,
      right_lung_res: 1.0,
      right_lung_uvol: 1.0,
      heart_el_min: 1.0,
      heart_el_max: 1.0,
      left_heart_el_min: 1.0,
      left_heart_el_max: 1.0,
      left_heart_uvol: 1.0,
      right_heart_el_min: 1.0,
      right_heart_el_max: 1.0,
      right_heart_uvol: 1.0,
      heart_res: 1.0,
      thorax_el: 1.0,
      pericardium_el: 1.0,
    };
  }

  // Apply a scaling delta to a specific factor property on a list of named components
  _apply(names, prop, factor) {
    for (const name of names) {
      const comp = this._model.models[name];
      if (comp && comp[prop] !== undefined) {
        comp[prop] = factor;
      }
    }
  }

  // --- VOLUME SCALING ---

  // Scale the raw vol and u_vol of a list of named components by delta (not the scaling layer)
  _scale_vol(names, delta) {
    for (const name of names) {
      const comp = this._model.models[name];
      if (!comp) continue;
      if (comp.vol !== undefined) {
        comp.vol *= delta;
        comp.u_vol *= delta;
      }
    }
  }

  // Scale all volumes (blood, heart, lung, thorax, pericardium
  scale_blood_volume(factor) {
    const delta = factor / this._prev.blood_vol;
    this._prev.blood_vol = factor;
    this._scale_vol(this._config.blood.volume, delta);
  }

  scale_heart_volume(factor) {
    const delta = factor / this._prev.heart_vol;
    this._scale_vol(this._config.heart.volume, delta);
    this._prev.heart_vol = factor;
  }

  scale_lung_volume(factor) {
    const delta = factor / this._prev.lung_vol;
    this._scale_vol(this._config.lung.volume, delta);
    this._prev.lung_vol = factor;
  }

  scale_thorax_volume(factor) {
    const delta = factor / this._prev.thorax_vol;
    this._scale_vol(this._config.thorax, delta);
    this._prev.thorax_vol = factor;
  }

  scale_pericardium_volume(factor) {
    const delta = factor / this._prev.pericardium_vol;
    this._scale_vol(this._config.pericardium, delta);
    this._prev.pericardium_vol = factor;
  }

  // --- BLOOD ---

  scale_blood_elastances(factor) {
    this._apply(this._config.blood.el_base, "el_base_factor_scaling_ps", factor);
    this._prev.blood_el = factor;
  }

  scale_blood_resistances(factor) {
    this._apply(this._config.blood.resistance, "r_factor_scaling_ps", factor);
    this._prev.blood_res = factor;
  }

  // --- PULMONARY ---

  scale_pulmonary_elastances(factor) {
    this._apply(this._config.blood_pulmonary.el_base, "el_base_factor_scaling_ps", factor);
    this._prev.pulm_el = factor;
  }

  scale_pulmonary_resistances(factor) {
    this._apply(this._config.blood_pulmonary.resistance, "r_factor_scaling_ps", factor);
    this._prev.pulm_res = factor;
  }

  scale_pulmonary_u_vol(factor) {
    this._apply(this._config.blood_pulmonary.el_base, "u_vol_factor_scaling_ps", factor);
    this._prev.pulm_uvol = factor;
  }

  // --- SYSTEMIC ---

  scale_systemic_elastances(factor) {
    this._apply(this._config.blood_systemic.el_base, "el_base_factor_scaling_ps", factor);
    this._prev.sys_el = factor;
  }

  scale_systemic_resistances(factor) {
    this._apply(this._config.blood_systemic.resistance, "r_factor_scaling_ps", factor);
    this._prev.sys_res = factor;
  }

  scale_systemic_u_vol(factor) {
    this._apply(this._config.blood_systemic.el_base, "u_vol_factor_scaling_ps", factor);
    this._prev.sys_uvol = factor;
  }

  // --- AIRWAY (dead space + conducting airways) ---

  scale_airway_elastances(factor) {
    this._apply(this._config.airway.el_base, "el_base_factor_scaling_ps", factor);
    this._prev.airway_el = factor;
  }

  scale_airway_u_vol(factor) {
    this._apply(this._config.airway.u_vol, "u_vol_factor_scaling_ps", factor);
    this._prev.airway_uvol = factor;
  }

  scale_airway_upper_resistances(factor) {
    this._apply(this._config.airway.resistance_upper, "r_factor_scaling_ps", factor);
    this._prev.airway_upper_res = factor;
  }

  scale_airway_lower_resistances(factor) {
    this._apply(this._config.airway.resistance_lower, "r_factor_scaling_ps", factor);
    this._prev.airway_lower_res = factor;
  }

  // --- LEFT LUNG ---

  scale_left_lung_elastances(factor) {
    this._apply(this._config.left_lung.el_base, "el_base_factor_scaling_ps", factor);
    this._prev.left_lung_el = factor;
  }

  scale_left_lung_resistances(factor) {
    this._apply(this._config.left_lung.resistance, "r_factor_scaling_ps", factor);
    this._prev.left_lung_res = factor;
  }

  scale_left_lung_u_vol(factor) {
    this._apply(this._config.left_lung.u_vol, "u_vol_factor_scaling_ps", factor);
    this._prev.left_lung_uvol = factor;
  }

  // --- RIGHT LUNG ---

  scale_right_lung_elastances(factor) {
    this._apply(this._config.right_lung.el_base, "el_base_factor_scaling_ps", factor);
    this._prev.right_lung_el = factor;
  }

  scale_right_lung_resistances(factor) {
    this._apply(this._config.right_lung.resistance, "r_factor_scaling_ps", factor);
    this._prev.right_lung_res = factor;
  }

  scale_right_lung_u_vol(factor) {
    this._apply(this._config.right_lung.u_vol, "u_vol_factor_scaling_ps", factor);
    this._prev.right_lung_uvol = factor;
  }

  // --- HEART ---

  scale_heart_el_min(factor) {
    this._apply(this._config.heart.el_min, "el_min_factor_scaling_ps", factor);
    this._prev.heart_el_min = factor;
  }

  scale_heart_el_max(factor) {
    this._apply(this._config.heart.el_max, "el_max_factor_scaling_ps", factor);
    this._prev.heart_el_max = factor;
  }

  // --- LEFT HEART ---

  scale_left_heart_el_min(factor) {
    this._apply(this._config.heart_left.el_min, "el_min_factor_scaling_ps", factor);
    this._prev.left_heart_el_min = factor;
  }

  scale_left_heart_el_max(factor) {
    this._apply(this._config.heart_left.el_max, "el_max_factor_scaling_ps", factor);
    this._prev.left_heart_el_max = factor;
  }

  scale_left_heart_u_vol(factor) {
    this._apply(this._config.heart_left.el_min, "u_vol_factor_scaling_ps", factor);
    this._prev.left_heart_uvol = factor;
  }

  // --- RIGHT HEART ---

  scale_right_heart_el_min(factor) {
    this._apply(this._config.heart_right.el_min, "el_min_factor_scaling_ps", factor);
    this._prev.right_heart_el_min = factor;
  }

  scale_right_heart_el_max(factor) {
    this._apply(this._config.heart_right.el_max, "el_max_factor_scaling_ps", factor);
    this._prev.right_heart_el_max = factor;
  }

  scale_right_heart_u_vol(factor) {
    this._apply(this._config.heart_right.el_min, "u_vol_factor_scaling_ps", factor);
    this._prev.right_heart_uvol = factor;
  }

  scale_heart_resistances(factor) {
    this._apply(this._config.heart.resistance, "r_factor_scaling_ps", factor);
    this._prev.heart_res = factor;
  }

  // --- CONTAINERS ---

  scale_thorax_elastances(factor) {
    this._apply(this._config.thorax, "el_base_factor_scaling_ps", factor);
    this._prev.thorax_el = factor;
  }

  scale_pericardium_elastances(factor) {
    this._apply(this._config.pericardium, "el_base_factor_scaling_ps", factor);
    this._prev.pericardium_el = factor;
  }

  // --- INCORPORATE ---

  // Bake all scaling factors into base properties, then reset factors to 1.0. Every component named
  // anywhere in the scaler config is baked on every scaling layer it carries (_bake skips a layer the
  // component doesn't have or that is at 1.0), so no group can be missed and a group the scenario's
  // config doesn't define can't throw
  incorporate() {
    const names = new Set();
    const collect = (v) => {
      if (Array.isArray(v)) v.forEach((n) => typeof n === "string" && names.add(n));
      else if (v && typeof v === "object") Object.values(v).forEach(collect);
    };
    collect(this._config);
    const all = [...names];

    this._bake(all, "u_vol", "u_vol_factor_scaling_ps");
    this._bake(all, "el_base", "el_base_factor_scaling_ps");
    // a HeartChamber's el_k is scaled by its diastolic modulation, which contains the el_min scaling:
    // carry that factor into el_k before baking el_min, or the diastolic curve would soften
    for (const name of all) {
      const comp = this._model.models[name];
      const f = comp?.el_min_factor_scaling_ps;
      if (comp && comp.model_type === "HeartChamber" && f !== undefined && f !== 1.0 && comp.el_k !== undefined) comp.el_k *= f;
    }
    this._bake(all, "el_min", "el_min_factor_scaling_ps");
    this._bake(all, "el_max", "el_max_factor_scaling_ps");
    this._bake_resistance(all);

    // reset all tracking
    for (const key of Object.keys(this._prev)) {
      this._prev[key] = 1.0;
    }
  }

  _bake(names, base_prop, factor_prop) {
    for (const name of names) {
      const comp = this._model.models[name];
      if (!comp) continue;
      const f = comp[factor_prop];
      if (f !== undefined && f !== 1.0) {
        comp[base_prop] *= f;
        comp[factor_prop] = 1.0;
        // models that ADD their layers (all but BloodVessel) apply a persistent change as a fraction of
        // the base: rescale it so its absolute effect survives the larger base
        const ps = base_prop + "_factor_ps";
        if (comp.model_type !== "BloodVessel" && comp[ps] !== undefined && comp[ps] !== 1.0) comp[ps] = 1.0 + (comp[ps] - 1.0) / f;
      }
    }
  }

  _bake_resistance(names) {
    for (const name of names) {
      const comp = this._model.models[name];
      if (!comp) continue;
      const f = comp.r_factor_scaling_ps;
      if (f !== undefined && f !== 1.0) {
        if (comp.r_for !== undefined) comp.r_for *= f;
        if (comp.r_back !== undefined) comp.r_back *= f;
        if (comp.model_type !== "BloodVessel" && comp.r_factor_ps !== undefined && comp.r_factor_ps !== 1.0) comp.r_factor_ps = 1.0 + (comp.r_factor_ps - 1.0) / f;
        // a BloodVessel stiffens with its resistance multiplier (el_eff includes r_total_factor^alpha);
        // once the factor is in r_for it no longer reaches that coupling, so carry f^alpha into
        // el_base to keep the vessel exactly as it was
        if (comp.alpha > 0.0 && comp.el_base !== undefined) comp.el_base *= Math.pow(f, comp.alpha);
        comp.r_factor_scaling_ps = 1.0;
      }
    }
  }

  // --- WEIGHT-BASED SCALING ---

  // Weight scaling driven by a single new_weight value: linear, volume-only.
  // The five volume groups (vol and u_vol) scale linearly with weight. The
  // inverse elastance/resistance scaling below is commented out, so pressures
  // are NOT held constant across body sizes, and nothing here scales heart
  // rate or VO2.
  scale_to_weight(new_weight) {
    const baseline = this._model._baseline_weight;
    if (!baseline || baseline <= 0 || !new_weight || new_weight <= 0) return;
    const vol_factor = new_weight / baseline;
    const inv_factor = baseline / new_weight;

    // volumes (linear with weight)
    this.scale_blood_volume(vol_factor);
    this.scale_heart_volume(vol_factor);
    this.scale_lung_volume(vol_factor);
    this.scale_thorax_volume(vol_factor);
    this.scale_pericardium_volume(vol_factor);

    // unstressed volumes (linear with weight)
    // this.scale_pulmonary_u_vol(vol_factor);
    // this.scale_systemic_u_vol(vol_factor);
    // this.scale_airway_u_vol(vol_factor);
    // this.scale_left_lung_u_vol(vol_factor);
    // this.scale_right_lung_u_vol(vol_factor);
    // this.scale_left_heart_u_vol(vol_factor);
    // this.scale_right_heart_u_vol(vol_factor);

    // elastances (inverse with weight)
    // this.scale_blood_elastances(inv_factor);
    // this.scale_pulmonary_elastances(inv_factor);
    // this.scale_systemic_elastances(inv_factor);
    // this.scale_airway_elastances(inv_factor);
    // this.scale_left_lung_elastances(inv_factor);
    // this.scale_right_lung_elastances(inv_factor);
    // this.scale_heart_el_min(inv_factor);
    // this.scale_heart_el_max(inv_factor);
    // this.scale_left_heart_el_min(inv_factor);
    // this.scale_left_heart_el_max(inv_factor);
    // this.scale_right_heart_el_min(inv_factor);
    // this.scale_right_heart_el_max(inv_factor);
    // this.scale_thorax_elastances(inv_factor);
    // this.scale_pericardium_elastances(inv_factor);

    // resistances (inverse with weight)
    // this.scale_blood_resistances(inv_factor);
    // this.scale_pulmonary_resistances(inv_factor);
    // this.scale_systemic_resistances(inv_factor);
    // this.scale_airway_upper_resistances(inv_factor);
    // this.scale_airway_lower_resistances(inv_factor);
    // this.scale_left_lung_resistances(inv_factor);
    // this.scale_right_lung_resistances(inv_factor);
    // this.scale_heart_resistances(inv_factor);

    this._model.weight = new_weight;
  }

  // --- UTILITY ---

  add_volume(vol_liters) {
    const ivci = this._model.models["IVCI"];
    if (ivci && ivci.vol !== undefined) {
      ivci.vol += vol_liters;
    }
  }

  reset() {
    this.scale_blood_volume(1.0);
    this.scale_heart_volume(1.0);
    this.scale_lung_volume(1.0);
    this.scale_thorax_volume(1.0);
    this.scale_pericardium_volume(1.0);

    this.scale_blood_elastances(1.0);
    this.scale_blood_resistances(1.0);

    this.scale_pulmonary_elastances(1.0);
    this.scale_pulmonary_resistances(1.0);
    this.scale_pulmonary_u_vol(1.0);

    this.scale_systemic_elastances(1.0);
    this.scale_systemic_resistances(1.0);
    this.scale_systemic_u_vol(1.0);

    this.scale_airway_elastances(1.0);
    this.scale_airway_u_vol(1.0);
    this.scale_airway_upper_resistances(1.0);
    this.scale_airway_lower_resistances(1.0);

    this.scale_left_lung_elastances(1.0);
    this.scale_left_lung_resistances(1.0);
    this.scale_left_lung_u_vol(1.0);

    this.scale_right_lung_elastances(1.0);
    this.scale_right_lung_resistances(1.0);
    this.scale_right_lung_u_vol(1.0);

    this.scale_heart_el_min(1.0);
    this.scale_heart_el_max(1.0);
    this.scale_left_heart_el_min(1.0);
    this.scale_left_heart_el_max(1.0);
    this.scale_left_heart_u_vol(1.0);
    this.scale_right_heart_el_min(1.0);
    this.scale_right_heart_el_max(1.0);
    this.scale_right_heart_u_vol(1.0);
    this.scale_heart_resistances(1.0);

    this.scale_thorax_elastances(1.0);
    this.scale_pericardium_elastances(1.0);
  }
}
