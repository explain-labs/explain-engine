import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Brain class models neonatal cerebral haemodynamics: cerebral blood-flow AUTOREGULATION plus
  INTRACRANIAL PRESSURE (ICP), coupled through the cerebral perfusion pressure CPP = MAP − ICP. It is a
  process controller in the same family as Kidneys (renal autoregulation): it holds no compartment,
  resolves refs lazily, runs on an update interval, owns its effector channels, and is NEUTRAL at the
  scenario's baseline (auto-seeded setpoint + baseline cerebral blood volume), so enabling it does not
  disturb the calibrated circulation. It only diverges when blood pressure changes, autoregulation is
  impaired, or intracranial volume rises.

  THE CEREBRAL BED (pre-wired in the scenarios): AA → AA_BR_ART(resistor) → BR_ART → BR_CAP → BR_VEN →
  VUB. CBF = AA_BR_ART.flow. BR_CAP is the dominant neonatal O2 sink (Metabolism fvo2 ~0.45), so a fall
  in CBF shows up as BR_CAP.to2 collapsing (the HIE / ischaemia signature).

  AUTOREGULATION (myogenic, mirrors Kidneys). Effector = AA_BR_ART.r_factor_ps (the cerebral arteriole
  feeding resistor — a Resistor NOT in Circulation's ANS/SVR fan-out, so this composes cleanly; the
  brain's ANS/SVR tone lives on BR_ART and is left alone). To hold CBF constant as CPP varies, the
  arteriolar resistance must scale WITH CPP (CBF = CPP/R). So:
      autoreg_target = clamp(CPP / CPP_setpoint, lower_ratio, upper_ratio)
  Within the autoregulation range R tracks CPP → CBF flat; beyond the range R clamps → the circulation
  becomes PRESSURE-PASSIVE (CBF follows CPP — the classic surge-→IVH / drop-→ischaemia of the sick or
  premature neonate). `autoregulation_gain` ∈ [0,1] blends between intact (1) and pressure-passive (0):
      r_factor = 1 + autoregulation_gain · (autoreg_target − 1)
  Neonatal autoregulation is narrow and easily lost — set the gain < 1 (or 0) for HIE / extreme preterm.

  ICP (Monro–Kellie, exponential intracranial compliance). Cerebral blood volume CBV = BR_ART+BR_CAP+
  BR_VEN volume; ΔV = (CBV − CBV0) + edema_volume (edema_volume is the settable mass/oedema/haemorrhage
  lever, mL). The EXCESS pressure above baseline is
      icp_excess = icp_e0 · (exp(icp_k · ΔV_ml) − 1)            (mmHg)
  and ICP = icp_baseline + icp_excess. Only the EXCESS is applied as pres_ext on BR_ART/BR_CAP/BR_VEN
  (so at baseline ΔV=0 → 0 added → neutral). The neonatal cranium is COMPLIANT (open fontanelle/sutures)
  → a gentler curve than the adult; `icp_k` carries this. Rising ICP lowers CPP, which the autoregulation
  loop defends by dilating — until the reserve is exhausted, then CBF falls and the brain goes ischaemic.
*/

export class Brain extends BaseModelClass {
  // static properties
  static model_type = "Brain";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.brain_running = true; // master gate (false → owned channels released to neutral)
    this.autoregulation_enabled = true; // cerebral autoregulation on/off
    this.icp_enabled = true; // intracranial-pressure coupling on/off

    // -----------------------------------------------
    // wiring (resolved lazily; runtime-built compartments)
    this.map_model = "AA"; // systemic arterial pressure (MAP) — cerebral perfusion driver
    this.arteriole_resistor = "AA_BR_ART"; // cerebral arteriole feeding resistor (autoregulation effector)
    this.cbf_resistor = "AA_BR_ART"; // resistor whose flow == CBF
    this.cerebral_compartments = ["BR_ART", "BR_CAP", "BR_VEN"]; // summed for cerebral blood volume (ICP)
    this.outflow_resistor = "BR_VEN_VUB"; // cerebral venous OUTFLOW resistor — ICP compresses the
                        // bridging veins (vascular waterfall), raising this resistance → CBF falls.
                        // (Modelling ICP as a resistance, not pres_ext: external pressure on a series of
                        // compartments does not change their steady-state through-flow.)
    this.oxy_model = "BR_CAP"; // brain oxygenation read-out

    // -----------------------------------------------
    // autoregulation parameters — CLOSED-LOOP control of the arteriole resistance to hold cerebral
    // blood flow (CBF) at its baseline setpoint. Closed-loop on FLOW (not open-loop pressure→resistance
    // scaling) so it is robust to the cerebral bed being several resistors in series: it just adjusts
    // AA_BR_ART until CBF matches, saturating at the vasodilation/constriction limits — beyond which the
    // circulation is PRESSURE-PASSIVE (CBF follows pressure).
    this.autoregulation_gain = 1.0; // 1 = intact, 0 = pressure-passive (blend)
    this.autoreg_control_gain = 5.0; // CBF-error feedback gain (per fractional error per second)
    this.autoreg_leak = 0.05; // 1/s — leak that relaxes the integrator toward neutral, so at the
                              // baseline (zero CBF error) the factor returns to 1.0 (no windup); under a
                              // sustained insult the error term dominates and the correction is held
                              // (control_gain/leak ≈ 100 → strong autoregulation with a small droop)
    this.cbf_setpoint = 0.0; // L/min — auto-seeded baseline CBF (the autoregulation target)
    this.cpp_setpoint = 40.0; // mmHg — auto-seeded baseline CPP (read-out)
    this.autoreg_tc = 4.0; // s — first-order lag on the applied factor (anti-oscillation)
    this.autoreg_factor_min = 0.15; // max cerebral vasoDILATION (lower autoregulation limit)
    this.autoreg_factor_max = 6.0; // max cerebral vasoCONSTRICTION (upper autoregulation limit)
    this.cbf_tc = 3.0; // s — smoothing of the (pulsatile) cerebral blood flow
    this.pres_tc = 3.0; // s — smoothing of the sensed arterial pressure (averages out the cardiac pulse,
                        // so CPP tracks MEAN arterial pressure, not the instantaneous value)

    // -----------------------------------------------
    // ICP parameters (exponential intracranial compliance)
    this.icp_baseline = 5.0; // mmHg — normal neonatal ICP (read-out anchor; not applied as pressure)
    this.edema_volume = 0.0; // mL — settable oedema / mass / haemorrhage lever
    this.icp_e0 = 4.0; // mmHg — scale of the exponential pressure-volume curve
    this.icp_k = 0.18; // 1/mL — stiffness (neonatal open fontanelle → relatively compliant)
    this.icp_excess_max = 70.0; // mmHg — clamp on the excess intracranial pressure
    this.icp_outflow_gain = 0.03; // fractional rise in cerebral outflow resistance per mmHg of ICP excess
                                  // (kept low so the ICP→venous-congestion→CBV→ICP loop gain stays < 1)
    this.icp_outflow_factor_max = 8.0; // clamp on the outflow-resistance factor

    // -----------------------------------------------
    // dependent properties (read-outs)
    this.cbf = 0.0; // cerebral blood flow (L/min)
    this.cpp = 0.0; // cerebral perfusion pressure (mmHg)
    this.icp = 5.0; // intracranial pressure (mmHg)
    this.icp_excess = 0.0; // ICP above baseline, applied as pres_ext (mmHg)
    this.cerebral_blood_volume = 0.0; // CBV (mL)
    this.brain_to2 = 0.0; // BR_CAP oxygen content (mmol/L) — ischaemia read-out
    this.autoreg_factor = 1.0; // applied → AA_BR_ART.r_factor_ps
    this.sensed_map = 0.0; // sensed MAP (mmHg)

    // -----------------------------------------------
    // local parameters
    this._update_interval = 0.015; // s — fast loop (myogenic responds in seconds; same cadence as Kidneys)
    this._update_counter = 0.0;
    this._warmup_delay = 30.0; // s before seeding the baseline CPP / CBV
    this._warmup_counter = 0.0;
    this._seeded = false;
    this._map_smooth = null; // smoothed mean arterial pressure state
    this._cbf_smooth = null; // smoothed cerebral blood flow state (L/min)
    this._ar_int = 1.0; // autoregulation integral state (resistance factor before the gain blend)
    this._cbv0 = 0.0; // captured baseline cerebral blood volume (mL)
    this._was_active = false;
    this._map = null;
    this._arteriole = null;
    this._cbf_res = null;
    this._comps = null;
    this._outflow = null;
    this._oxy = null;
  }

  init_model(args) {
    super.init_model(args);
    this.icp = this.icp_baseline;
  }

  calc_model() {
    // master gate — release owned channels once, then idle
    if (!this.brain_running) {
      if (this._was_active) this._release_channels();
      this._was_active = false;
      return;
    }
    this._resolve_refs();

    // ICP pres_ext must be re-applied EVERY step (compartments reset pres_ext each step); the slow
    // control math (autoregulation + ICP magnitude) runs on the update interval.
    this._update_counter += this._t;
    if (this._update_counter >= this._update_interval) {
      const u = this._update_counter;
      this._update_counter = 0.0;
      this._update_brain(u);
    }
    this._was_active = true;
  }

  _resolve_refs() {
    if (!this._map) this._map = this._model_engine.models[this.map_model] ?? null;
    if (!this._arteriole) this._arteriole = this._model_engine.models[this.arteriole_resistor] ?? null;
    if (!this._cbf_res) this._cbf_res = this._model_engine.models[this.cbf_resistor] ?? null;
    if (!this._comps) this._comps = this.cerebral_compartments.map((m) => this._model_engine.models[m] ?? null);
    if (!this._outflow) this._outflow = this._model_engine.models[this.outflow_resistor] ?? null;
    if (!this._oxy) this._oxy = this._model_engine.models[this.oxy_model] ?? null;
  }

  _update_brain(u) {
    // --- read & smooth the mean arterial pressure (averages out the cardiac pulse) ---
    const map_inst = this._map ? this._map.pres : this.sensed_map;
    if (this._map_smooth === null) this._map_smooth = map_inst;
    this._map_smooth += u * ((1.0 / this.pres_tc) * (map_inst - this._map_smooth));
    this.sensed_map = this._map_smooth;
    // cerebral blood flow (smoothed — the instantaneous resistor flow is pulsatile)
    const cbf_inst = this._cbf_res ? this._cbf_res.flow * 60.0 : 0.0; // L/s → L/min
    if (this._cbf_smooth === null) this._cbf_smooth = cbf_inst;
    this._cbf_smooth += u * ((1.0 / this.cbf_tc) * (cbf_inst - this._cbf_smooth));
    this.cbf = this._cbf_smooth;
    this.brain_to2 = this._oxy ? this._oxy.to2 : 0.0;

    // --- cerebral blood volume (mL) ---
    let cbv = 0.0;
    if (this._comps) for (const c of this._comps) { if (c) cbv += c.vol; }
    cbv *= 1000.0; // L → mL
    this.cerebral_blood_volume = cbv;

    // --- ICP (Monro-Kellie, exponential), only the EXCESS above baseline is applied ---
    if (this.icp_enabled) {
      const dV = (this._seeded ? cbv - this._cbv0 : 0.0) + this.edema_volume; // mL
      let excess = this.icp_e0 * (Math.exp(this.icp_k * dV) - 1.0);
      if (excess < 0.0) excess = 0.0; // a smaller-than-baseline cranium does not pull a vacuum
      if (excess > this.icp_excess_max) excess = this.icp_excess_max;
      this.icp_excess = excess;
      this.icp = this.icp_baseline + excess;
    } else {
      this.icp_excess = 0.0;
      this.icp = this.icp_baseline;
    }
    // ICP compresses the cerebral bridging veins → raises the venous outflow resistance → CBF falls
    // (the closed-loop autoregulation below then defends CBF by dilating the inflow, until exhausted)
    if (this._outflow) {
      this._outflow.r_factor_ps = this._clamp(1.0 + this.icp_outflow_gain * this.icp_excess, 1.0, this.icp_outflow_factor_max);
    }

    // --- cerebral perfusion pressure ---
    this.cpp = this.sensed_map - this.icp;

    // --- seed the neutral baseline once the circuit has settled ---
    if (!this._seeded) {
      this._warmup_counter += u;
      if (this._warmup_counter >= this._warmup_delay) {
        this.cpp_setpoint = this.cpp;
        this.cbf_setpoint = this._cbf_smooth;
        this._cbv0 = cbv;
        this._seeded = true;
      }
    }

    // --- autoregulation: closed-loop control of the arteriole resistance to hold CBF at setpoint ---
    if (this._seeded && this.cbf_setpoint > 0) {
      if (this.autoregulation_enabled && this.autoregulation_gain > 0) {
        // leaky integral control: too much flow (err>0) → constrict; the leak pulls the integrator back
        // to neutral so the baseline (err≈0) is collision-free/neutral
        const err = (this._cbf_smooth - this.cbf_setpoint) / this.cbf_setpoint;
        const d = this.autoreg_control_gain * err - this.autoreg_leak * (this._ar_int - 1.0);
        this._ar_int = this._clamp(this._ar_int + d * u, this.autoreg_factor_min, this.autoreg_factor_max);
      } else {
        this._ar_int = this._lag(this._ar_int, 1.0, u, this.autoreg_tc); // relax to neutral (pressure-passive)
      }
      // blend toward pressure-passive (factor → 1) as the gain drops, then lag the applied factor
      const applied = this._clamp(1.0 + this.autoregulation_gain * (this._ar_int - 1.0), this.autoreg_factor_min, this.autoreg_factor_max);
      this.autoreg_factor = this._lag(this.autoreg_factor, applied, u, this.autoreg_tc);
    }
    if (this._arteriole) this._arteriole.r_factor_ps = this.autoreg_factor;
  }

  _release_channels() {
    this._resolve_refs();
    this.autoreg_factor = 1.0;
    this.icp_excess = 0.0;
    this.icp = this.icp_baseline;
    if (this._arteriole) this._arteriole.r_factor_ps = 1.0;
    if (this._outflow) this._outflow.r_factor_ps = 1.0;
  }

  // settable lever for HIE oedema / mass / haemorrhage (mL of added intracranial volume)
  set_edema(volume_ml) {
    this.edema_volume = volume_ml;
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
