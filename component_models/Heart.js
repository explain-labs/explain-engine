import { BaseModelClass } from "../base_models/BaseModelClass";

export class Heart extends BaseModelClass {
  // static properties
  static model_type = "Heart";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent properties
    // -----------------------------------------------
    this.heart_rate_ref = 110.0; // reference heart rate (beats/minute)
    this.pq_time = 0.1; // pq time (s)
    this.qrs_time = 0.075; // qrs time (s)
    this.qt_time = 0.25; // qt time (s)
    this.av_delay = 0.0005; // delay in the AV-node (s)

    // ECG wave amplitudes (mV) — morphology of the synthesized ecg_signal
    this.p_amp = 0.15; // P wave amplitude (mV)
    this.q_amp = -0.1; // Q wave amplitude (mV)
    this.r_amp = 1.0; // R wave amplitude (mV)
    this.s_amp = -0.25; // S wave amplitude (mV)
    this.t_amp = 0.25; // T wave amplitude (mV)
    this.ans_sens = 1.0; // sensitivity of the heart for autonomic nervous system control
    this.ans_activity = 1.0; // ans activity simulating B-adrenergic effect on contractility and relaxation
    this.ans_activity_hr = 1.0; // heart rate factor of the autonomic nervous system
    this.ans_activity_factor = 1.0; // ANS-activity scaler from the Mob myocardial-oxygen-balance hypoxia feedback (1.0 = no effect)
    this.hr_factor = 1.0; // heart rate factor
    this.hr_override = false; // when set to true the heart rate is fixed on the reference heart rate, ignoring the influence of the factors
    this.hr_mob_factor = 1.0; // heart rate factor of the myocardial oxygen balance model
    this.hr_temp_factor = 1.0; // heart rate factor of the temperature (not implemented yet)
    this.hr_drug_factor = 1.0; // heart rate factor of the drug model (not implemented yet)

    this.cont_factor = 1.0; // contractility factor
    this.cont_factor_left = 1.0; // left heart contractility factor
    this.cont_factor_right = 1.0; // right heart contractility factor
    this.cont_mob_factor = 1.0; // contractility factor of myocardial oxygen balance model
    this.cont_drug_factor = 1.0; // contractility factor of drug model (not implemented yet)

    this.relax_factor = 1.0; // relaxation factor (higher is less relaxation!)
    this.relax_factor_left = 1.0; // left heart relaxation factor
    this.relax_factor_right = 1.0; // right heart relaxation factor
    this.relax_mob_factor = 1.0; // relaxation factor of myocardial oxygen balance model
    this.relax_drug_factor = 1.0; // relaxation factor of drug model (not implemented yet)

    this.pc_el_factor = 1.0; // elastance factor of the pericardium
    this.pc_extra_volume = 0.0; // additional volume of the pericardium
  
    // -----------------------------------------------
    // dependent properties
    // -----------------------------------------------
    this.heart_rate = 120.0; // calculated heart rate (beats/minute)
    this.heart_rate_measured = 120; // measured heart rate
    this.cardiac_cycle_state = 0;

    this.ecg_signal = 0.0; // ecg signal (mV)
    this.ncc_ventricular = 0; // ventricular contraction counter
    this.ncc_atrial = 0; // atrial contraction counter
    this.cardiac_cycle_running = 0; // signal whether or not the cardiac cycle is running (0 = not, 1 = running)
    this.cardiac_cycle_time = 0.353; // cardiac cycle time (s)

    this.lv_edv = this.lv_esv = 0.0
    this.lv_edp = 0.0
    this.lv_esp = 0.0
    this.lv_sp = 0.0
    this.lv_sv = 0.0
    this.lv_ef = 0.0

    this.rv_edv = 0.0
    this.rv_esv = 0.0
    this.rv_edp = 0.0
    this.rv_esp = 0.0
    this.rv_sp = 0.0
    this.rv_sv = 0.0
    this.rv_ef = 0.0

    this.ra_edv = 0.0
    this.ra_esv = 0.0
    this.ra_edp = 0.0
    this.ra_esp = 0.0
    this.ra_sp = 0.0

    this.la_edv = 0.0
    this.la_esv = 0.0
    this.la_edp = 0.0
    this.la_esp = 0.0
    this.la_sp = 0.0


    // -----------------------------------------------
    // local properties
    // -----------------------------------------------
    this._kn = 0.579; // constant of the activation curve
    this.prev_cardiac_cycle_running = 0;
    this.prev_cardiac_cycle_state = 0;
    this._temp_cardiac_cycle_time = 0.0;
    this._sa_node_interval = 1.0;
    this._sa_node_timer = 0.0;
    this._av_delay_timer = 0.0;
    this._pq_timer = 0.0;
    this._pq_running = false;
    this._av_delay_running = false;
    this._qrs_timer = 0.0;
    this._qrs_running = false;
    this._ventricle_is_refractory = false;
    this._qt_timer = 0.0;
    this._qt_running = false;
    this._la = null;
    this._lv = null;
    this._ra = null;
    this._ra_rv = null;
    this._raivci = null;
    this._raivci_rv = null;
    this._rasvc = null;
    this._rasvc_rv = null;
    this._rv = null;
    this._la_lv = null;
    this._lv_aa = null;
    this._coronaries = null;

    this._systole_running = false
    this._diastole_running = false

    this.prev_la_lv_flow = 0.0;
    this.prev_lv_aa_flow = 0.0;
    this.prev_cont_factor = 1.0;
    this.prev_cont_factor_left = 1.0;
    this.prev_cont_factor_right = 1.0;

    this.prev_relax_factor = 1.0;
    this.prev_relax_factor_left = 1.0;
    this.prev_relax_factor_right = 1.0;

    this.prev_pc_el_factor = 1.0;
    this._hr_counter = 1;
    this._hr_factor = 1;
    
    this._update_counter_factors = 0.0;
    this._update_interval_factors = 0.015;
  }

  init_model(args = {}) {
    super.init_model(args);

    // left atrial components (atrium and mitral valve)
    this._la = this._model_engine.models["LA"] || null;
    this._la_lv = this._model_engine.models["LA_LV"] || null;

    // right atrial components (atrium and tricuspid valve)
    this._ra = this._model_engine.models["RA"] || null;
    this._ra_rv = this._model_engine.models["RA_RV"] || null;

    // preferential flow models are not always present in the model, so we check for their presence
    this._raivci = this._model_engine.models["RAIVCI"] || null;
    this._raivci_rv = this._model_engine.models["RAIVCI_RV"] || null;
    this._rasvc = this._model_engine.models["RASVC"] || null;
    this._rasvc_rv = this._model_engine.models["RASVC_RV"] || null;
    this._raivci_rasvc = this._model_engine.models["RAIVCI_RASVC"] || null;

    // right ventricular components (ventricle and pulmonary valve)
    this._rv = this._model_engine.models["RV"] || null;
    this._rv_pa = this._model_engine.models["RV_PA"] || null;
    
    // TGA or other congenital heart diseases may not have a normal connection
    this._rv_aa = this._model_engine.models["RV_AA"] || null; 

    // left ventricular components (ventricle and aortic valve)
    this._lv = this._model_engine.models["LV"] || null;
    this._lv_aa = this._model_engine.models["LV_AA"] || null;
    
    // TGA or other congenital heart diseases may not have a normal connection, so we check for the presence of the LV_PA model before trying to access it
    this._lv_pa = this._model_engine.models["LV_PA"] || null; 

    // coronary circulation model (not always present in the model, so we check for its presence)
    this._coronaries = this._model_engine.models["COR"] || this._model_engine.models["CORONARIES"] || null;
    this._aa_cor = this._model_engine.models["AA_COR"] || null;
    
    // preferential flow models are not always present in the model, so we check for their presence
    this._cor_raivci = this._model_engine.models["COR_RAIVCI"] || null;
    this._cor_rasvc = this._model_engine.models["COR_RASVC"] || null;

    // pericardium model (not always present in the model, so we check for its presence)
    this._pc = this._model_engine.models["PERICARDIUM"] || null;
  }

  analyze() {
    // state going from systole to diastole (end systolic)
    if (this.prev_cardiac_cycle_state === 1 && this.cardiac_cycle_state === 0) {
      this.lv_esv = this._lv ? this._lv.vol : 0;
      this.lv_esp = this._lv ? this._lv.pres_in : 0;

      this.la_esv = this._la ? this._la.vol : 0;
      this.la_esp = this._la ? this._la.pres_in : 0;
      
      this.rv_esv = this._rv ? this._rv.vol : 0;
      this.rv_esp = this._rv ? this._rv.pres_in : 0;
      
      this.ra_esv = (this._raivci ? this._raivci.vol : 0) + (this._rasvc ? this._rasvc.vol : 0)
      this.ra_esp = 0.5 * ((this._raivci ? this._raivci.pres_in : 0) + (this._rasvc ? this._rasvc.pres_in : 0) )

      if (this._ra) {
        this.ra_esv = this._ra.vol
        this.ra_esp = this._ra.pres_in
      }
    }

    // state going from diastole to systole (end diastolic)
    if (this.prev_cardiac_cycle_state === 0 && this.cardiac_cycle_state === 1) {
      this.lv_edv = this._lv ? this._lv.vol : 0;
      this.lv_edp = this._lv ? this._lv.pres_in : 0;

      this.la_edv = this._la ? this._la.vol : 0;
      this.la_edp = this._la ? this._la.pres_in : 0;

      this.rv_edv = this._rv ? this._rv.vol : 0;
      this.rv_edp = this._rv ? this._rv.pres_in : 0;

      this.ra_edv = (this._raivci ? this._raivci.vol : 0) + (this._rasvc ? this._rasvc.vol : 0);
      this.ra_edp = 0.5 * ((this._raivci ? this._raivci.pres_in : 0) + (this._rasvc ? this._rasvc.pres_in : 0));

      if (this._ra) {
        this.ra_edv = this._ra.vol
        this.ra_edp = this._ra.pres_in
      }

      // store the other parameters (guard ejection fraction against a zero end-diastolic volume)
      this.lv_sv = this.lv_edv - this.lv_esv
      this.rv_sv = this.rv_edv - this.rv_esv
      this.lv_ef = this.lv_edv > 0 ? this.lv_sv / this.lv_edv : 0
      this.rv_ef = this.rv_edv > 0 ? this.rv_sv / this.rv_edv : 0
    }

  }

  calc_model() {
    // set the factors
    this._update_counter_factors += this._t
    if (this._update_counter_factors > this._update_interval_factors) {
      this._update_counter_factors = 0.0;

      const cont_left = this.cont_factor_left;
      const cont_right = this.cont_factor_right;
      if (
        cont_left !== this.prev_cont_factor_left ||
        cont_right !== this.prev_cont_factor_right
      ) {
        this.set_contractillity(cont_left, cont_right);
      }
      this.prev_cont_factor_left = cont_left;
      this.prev_cont_factor_right = cont_right;

      const relax_left = this.relax_factor_left;
      const relax_right = this.relax_factor_right;
      if (
        relax_left !== this.prev_relax_factor_left ||
        relax_right !== this.prev_relax_factor_right
      ) {
        this.set_relaxation(relax_left, relax_right);
      }
      this.prev_relax_factor_left = relax_left;
      this.prev_relax_factor_right = relax_right;

      const pc_el = this.pc_el_factor;
      if (
        pc_el !== this.prev_pc_el_factor
      ) {
        this.set_pericardium(pc_el, this.pc_extra_volume);
      }
      this.prev_pc_el_factor = pc_el;


      // set the new volume if _pc is not null
      if (this._pc) { 
        this._pc.vol_extra = this.pc_extra_volume;
      }
    }

    // store the previous cardiac cycle state
    this.prev_cardiac_cycle_running = this.cardiac_cycle_running;

    // store the previous state
    this.prev_cardiac_cycle_state = this.cardiac_cycle_state

    // The cardiac cycle (systole/diastole) is normally detected from left-heart valve events: systole
    // starts when the mitral valve closes and ends when the LV outflow valve closes. In TGA the LV ejects
    // through the pulmonary valve (LV_PA) rather than the aortic valve, so we use whichever LV outflow
    // valve is active. In hypoplastic-left-heart / single-(right)-ventricle physiology the LV has NO
    // outflow (aortic atresia) and usually no inflow (mitral atresia), so neither valve event can fire —
    // there we derive the cycle from the ventricular activation window instead. This branch is identity for
    // any heart with a working LV outflow (normal anatomy, TGA, tricuspid atresia, PA-IVS, ...).
    const lv_out = this._lv_aa && this._lv_aa.is_enabled ? this._lv_aa : this._lv_pa;
    if (lv_out && lv_out.is_enabled) {
      // mitral valve closes so the systole starts
      if (this.prev_la_lv_flow > 0.0 && this._la_lv.flow <= 0.0) {
        this._systole_running = true
      }
      this.prev_la_lv_flow = this._la_lv.flow

      // LV outflow valve closes so the systole ends
      if (this._systole_running) {
        if (this.prev_lv_aa_flow > 0.0 && lv_out.flow <= 0.0) {
          this._systole_running = false
        }
      }
      this.prev_lv_aa_flow = lv_out.flow
    } else {
      // single working right ventricle (HLHS / aortic atresia): the ventricle is in systole during its
      // activation window (ncc_ventricular sweeps [0, ventricular_duration) each beat)
      const ventricular_duration = (this.qrs_time + this.cqt_time) / this._t;
      this._systole_running = this.ncc_ventricular >= 0 && this.ncc_ventricular < ventricular_duration;
    }

    // set the cardiac cycle
    if (this._systole_running) {
      this.cardiac_cycle_state = 1
      this._diastole_running = false
    } else {
      this.cardiac_cycle_state = 0
      this._diastole_running = true
    }

    // calculate heart rate from the reference value and influencing factors
    this.heart_rate = this.heart_rate_ref +
      (this.ans_activity_hr - 1.0) * this.heart_rate_ref * this.ans_sens +
      (this.hr_factor - 1.0) * this.heart_rate_ref +
      (this.hr_mob_factor - 1.0) * this.heart_rate_ref +
      (this.hr_temp_factor - 1.0) * this.heart_rate_ref +
      (this.hr_drug_factor - 1.0) * this.heart_rate_ref;

    if (this.hr_override) {
      this.heart_rate = this.heart_rate_ref;
    }
    // calculate qtc time depending on heart rate
    this.cqt_time = this.calc_qtc(this.heart_rate);

    // calculate the sinus node interval (in seconds) based on heart rate
    this._sa_node_interval = 60.0 / this.heart_rate;

    // sinus node period check
    if (this._sa_node_timer > this._sa_node_interval) {
      this._sa_node_timer = 0.0; // reset the timer
      this._pq_running = true; // start the pq-time
      this.ncc_atrial = -1; // reset atrial activation counter
      this.cardiac_cycle_running = 1; // cardiac cycle starts
      this._temp_cardiac_cycle_time = 0.0; // reset cardiac cycle time
    }

    // pq time period check
    if (this._pq_timer > this.pq_time) {
      this._pq_timer = 0.0;
      this._pq_running = false;
      this._av_delay_running = true; // start av-delay
    }

    // av delay period check
    if (this._av_delay_timer > this.av_delay) {
      this._av_delay_timer = 0.0;
      this._av_delay_running = false;

      if (!this._ventricle_is_refractory) {
        this._qrs_running = true; // start qrs
        this.ncc_ventricular = -1; // reset ventricular activation
      }
    }

    // qrs time period check
    if (this._qrs_timer > this.qrs_time) {
      this._qrs_timer = 0.0;
      this._qrs_running = false;
      this._qt_running = true; // start qt
      this._ventricle_is_refractory = true;
    }

    // qt time period check
    if (this._qt_timer > this.cqt_time) {
      this._qt_timer = 0.0;
      this._qt_running = false;
      this._ventricle_is_refractory = false; // ventricles leave refractory state
      this.cardiac_cycle_running = 0; // end of cardiac cycle
      this.cardiac_cycle_time = this._temp_cardiac_cycle_time;
    }

    // increment timers with the model's time step
    this._sa_node_timer += this._t;

    if (this.cardiac_cycle_running === 1) {
      this._temp_cardiac_cycle_time += this._t;
    }

    if (this._pq_running) {
      this._pq_timer += this._t;
    }

    if (this._av_delay_running) {
      this._av_delay_timer += this._t;
    }

    if (this._qrs_running) {
      this._qrs_timer += this._t;
    }

    if (this._qt_running) {
      this._qt_timer += this._t;
    }

    // synthesize the ecg signal from the active conduction phase(s)
    this.calc_ecg();

    // measure the heart rate (ventricular contraction)
    if (this.ncc_ventricular == -1) {
      this.heart_rate_measured = 60 / this._hr_counter;
      this._hr_counter = 0.0;
      this._hr_factor = 1.0
    }

    // update the heart frequency even when there's no contraction
    if (this._hr_counter > 1 * this._hr_factor) {
      this.heart_rate_measured = 60 / this._hr_counter;
      this._hr_factor += 1;
    }

    // increase the heartrate counter
    this._hr_counter += this._t

    // increase heart activation function counters
    this.ncc_atrial += 1;
    this.ncc_ventricular += 1;

    // calculate the varying elastance factor
    this.calc_varying_elastance();
  }

  calc_varying_elastance() {
    // calculate atrial activation factor
    let _atrial_duration = this.pq_time / this._t;
    if (this.ncc_atrial >= 0 && this.ncc_atrial < _atrial_duration) {
      this.aaf = Math.sin(Math.PI * (this.ncc_atrial / _atrial_duration));
    } else {
      this.aaf = 0.0;
    }

    // calculate ventricular activation factor
    let _ventricular_duration = (this.qrs_time + this.cqt_time) / this._t;
    if (
      this.ncc_ventricular >= 0 &&
      this.ncc_ventricular < _ventricular_duration
    ) {
      this.vaf =
        (this.ncc_ventricular / (this._kn * _ventricular_duration)) *
        Math.sin(Math.PI * (this.ncc_ventricular / _ventricular_duration));
    } else {
      this.vaf = 0.0;
    }

    // incorporate the ans factors ans sensitivity on the heart function.
    // ans_activity_factor (driven by the Mob myocardial-oxygen-balance hypoxia feedback) scales the
    // sympathetic drive propagated to the chambers; 1.0 = no effect.
    const _eff_ans_activity = this.ans_activity * this.ans_activity_factor;
    if (this._raivci) {
      this._raivci.ans_sens = this.ans_sens
      this._raivci.ans_activity = _eff_ans_activity
      this._raivci.act_factor = this.aaf;
    }
    if (this._rasvc) {
      this._rasvc.ans_sens = this.ans_sens
      this._rasvc.ans_activity = _eff_ans_activity
      this._rasvc.act_factor = this.aaf;
    }

    if (this._rv) {
      this._rv.ans_sens = this.ans_sens
      this._rv.ans_activity = _eff_ans_activity
      this._rv.act_factor = this.vaf;
    }

    if (this._la) {
      this._la.ans_sens = this.ans_sens
      this._la.ans_activity = _eff_ans_activity
      this._la.act_factor = this.aaf;
    }

     if (this._ra) {
      this._ra.ans_sens = this.ans_sens
      this._ra.ans_activity = _eff_ans_activity
      this._ra.act_factor = this.aaf;
    } 

    if (this._lv) {
      this._lv.ans_sens = this.ans_sens
      this._lv.ans_activity = _eff_ans_activity
      this._lv.act_factor = this.vaf;
    }

    if (this._coronaries) {
      this._coronaries.act_factor = this.vaf;
    }

    // analyze current state
    this.analyze()
  }

  calc_qtc(hr) {
    if (hr > 10.0) {
      // Bazett's formula
      return this.qt_time * Math.sqrt(60.0 / hr);
    } else {
      return this.qt_time * 2.449;
    }
  }

  set_pericardium(new_el_factor, new_volume) {
    // skip if no pericardium model is present in this configuration
    if (!this._pc) return;

    // get the current factor from the model
    let f_pc_el = this._pc.el_base_factor_ps;

    // calculate the delta
    let delta = new_el_factor - this.prev_pc_el_factor;

    // guard the extremes
    f_pc_el = Math.max(f_pc_el + delta, 0);

    // set the new factor
    this._pc.el_base_factor_ps = f_pc_el;
  }

  set_contractillity(new_cont_factor_left, new_cont_factor_right) {
    // get the current factors from the model
    let f_ps_la = this._la.el_max_factor_ps;
    let f_ps_lv = this._lv.el_max_factor_ps;
    // add guard rails for th situation when this._raivci or this._rasvc is not present in the model
    let f_ps_raivc = this._raivci ? this._raivci.el_max_factor_ps : 0;
    let f_ps_rasvc = this._rasvc ? this._rasvc.el_max_factor_ps : 0;
    let f_ps_ra = this._ra ? this._ra.el_max_factor_ps : 0;
    let f_ps_rv = this._rv.el_max_factor_ps;

    let delta_left = new_cont_factor_left - this.prev_cont_factor_left;
    let delta_right = new_cont_factor_right - this.prev_cont_factor_right;

    // add the increase/decrease in factor
    f_ps_la = Math.max(f_ps_la + delta_left, 0);
    f_ps_lv = Math.max(f_ps_lv + delta_left, 0);
    f_ps_raivc = Math.max(f_ps_raivc + delta_right, 0);
    f_ps_rasvc = Math.max(f_ps_rasvc + delta_right, 0);
    f_ps_ra = Math.max(f_ps_ra + delta_right, 0);
    f_ps_rv = Math.max(f_ps_rv + delta_right, 0);

    // transfer the factors
    this._la.el_max_factor_ps = f_ps_la
    this._lv.el_max_factor_ps = f_ps_lv
    if (this._raivci) {
      this._raivci.el_max_factor_ps = f_ps_raivc
    }
    if (this._rasvc) {
      this._rasvc.el_max_factor_ps = f_ps_rasvc
    }
    if (this._ra) {
      this._ra.el_max_factor_ps = f_ps_ra
    }
    this._rv.el_max_factor_ps = f_ps_rv

    // store the new factor
    this.cont_factor_left = new_cont_factor_left;
    this.cont_factor_right = new_cont_factor_right;
  }

  set_relaxation(new_relax_factor_left, new_relax_factor_right) {
    // get the current factors from the model
    let f_ps_la = this._la.el_min_factor_ps;
    let f_ps_lv = this._lv.el_min_factor_ps;
    let f_ps_raivc = this._raivci ? this._raivci.el_min_factor_ps : 0;
    let f_ps_rasvc = this._rasvc ? this._rasvc.el_min_factor_ps : 0;
    let f_ps_ra = this._ra ? this._ra.el_min_factor_ps : 0;
    let f_ps_rv = this._rv.el_min_factor_ps;

    let delta_left = new_relax_factor_left - this.prev_relax_factor_left;
    let delta_right = new_relax_factor_right - this.prev_relax_factor_right;

    // add the increase/decrease in factor
    f_ps_la = Math.max(f_ps_la + delta_left, 0);
    f_ps_lv = Math.max(f_ps_lv + delta_left, 0);
    f_ps_raivc = Math.max(f_ps_raivc + delta_right, 0);
    f_ps_rasvc = Math.max(f_ps_rasvc + delta_right, 0);
    f_ps_ra = Math.max(f_ps_ra + delta_right, 0);   
    f_ps_rv = Math.max(f_ps_rv + delta_right, 0);

    // transfer the factors
    this._la.el_min_factor_ps = f_ps_la
    this._lv.el_min_factor_ps = f_ps_lv
    if (this._raivci) {
      this._raivci.el_min_factor_ps = f_ps_raivc
    }
    if (this._rasvc) {
      this._rasvc.el_min_factor_ps = f_ps_rasvc
    }
    if (this._ra) {
      this._ra.el_min_factor_ps = f_ps_ra
    }
    this._rv.el_min_factor_ps = f_ps_rv

    // store the new factor
    this.relax_factor_left = new_relax_factor_left;
    this.relax_factor_right = new_relax_factor_right;
  }

  calc_ecg() {
    // Synthesize a lead-II-like ECG from the active conduction phase using a sum
    // of Gaussians (P, Q, R, S, T). Each wave is positioned relative to its
    // phase duration so the morphology tracks the configured pq/qrs/qt timings.
    // Computed fresh every step (instantaneous value); baseline is isoelectric
    // at 0 mV and the isoelectric PR/ST/TP segments fall out naturally.
    let s = 0.0;

    // P wave during the PQ interval
    if (this._pq_running) {
      s += this.gaussian(this._pq_timer, this.p_amp, 0.4 * this.pq_time, 0.16 * this.pq_time);
    }

    // Q, R and S waves during the QRS complex
    if (this._qrs_running) {
      s += this.gaussian(this._qrs_timer, this.q_amp, 0.2 * this.qrs_time, 0.08 * this.qrs_time);
      s += this.gaussian(this._qrs_timer, this.r_amp, 0.45 * this.qrs_time, 0.1 * this.qrs_time);
      s += this.gaussian(this._qrs_timer, this.s_amp, 0.75 * this.qrs_time, 0.1 * this.qrs_time);
    }

    // T wave during the (corrected) QT interval, after an isoelectric ST segment
    if (this._qt_running) {
      s += this.gaussian(this._qt_timer, this.t_amp, 0.55 * this.cqt_time, 0.14 * this.cqt_time);
    }

    this.ecg_signal = s;
  }

  gaussian(t, amp, center, width) {
    // guard against a zero width (e.g. a timing configured to 0) → avoid NaN
    const w = Math.max(width, 1e-4);
    return amp * Math.exp(-Math.pow(t - center, 2) / (2 * w * w));
  }

}
