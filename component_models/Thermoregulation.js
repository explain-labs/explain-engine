import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Thermoregulation class is the body-temperature controller — a slow process model in the same
  family as `Hormones`, `Kidneys` (autoregulation) and `Drugs`: it holds no compartment of its own,
  resolves references to other models lazily, runs on an `_update_interval` accumulator, owns its
  effector channels while enabled (releasing them once on disable), and auto-seeds itself so a
  scenario that ships it is NEUTRAL at rest (core stays at 37 degC, all owned factors == 1.0, so
  baseline vitals/ABG are unchanged). It only diverges when the thermal environment is perturbed
  (cold incubator, radiant warmer, evaporative loss) or when heat production changes.

  HEAT BALANCE (single well-mixed core node — robust + neutral-by-construction):

    Q_prod  = metabolic heat + non-shivering (brown-fat) thermogenesis
                metabolic = (vo2_eff / 60) * weight * caloric_equiv_o2          [W]
                  vo2_eff = Metabolism.vo2 * Metabolism.vo2_factor * vo2_temp_factor (mL O2/kg/min)
                brown_fat = bat_gain * max(0, setpoint - core), capped at bat_max * weight   [W]
                  (neonates cannot shiver — they defend temperature by non-shivering thermogenesis)
    Q_loss  = SA * [ h_radiative*(core - radiant_eff) + h_convective*(core - env_temp) ]
                + Q_evaporative                                                  [W]
                SA = surface_area_k * weight^(2/3)  (Meeh; neonates have a high surface:mass ratio)
                radiant_eff = radiant_temp (radiant warmer) when set, else env_temp
    dCore   = (Q_prod - Q_loss_eff) / (mass * heat_capacity) * dt
                Q_loss_eff = Q_loss + _loss_trim   (the auto-seeded insulation/posture offset)

  AUTO-SEED: at the first update after `_warmup_delay`, `_loss_trim` is set so Q_prod == Q_loss_eff
  at core == setpoint. dCore is then 0 → the model is neutral at rest and only the SUBSEQUENT change
  of env_temp / radiant_temp / humidity / VO2 moves the core. (Same idiom as the Hormones setpoint
  anchoring and the Kidneys TGF seed.)

  EFFECTORS (owned channels, all default-neutral, independent of Ans / Mob / Drugs):
    Heart.hr_temp_factor          = 1 + hr_temp_gain * (core - setpoint)   (already summed into HR
                                     in Heart.calc, previously never driven)
    Metabolism.vo2_temp_factor    = q10 ^ ((core - 37) / 10)   (clamped; Q10 metabolic coupling)
    Blood.set_temperature(core)   → propagates core temp to every blood compartment, which feeds the
                                     temperature term (dT) of the Stewart acid-base / O2-dissociation
                                     solver (BloodComposition).

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
    this.h_radiative = 5.5; // radiative heat-transfer coefficient (W/m^2/K)
    this.h_convective = 4.0; // convective heat-transfer coefficient (W/m^2/K)
    this.evap_coeff = 6.0; // evaporative/respiratory loss coefficient (W/m^2 per (1-humidity))
    this.caloric_equiv_o2 = 20.1; // heat released per mL O2 consumed (J/mL)

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

    // --- integrate core temperature ---------------------------------------
    const thermal_mass = weight * this.heat_capacity; // J/K
    if (thermal_mass > 0) {
      this.core_temp += ((this.heat_production - this.heat_loss) / thermal_mass) * u;
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

    // propagate core temperature to every blood compartment (feeds the acid-base / O2-dissociation solver)
    if (this._blood) this._blood.set_temperature(this.core_temp);
  }

  // release every owned channel back to neutral exactly once (on disable)
  _release_channels() {
    this._resolve_refs();
    this.vo2_temp_factor = 1.0;
    this.hr_temp_factor = 1.0;
    if (this._metabolism) this._metabolism.vo2_temp_factor = 1.0;
    if (this._heart) this._heart.hr_temp_factor = 1.0;
    if (this._blood) this._blood.set_temperature(37.0);
  }

  _clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
}
