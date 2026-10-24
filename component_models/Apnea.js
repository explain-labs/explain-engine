import { BaseModelClass } from "../base_models/BaseModelClass";

// Apnea of prematurity — an episodic controller that suppresses spontaneous ventilation to reproduce
// the intermittent breathing pauses of the preterm neonate. It owns an eupnea <-> apnea state machine
// and, during a pause, drives the existing Breathing / upper-airway levers; it computes no physiology
// of its own. The downstream cascade (falling alveolar/arterial pO2 -> desaturation -> peripheral
// chemoreflex -> bradycardia) emerges through the unchanged gas-exchange and ANS machinery.
//
//   central     -> cut respiratory drive (Breathing.switch_breathing(false)); no effort, no flow.
//   obstructive -> occlude the upper airway (MOUTH_DS.no_flow = true); effort continues, zero flow.
//   mixed       -> obstruct first, then also lose central drive for the remainder of the pause.
//
// Episode timing is stochastic but reproducible: a seeded LCG (no Math.random) keeps headless probe
// runs deterministic while the episodes stay irregular.
export class Apnea extends BaseModelClass {
  // static properties
  static model_type = "Apnea";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // initialize independent properties
    this.apnea_enabled = false; // master switch for apnea generation (episodes only occur when true)
    this.apnea_frequency = 0.5; // mean number of apnea episodes per minute
    this.apnea_duration = 12.0; // mean episode duration (s)
    this.apnea_variability = 0.3; // coefficient of variation applied to interval and duration (0 - 1)
    this.apnea_type = "central"; // mechanism of each episode: "central" | "obstructive" | "mixed"
    this.mixed_obstructive_fraction = 0.5; // for "mixed": leading obstructed fraction of the pause (0 - 1)
    this.seed = 42; // PRNG seed (deterministic episode timing)
    this.breathing_model = "Breathing"; // name of the spontaneous breathing model to suppress
    this.airway_model = "MOUTH_DS"; // name of the upper-airway resistor to occlude (obstructive/mixed)

    // initialize dependent properties (outputs / bedside)
    this.in_apnea = false; // whether an apnea episode is currently running
    this.active_type = ""; // the type of the currently running episode ("" when eupneic)
    this.apnea_count = 0; // total number of completed episodes
    this.last_apnea_duration = 0.0; // duration of the most recent completed episode (s)
    this.longest_apnea_duration = 0.0; // longest episode so far (s)
    this.time_since_last_apnea = 0.0; // time since the last episode ended (s)

    // episode state. Public so a saved state keeps it: a state saved during an episode must still know
    // that this model switched breathing off / closed the airway, or the reload stays apneic for good
    this.baseline_breathing = null; // spontaneous-breathing state at the first build (null = not yet captured)
    this.drive_off = false; // central drive currently cut by this model
    this.airway_obstructed = false; // airway currently occluded by this model
    this.episode_timer = 0.0; // phase timer, reset at each transition (s)
    this.episode_duration = 0.0; // drawn duration of the running episode (s)
    this.next_interval = 0.0; // drawn inter-onset gap until the next episode (s; 0 = not drawn yet)

    // initialize local properties
    this._breathing = null; // reference to the breathing model
    this._airway = null; // reference to the upper-airway resistor
    this._rng_state = 1; // LCG state
  }

  init_model(args = []) {
    // set the values of the independent properties from the model definition
    args.forEach((arg) => {
      this[arg["key"]] = arg["value"];
    });

    // resolve references to the models this controller drives
    this._breathing = this._model_engine.models[this.breathing_model] || null;
    this._airway = this._model_engine.models[this.airway_model] || null;

    // respect the baseline spontaneous-breathing state so a non-breathing scenario (e.g. a fetus) is
    // never force-started by the apnea controller restoring ventilation. Captured once: a reloaded state
    // keeps it (during an episode Breathing reads off, which is not the patient's baseline)
    if (this.baseline_breathing === null || this.baseline_breathing === undefined) {
      this.baseline_breathing = this._breathing ? this._breathing.breathing_enabled : false;
    }

    // seed the deterministic PRNG and draw the first inter-onset gap (a reloaded state keeps its own)
    this._rng_state = (this.seed >>> 0) || 1;
    if (!(this.next_interval > 0.0)) this.next_interval = this._draw_interval();

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_model() {
    // if apnea generation is off, or the patient is not a spontaneous breather, guarantee eupnea
    if (!this.apnea_enabled || !this.baseline_breathing) {
      this._restore_ventilation();
      this.in_apnea = false;
      this.active_type = "";
      return;
    }

    this.episode_timer += this._t;

    if (!this.in_apnea) {
      // eupnea: count time towards the next onset
      this.time_since_last_apnea += this._t;
      if (this.episode_timer >= this.next_interval) {
        this._start_apnea();
      }
    } else {
      // apnea running: for a mixed episode, hand over from obstruction to central drive loss partway
      if (this.active_type === "mixed" && !this.drive_off) {
        if (this.episode_timer >= this.episode_duration * this.mixed_obstructive_fraction) {
          this._set_central(true);
        }
      }
      if (this.episode_timer >= this.episode_duration) {
        this._end_apnea();
      }
    }
  }

  // ---- episode transitions ----

  _start_apnea() {
    this.episode_timer = 0.0;
    this.in_apnea = true;
    this.active_type = this.apnea_type;
    this.episode_duration = this._draw_duration();

    if (this.apnea_type === "central") {
      this._set_central(true);
    } else {
      // obstructive and mixed both begin with an airway occlusion; mixed adds central drive loss at
      // the handover (see calc_model)
      this._set_obstruction(true);
    }
  }

  _end_apnea() {
    this._restore_ventilation();
    this.in_apnea = false;
    this.active_type = "";
    this.last_apnea_duration = this.episode_duration;
    if (this.episode_duration > this.longest_apnea_duration) {
      this.longest_apnea_duration = this.episode_duration;
    }
    this.apnea_count += 1;
    this.time_since_last_apnea = 0.0;
    this.episode_timer = 0.0;
    this.next_interval = this._draw_interval();
  }

  // ---- coupling helpers ----

  _set_central(state) {
    // cut (state = true) or restore spontaneous respiratory drive
    this.drive_off = state;
    if (this._breathing) this._breathing.switch_breathing(!state);
  }

  _set_obstruction(state) {
    // occlude (state = true) or open the upper airway; effort continues but no flow moves
    this.airway_obstructed = state;
    if (this._airway) this._airway.no_flow = state;
  }

  _restore_ventilation() {
    if (this.drive_off) this._set_central(false);
    if (this.airway_obstructed) this._set_obstruction(false);
  }

  // ---- deterministic PRNG (LCG, Numerical Recipes constants) ----

  _rand() {
    // returns a float in [0, 1)
    this._rng_state = (Math.imul(1664525, this._rng_state) + 1013904223) >>> 0;
    return this._rng_state / 4294967296;
  }

  _jitter(mean) {
    // symmetric multiplicative jitter within +/- apnea_variability of the mean, clamped positive
    const v = Math.max(0.0, Math.min(1.0, this.apnea_variability));
    const factor = 1.0 + v * (2.0 * this._rand() - 1.0);
    return Math.max(1e-3, mean * factor);
  }

  _draw_interval() {
    // convert the episode frequency (episodes/min) into a mean eupneic gap. Subtracting the mean
    // duration makes the *rate of episodes* match apnea_frequency rather than the rate of gaps.
    const f = Math.max(1e-6, this.apnea_frequency);
    const mean_cycle = 60.0 / f;
    const mean_gap = Math.max(1.0, mean_cycle - this.apnea_duration);
    return this._jitter(mean_gap);
  }

  _draw_duration() {
    return this._jitter(this.apnea_duration);
  }

  // allow an external caller (UI / scenario event) to toggle apnea generation
  switch_apnea(state) {
    this.apnea_enabled = state;
  }
}
