import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Thermoregulation class is the body-temperature controller — a slow process model in the same
  family as `Hormones`, `Kidneys` (autoregulation) and `Drugs`: it holds no compartment of its own,
  resolves references to other models lazily, runs on an `_update_interval` accumulator, owns its
  effector channels while enabled (releasing them once on disable), and auto-seeds itself so a
  scenario that ships it is NEUTRAL at rest (core stays at 37 degC, all owned factors == 1.0, so
  baseline vitals/ABG are unchanged). It only diverges when the thermal environment is perturbed
  (cold incubator, radiant warmer, evaporative loss) or when heat production changes.

  HEAT BALANCE (two-node: tissue node + distributed blood pool — robust + neutral-by-construction):

    Q_prod  = metabolic heat + non-shivering (brown-fat) thermogenesis
                metabolic = (vo2_eff / 60) * weight * caloric_equiv_o2          [W]
                  vo2_eff = Metabolism.vo2 * Metabolism.vo2_factor * vo2_temp_factor (mL O2/kg/min)
                brown_fat = bat_gain * max(0, setpoint - core), capped at bat_max * weight   [W]
                  (neonates cannot shiver — they defend temperature by non-shivering thermogenesis)
    Q_loss  = SA * [ h_radiative*(core - radiant_eff) + h_convective*(core - env_temp) ]
                + Q_evaporative                                                  [W]
                SA = surface_area_k * weight^(2/3)  (Meeh; neonates have a high surface:mass ratio)
                radiant_eff = radiant_temp (radiant warmer) when set, else env_temp
    Q_perf  = G_perf * (core - blood_mean)                                       [W]
                G_perf   = C_blood / blood_temp_tc     (perfusion conductance, W/K)
                C_blood  = Sum_i vol_i * blood_density * cp_blood  (blood pool heat capacity)
                blood_mean = heat-capacity-weighted mean blood temperature (Blood.get_thermal_state)
    dCore   = (Q_prod - Q_loss_eff - Q_perf) / C_tissue * dt
                Q_loss_eff = Q_loss + _loss_trim   (the auto-seeded insulation/posture offset)
                C_tissue   = weight*heat_capacity - C_blood  (total body mass conserved)

  The blood pool warms toward `core` via Blood's per-step relaxation (over blood_temp_tc), absorbing
  exactly Q_perf — so cooling the blood (e.g. an ECLS heater-cooler on one compartment) lowers
  blood_mean, drives Q_perf > 0, and pulls the core down. At rest blood_mean == core → Q_perf == 0
  and the balance is identical to the former single-node model, so the _loss_trim seed stays neutral.

  AUTO-SEED: at the first update after `_warmup_delay`, `_loss_trim` is set so Q_prod == Q_loss_eff
  at core == setpoint. dCore is then 0 → the model is neutral at rest and only the SUBSEQUENT change
  of env_temp / radiant_temp / humidity / VO2 moves the core. (Same idiom as the Hormones setpoint
  anchoring and the Kidneys TGF seed.)

  EFFECTORS (owned channels, all default-neutral, independent of Ans / Mob / Drugs):
    Heart.hr_temp_factor          = 1 + hr_temp_gain * (core - setpoint)   (already summed into HR
                                     in Heart.calc, previously never driven)
    Metabolism.vo2_temp_factor    = q10 ^ ((core - 37) / 10)   (clamped; Q10 metabolic coupling)
    Blood.set_perfusion_target(core)→ sets the target every blood compartment warms toward (Blood
                                     relaxes each temp there over blood_temp_tc). Blood temperature
                                     feeds the temperature term (dT) of the Stewart acid-base /
                                     O2-dissociation solver (BloodComposition), and the heat this
                                     exchange carries closes back into the core balance via Q_perf.
    Gas.set_body_temperature(core)→ propagates core temp to the body-warmed airway gas compartments
                                     (alveoli track core; dead space holds its build-time offset below
                                     it). Neutral at rest (core == setpoint → build targets).

  RISK NOTE: core→VO2(Q10)→heat→core is positive feedback; it is bounded by the dominant heat-loss
  limb (∝ core - env) plus the vo2_temp_factor clamp.
*/

export class Thermoregulation extends BaseModelClass {
  // static properties
  static model_type = "Thermoregulation";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.thermoregulation_running = true; // master gate (false → owned channels released to neutral)

    // -----------------------------------------------
    // wiring (resolved lazily; targets may build after this model)
    this.metabolism_name = "Metabolism"; // heat-production source + Q10 effector target
    this.heart_name = "Heart"; // hr_temp_factor effector target
    this.blood_name = "Blood"; // temperature propagation to all blood compartments
    this.gas_name = "Gas"; // core-temperature propagation to the body-warmed airway compartments

    // -----------------------------------------------
    // thermal environment (the user/scenario-settable inputs)
    this.env_temp = 32.0; // ambient air temperature (degC) — neutral-thermal incubator default
    this.radiant_temp = null; // radiant-warmer effective temperature (degC); null → use env_temp
    this.rel_humidity = 0.5; // ambient relative humidity (fraction) — modulates evaporative loss

    // -----------------------------------------------
    // body thermal geometry / constants
    this.setpoint_temp = 37.0; // hypothalamic set-point (degC)
    this.heat_capacity = 3470.0; // specific heat of body tissue (J/kg/K)
    this.surface_area_k = 0.05; // Meeh constant: SA = k * weight^(2/3)  (m^2)
    this.h_radiative = 9.6; // radiative heat-transfer coefficient (W/m^2/K)
    this.h_convective = 7.0; // convective heat-transfer coefficient (W/m^2/K)
    this.evap_coeff = 6.0; // evaporative/respiratory loss coefficient (W/m^2 per (1-humidity))
    this.caloric_equiv_o2 = 20.1; // heat released per mL O2 consumed (J/mL)

    // two-node coupling: the tissue node (this model) exchanges heat with the distributed blood
    // pool by perfusion. blood_temp_tc must match Blood.blood_temp_tc for energy consistency.
    this.blood_density = 1.06; // blood density (kg/L)
    this.cp_blood = 3800.0; // blood specific heat (J/kg/K)
    this.blood_temp_tc = 10.0; // perfusion equilibration time constant (s); sets G_perf = C_blood / tc
    this.blood_volume_per_kg = 0.08; // circulating blood volume (L/kg) used for the core-coupling mass.
    // The model's blood compartments sum to ~2.4x this (they include organ vascular beds), so using the
    // physiological circulating volume for the perfusion heat exchange keeps the loss coefficients
    // physical. The blood temperature field itself (blood_mean) still comes from all compartments.

    // non-shivering (brown-fat) thermogenesis
    this.bat_gain = 6.0; // extra heat per degC below set-point (W/degC)
    this.bat_max_per_kg = 4.5; // ceiling on brown-fat output (W/kg)

    // effector sensitivities + clamps
    this.q10 = 2.3; // Q10 of metabolic rate (per 10 degC)
    this.vo2_temp_factor_min = 0.5;
    this.vo2_temp_factor_max = 2.5;
    this.hr_temp_gain = 0.1; // heart-rate factor rise per degC above set-point (fraction of ref HR; ~10%/degC)
    this.hr_temp_factor_min = 0.6;
    this.hr_temp_factor_max = 1.6;

    // -----------------------------------------------
    // dependent properties (read-outs)
    this.core_temp = 37.0; // modelled core temperature (degC)
    this.skin_temp = 36.0; // approximated skin temperature (degC, read-out only)
    this.skin_gradient = 1.0; // core - skin offset used for the skin read-out (degC)
    this.heat_production = 0.0; // Q_prod (W)
    this.heat_loss = 0.0; // Q_loss_eff (W)
    this.brown_fat_heat = 0.0; // non-shivering thermogenesis component (W)
    this.blood_temp_mean = 37.0; // heat-capacity-weighted mean blood temperature (degC), read-out
    this.q_perfusion = 0.0; // heat flowing tissue → blood pool this update (W), read-out
    this.vo2_temp_factor = 1.0; // → Metabolism.vo2_temp_factor (Q10), read-out
    this.hr_temp_factor = 1.0; // → Heart.hr_temp_factor, read-out

    // -----------------------------------------------
    // local parameters
    this._update_interval = 1.0; // run the controller every 1 s (temperature is slow)
    this._update_counter = 0.0;
    this._warmup_delay = 5.0; // s before the auto-seed of _loss_trim (let the circuit settle)
    this._warmup_counter = 0.0;
    this._loss_trim = 0.0; // auto-seeded additive heat-loss offset (W) → neutral at rest
    this._seeded = false;
    this._was_active = false; // tracks active→inactive for the one-shot channel release
    this._metabolism = null;
    this._heart = null;
    this._blood = null;
    this._gas = null;
  }

  init_model(args) {
    super.init_model(args);
    this.core_temp = this.setpoint_temp; // start neutral
  }

  calc_model() {
    // master gate — release owned channels once, then idle
    if (!this.thermoregulation_running) {
      if (this._was_active) this._release_channels();
      this._was_active = false;
      return;
    }

    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      const u = this._update_counter; // exact elapsed time since the last update
      this._update_counter = 0.0;
      this._update_temperature(u);
      this._apply_effectors();
    }
    this._was_active = true;
  }

  _resolve_refs() {
    if (!this._metabolism) this._metabolism = this._model_engine.models[this.metabolism_name] ?? null;
    if (!this._heart) this._heart = this._model_engine.models[this.heart_name] ?? null;
    if (!this._blood) this._blood = this._model_engine.models[this.blood_name] ?? null;
    if (!this._gas) this._gas = this._model_engine.models[this.gas_name] ?? null;
  }

  // the heat-balance math. u = elapsed time since the last controller update (s).
  _update_temperature(u) {
    this._resolve_refs();
    const weight = this._model_engine.weight;

    // --- heat production ---------------------------------------------------
    // metabolic heat from the (temperature-modulated) whole-body VO2
    let vo2 = 8.1; // fallback if Metabolism is absent
    let vo2_factor = 1.0;
    if (this._metabolism) {
      vo2 = this._metabolism.vo2 ?? vo2;
      vo2_factor = this._metabolism.vo2_factor ?? 1.0;
    }
    const vo2_eff = vo2 * vo2_factor * this.vo2_temp_factor; // mL O2/kg/min
    const metabolic_heat = (vo2_eff * weight / 60.0) * this.caloric_equiv_o2; // W

    // non-shivering (brown-fat) thermogenesis when below set-point
    const bat_deficit = this.setpoint_temp - this.core_temp;
    this.brown_fat_heat = bat_deficit > 0 ? Math.min(this.bat_gain * bat_deficit, this.bat_max_per_kg * weight) : 0.0;

    this.heat_production = metabolic_heat + this.brown_fat_heat;

    // --- heat loss --------------------------------------------------------
    const sa = this.surface_area_k * Math.pow(weight, 2.0 / 3.0); // m^2
    const radiant_eff = this.radiant_temp != null ? this.radiant_temp : this.env_temp;
    const q_radiative = sa * this.h_radiative * (this.core_temp - radiant_eff);
    const q_convective = sa * this.h_convective * (this.core_temp - this.env_temp);
    const q_evaporative = sa * this.evap_coeff * (1.0 - this.rel_humidity);
    const q_loss_raw = q_radiative + q_convective + q_evaporative;

    // auto-seed the insulation/posture trim so the body is exactly in balance at rest
    if (!this._seeded) {
      this._warmup_counter += u;
      if (this._warmup_counter >= this._warmup_delay) {
        this._loss_trim = this.heat_production - q_loss_raw; // makes Q_loss_eff == Q_prod at core==setpoint
        this._seeded = true;
      }
    }

    this.heat_loss = q_loss_raw + this._loss_trim;

    // --- perfusion heat exchange with the blood pool (two-node coupling) ---
    // The body's thermal mass is split into a tissue node (this integrator) and the distributed
    // blood pool (the blood compartments, warmed toward core by Blood's relaxation). Heat flows
    // tissue → blood at G_perf·(core − blood_mean); the blood side absorbs the same amount via its
    // relaxation (same conductance), so energy is conserved. At rest blood_mean == core → q = 0 and
    // the balance reduces exactly to the single-node model, keeping the _loss_trim seed neutral.
    // When a device cools the blood (ECLS heater-cooler), blood_mean < core → q > 0 → core falls.
    let c_tissue = weight * this.heat_capacity; // J/K (whole-body mass; blood share removed below)
    this.q_perfusion = 0.0;
    if (this._blood && this.blood_temp_tc > 0.0) {
      // blood_mean is the actual heat-capacity-weighted temperature over ALL blood compartments, but
      // the coupling MASS is the physiological circulating blood volume (the compartment sum overstates
      // it ~2.4x because it includes vascular beds). Using the real volume keeps the loss coefficients
      // physical; the resulting transient energy inexactness is small and zero at rest.
      const { t_mean } = this._blood.get_thermal_state(this.blood_density, this.cp_blood);
      this.blood_temp_mean = t_mean;
      const c_blood = this.blood_volume_per_kg * weight * this.blood_density * this.cp_blood; // J/K
      c_tissue = weight * this.heat_capacity - c_blood;
      const g_perf = c_blood / this.blood_temp_tc; // W/K
      this.q_perfusion = g_perf * (this.core_temp - t_mean);
    }

    // --- integrate core temperature ---------------------------------------
    if (c_tissue > 0) {
      this.core_temp += ((this.heat_production - this.heat_loss - this.q_perfusion) / c_tissue) * u;
    }
    this.skin_temp = this.core_temp - this.skin_gradient;
  }

  // map core temperature → effector factors and write the owned channels
  _apply_effectors() {
    // Q10 metabolic coupling → Metabolism.vo2_temp_factor
    this.vo2_temp_factor = this._clamp(Math.pow(this.q10, (this.core_temp - 37.0) / 10.0), this.vo2_temp_factor_min, this.vo2_temp_factor_max);
    if (this._metabolism) this._metabolism.vo2_temp_factor = this.vo2_temp_factor;

    // temperature → heart rate (drives the previously-dormant Heart.hr_temp_factor channel)
    this.hr_temp_factor = this._clamp(1.0 + this.hr_temp_gain * (this.core_temp - this.setpoint_temp), this.hr_temp_factor_min, this.hr_temp_factor_max);
    if (this._heart) this._heart.hr_temp_factor = this.hr_temp_factor;

    // set the perfusion target (core temperature) that blood warms toward — Blood relaxes each
    // compartment there over blood_temp_tc, so blood temperature is a real advecting field, not a
    // stamp. Device-controlled compartments (temp_ext_override) keep their own target.
    if (this._blood) this._blood.set_perfusion_target(this.core_temp);

    // propagate core temperature to the body-warmed airway gas compartments (alveoli track core,
    // dead space holds its build-time offset below it) — the gas counterpart to Blood.set_temperature
    if (this._gas) this._gas.set_body_temperature(this.core_temp);
  }

  // release every owned channel back to neutral exactly once (on disable)
  _release_channels() {
    this._resolve_refs();
    this.vo2_temp_factor = 1.0;
    this.hr_temp_factor = 1.0;
    if (this._metabolism) this._metabolism.vo2_temp_factor = 1.0;
    if (this._heart) this._heart.hr_temp_factor = 1.0;
    if (this._blood) this._blood.set_perfusion_target(37.0);
    // restore the gas targets to their build values (set-point + offset) so the airway is neutral
    if (this._gas) this._gas.set_body_temperature(this.setpoint_temp);
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
