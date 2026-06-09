import { BaseModelClass } from "../base_models/BaseModelClass.js";

export class Monitor extends BaseModelClass {
  // static properties
  static model_type = "Monitor";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // Independent properties
    this.hr_avg_beats = 5.0; // the number of beats for averaging the heartrate
    this.flow_avg_beats = 1.0; // the number of beats for averaging the flows
    this.rr_avg_time = 20.0; // averaging time of the respiratory rate
    this.sat_avg_time = 5.0; // averaging time of the pulse oximeter
    this.sat_sampling_interval = 1.0;
    this.heart = "Heart"; // name of the heart model
    this.lv = "LV"; // name of the left ventricla
    this.rv = "RV"; // name of the right ventricle
    this.ascending_aorta = "AA"; // name of the ascending aorta
    this.descending_aorta = "AD"; // name of the descending aorta
    this.pulm_artery = "PA"; // name of the descending aorta
    this.right_atrium_ivci = "RAIVCI"; // name of the right atrium model
    this.right_atrium_svc = "RASVC"; // name of the right atrium model
    this.breathing = "Breathing"; // name of the spontanenous breathing model
    this.ventilator = "Ventilator"; // name of the mechanical ventilator model
    this.aortic_valve = "LV_AA"; // name of the aortic valve
    this.pulm_valve = "RV_PA"; // name of the pulmonary valve
    this.aa_cor = "AA_COR"; // name of the connector connecting the aorta to the coronaries
    this.aa_brain = "AA_BR"; // name of the connector connecting the aorta to the brain
    this.ad_kid = "AD_KID_ART"; // name of the connector connecting the descending aorta to the kidneys
    this.ad_ls = "AD_LS"; // name of the connector connecting the liver and splachnic
    this.ad_int = "AD_INT"; // name of the connector connecting the intestines
    this.ad_rlb = "AD_RLB"; // name of the connector connecting the rest of the body
    this.ivc_ra = "IVCI_RAIVCI"; // name of the connector connecting the inferior vena cava to the right atrium
    this.svc_ra = "SVC_RASVC"; // name of the connector connecting the superior vena cava to the right atrium
    this.thorax = "THORAX"; // name of the thorax model
    this.deadspace = "DS"; // name of the dead space airway model
    this.fo_ivci = "LA_RAIVCI"; // name of the foramen ovale
    this.fo_svc = "LA_RASVC"; // name of the foramen ovale
    this.da = "AAR_DA"; // name of the ductus arteriosus
    this.vsd = "VSD"; // name of the ventricular septal defect
    this.ips = "IPS"; // name of the intrapulmonary shunt
    this.ua = "AD_UMB_ART"; // name of the umbilical artery connection
    this.uv = "UMB_VEN_IVCI"; // name of the umbilical vein connection

    // Dependent properties
    this.heart_rate = 0.0; // heartrate (bpm)
    this.heart_rate_btb = 0.0; // measured heartrate (bpm)
    this.resp_rate = 0.0; // respiratory rate in (/min)
    this.resp_rate_btb = 0.0; // measured respiratory rate (/min)
    this.abp_pre_syst = 0.0; // arterial blood pressure systole (mmHg)
    this.abp_pre_diast = 0.0; // arterial blood pressure diastole (mmHg)
    this.abp_pre_mean = 0.0; // arterial blood pressure mean (mmHg)
    this.abp_post_syst = 0.0; // arterial blood pressure systole (mmHg)
    this.abp_post_diast = 0.0; // arterial blood pressure diastole (mmHg)
    this.abp_post_mean = 0.0; // arterial blood pressure mean (mmHg)
    this.pap_syst = 0.0; // pulmonary artery pressure systole (mmHg)
    this.pap_diast = 0.0; // pulmonary artery pressure diastole (mmHg)
    this.pap_mean = 0.0; // pulmonary artery pressure mean (mmHg)
    this.edv_lv = 0.0; // left ventricular end diastolic volume
    this.esv_lv = 0.0; // left ventricular end systolic volume
    this.edp_lv = 0.0; // left ventricular end diastolic pressure
    this.esp_lv = 0.0; // left ventricular end systolic pressure
    this.edv_rv = 0.0; // left ventricular end diastolic volume
    this.esv_rv = 0.0; // left ventricular end systolic volume
    this.edp_rv = 0.0; // left ventricular end diastolic pressure
    this.esp_rv = 0.0; // left ventricular end systolic pressure
    this.cvp_ivci = 0.0; // central venous pressure (mmHg)
    this.cvp_svc = 0.0; // central venous pressure (mmHg)
    this.sao2_pre = 0.0; // arterial oxygen saturation in ascending aorta (%)
    this.sao2_post = 0.0; // arterial oxygen saturation in ascending aorta (%)
    this.svo2_ivci = 0.0; // venous oxygen saturation in right atrium (%)
    this.svo2_svc = 0.0; // venous oxygen saturation in right atrium (%)
    this.etco2 = 0.0; // end tidal partial pressure of carbon dioxide (kPa)
    this.temp = 0.0; // blood temperature (dgs C)
    this.co = 0.0; // cardiac output (l/min)
    this.ci = 0.0; // cardiac index (l/min/m2)
    this.lvo = 0.0; // left ventricular output (l/min)
    this.rvo = 0.0; // right ventricular output (l/min)
    this.lv_sv = 0.0; // left ventricular stroke volume (ml)
    this.rv_sv = 0.0; // right ventricular stroke volume (ml)
    this.ivc_flow = 0.0; // inferior vena cava flow (l/min)
    this.svc_flow = 0.0; // superior vena cava flow (l/min)
    this.cor_flow = 0.0; // coronary flow (l/min)
    this.brain_flow = 0.0; // brain flow (l/min)
    this.kid_flow = 0.0; // kidney flow (l/min)
    this.da_flow = 0.0; // ductus arteriosus flow (l/min)
    this.fo = 0.0; // foramen ovale flow (l/min)
    this.fo_ivci_flow = 0.0; // foramen ovale flow (l/min)
    this.fo_svc_flow = 0.0; // foramen ovale flow (l/min)
    this.vsd_flow = 0.0; // vsd flow (l/min)
    this.ips_flow = 0.0; // ips flow (l/min)
    this.fio2 = 0.0; // inspired fraction of oxygen
    this.pip = 0.0; // peak inspiratory pressure (cmH2O)
    this.p_plat = 0.0; // plateau inspiratory pressure (cmH2O)
    this.peep = 0.0; // positive end expiratory pressure (cmH2O)
    this.tidal_volume = 0.0; // tidal volume (l)
    this.ph = 0.0; // arterial ph
    this.po2 = 0.0; // arterial po2 (kPa)
    this.pco2 = 0.0; // arterial pco2 (kPa)
    this.hco3 = 0.0; // arterial bicarbonate concentration (mmol/l)
    this.be = 0.0; // arterial base excess concentration (mmol/l)
    this.dps = 0.0; //
    this.do2_br = 0.0
    this.do2_lb = 0.0

    // signals
    this.ecg_signal = 0.0; // ecg signal
    this.abp_signal = 0.0; // abp signal
    this.pap_signal = 0.0; // pap signal
    this.cvp_signal = 0.0; // cvp signal
    this.sao2_pre_signal = 0.0; // pulse-oximeter signal
    this.sao2_post_signal = 0.0; // pulse-oximeter signal
    this.sao2_signal = 0.0; // pulse-oximeter signal
    this.resp_signal = 0.0; // respiratory signal
    this.co2_signal = 0.0; // co2 signal

    // local properties
    this._heart = null; // reference to the heart model
    this._lv = null; // reference to the left ventricular model
    this._rv = null; // reference to the right ventricular model
    this._breathing = null; // reference to the breathing model
    this._ventilator = null; // reference to the mechanical ventilator model
    this._aa = null; // reference to the ascending aorta
    this._ad = null; // reference to the descending aorta
    this._ra_ivci = null; // reference to the inferior vena cava to right atrium connector
    this._ra_svc = null; // reference to the superior vena cava to right atrium connector
    this._pa = null; // reference to the pulmonary artery
    this._ds = null; // reference to the upper airway deadspace
    this._thorax = null; // reference to the thorax
    this._lv_aa = null; // reference to the aortic valve
    this._rv_pa = null; // reference to the pulmonary valve
    this._ivc_ra = null; // reference to the inferior cava to right atrium connector
    this._svc_ra = null; // reference to the superior cava to right atrium connector
    this._aa_cor = null; // reference to the coronaries to right atrium connector
    this._aa_br = null; // reference to the ascending aorta to brain connector
    this._ad_kid = null; // reference to the descending aorta to kidneys connector
    this._ad_ls = null; // reference to the descending aorta to liver and splachnic connector
    this._ad_int = null; // reference to the descending aorta to intestines connector
    this._ad_rlb = null; // reference to the descending aorta to rest of the body connector
    this._ad_umb_art = null; // reference to the umbilical artery connector
    this._umb_ven_ivci = null ;// reference to the umbilical vein connector
    this._fo_ivci = null; // reference to the foramen ovale
    this._fo_svc = null; // reference to the foramen ovale
    this._da = null; // reference to the ductus arteriosus
    this._vsd = null; // reference to the ventricular septal defect
    this._ips = null; // reference to the intrapulmonary shunt

    this._temp_aa_pres_max = -1000.0;
    this._temp_aa_pres_min = 1000.0;
    this._temp_ad_pres_max = -1000.0;
    this._temp_ad_pres_min = 1000.0;
    this._temp_ra_ivci_pres_max = -1000.0;
    this._temp_ra_ivci_pres_min = 1000.0;
    this._temp_ra_svc_pres_max = -1000.0;
    this._temp_ra_svc_pres_min = 1000.0;
    this._temp_pa_pres_max = -1000.0;
    this._temp_pa_pres_min = 1000.0;
    this._temp_lv_pres_max = -1000.0;
    this._temp_lv_pres_min = 1000.0;
    this._temp_rv_pres_max = -1000.0;
    this._temp_rv_pres_min = 1000.0;
    this._temp_lv_vol_max = -1000.0;
    this._temp_lv_vol_min = 1000.0;
    this._temp_rv_vol_max = -1000.0;
    this._temp_rv_vol_min = 1000.0;
    this._lvo_counter = 0.0;
    this._rvo_counter = 0.0;
    this._cor_flow_counter = 0.0;
    this._ivc_flow_counter = 0.0;
    this._svc_flow_counter = 0.0;
    this._brain_flow_counter = 0.0;
    this._kid_flow_counter = 0.0;
    this._ls_flow_counter = 0.0;
    this._int_flow_counter = 0.0;
    this._rlb_flow_counter = 0.0;
    this._da_flow_counter = 0.0;
    this._fo_ivci_flow_counter = 0.0;
    this._fo_svc_flow_counter = 0.0;
    this._vsd_flow_counter = 0.0;
    this._ips_flow_counter = 0.0;
    this._ua_flow_counter = 0.0;
    this._uv_flow_counter = 0.0;
    this._hr_list = [];
    this._hr_sum = 0.0;
    this._edv_lv_list = [];
    this._edv_lv_sum = 0.0;
    this._edv_rv_list = [];
    this._edv_rv_sum = 0.0;
    this._esv_lv_list = [];
    this._esv_lv_sum = 0.0;
    this._esv_rv_list = [];
    this._esv_rv_sum = 0.0;
    this._edp_lv_list = [];
    this._edp_rv_list = [];
    this._rr_list = [];
    this._sao2_list = [];
    this._sao2_pre_list = [];
    this._sao2_ven_list = [];
    this._rr_avg_counter = 0.0;
    this._sat_avg_counter = 0.0;
    this._sat_sampling_counter = 0.0;
    this._beats_counter = 0;
    this._beats_time = 0.0;
    this._qrs_interval_counter = 0.0;
    this._qrs_interval_counter_factor = 1.0;
  }

  init_model(args = {}) {
    // set the values of the independent properties
    args.forEach((arg) => {
      this[arg["key"]] = arg["value"];
    });

    // get the references to the models
    this._heart = this._model_engine.models[this.heart] ?? null;
    this._lv = this._model_engine.models[this.lv] ?? null;
    this._rv = this._model_engine.models[this.rv] ?? null;
    this._ra = this._model_engine.models[this.right_atrium] ?? null;
    this._ra_ivci = this._model_engine.models[this.right_atrium_ivci] ?? null;
    this._ra_svc = this._model_engine.models[this.right_atrium_svc] ?? null;
    this._breathing = this._model_engine.models[this.breathing] ?? null;
    this._ventilator = this._model_engine.models[this.ventilator] ?? null;
    this._ds = this._model_engine.models[this.deadspace] ?? null;
    this._thorax = this._model_engine.models[this.thorax] ?? null;
    this._aa = this._model_engine.models[this.ascending_aorta] ?? null;
    this._ad = this._model_engine.models[this.descending_aorta] ?? null;
    this._pa = this._model_engine.models[this.pulm_artery] ?? null;
    this._lv_aa = this._model_engine.models[this.aortic_valve] ?? null;
    this._rv_pa = this._model_engine.models[this.pulm_valve] ?? null;
    this._ivc_ra = this._model_engine.models[this.ivc_ra] ?? null;
    this._svc_ra = this._model_engine.models[this.svc_ra] ?? null;
    this._aa_cor = this._model_engine.models[this.aa_cor] ?? null;
    this._aa_br = this._model_engine.models[this.aa_brain] ?? null;
    this._ad_kid = this._model_engine.models[this.ad_kid] ?? null;
    this._ad_ls = this._model_engine.models[this.ad_ls] ?? null;
    this._ad_int = this._model_engine.models[this.ad_int] ?? null;
    this._ad_rlb = this._model_engine.models[this.ad_rlb] ?? null;
    this._da = this._model_engine.models[this.da] ?? null;
    this._fo_ivci = this._model_engine.models[this.fo_ivci] ?? null;
    this._fo_svc = this._model_engine.models[this.fo_svc] ?? null;
    this._vsd = this._model_engine.models[this.vsd] ?? null;
    this._ips = this._model_engine.models[this.ips] ?? null;
    this._ad_umb_art = this._model_engine.models[this.ua] ?? null;
    this._umb_ven_ivci = this._model_engine.models[this.uv] ?? null;
    this._rr_update_counter = 0.0;

    // flag that the model is initialized
    this._is_initialized = true;
  }

  calc_avg_heartrate(hr) {
    // average heart rate determination
    this._hr_list.push(hr);
    this._hr_sum += hr;

    // dynamic avg heartrate (Philips Intellivue doc state)
    if (hr < 80) {
      this.hr_avg_beats = 4.0
    } else {
      this.hr_avg_beats = 12.0
    }
    if (this._hr_list.length > this.hr_avg_beats) {
      const removed_hr = this._hr_list.shift();
      this._hr_sum -= removed_hr;
    }

    // get the rolling average of the heartrate
    this.heart_rate = this._hr_sum / this._hr_list.length;
  }

  calc_model() {
    // collect the pressure
    this.collect_pressures();

    // collect flows
    this.collect_blood_flows();

    // collect signals
    this.collect_signals();

    // collect temperature
    this.temp = this._aa ? this._aa.temp : this.temp;

    // collect end tidal pco2
    this.etco2 = this._ventilator ? this._ventilator.etco2 : this.etco2;

    // measure the R-R interval of the heartrate
    if (this._heart && this._heart.ncc_ventricular == 1) {
      this.heart_rate_btb = 60.0 / this._qrs_interval_counter;
      this._qrs_interval_counter = 0.0;
      this._qrs_interval_counter_factor = 1.0;
      this.calc_avg_heartrate(this.heart_rate_btb)
    }

    // update the heart frequency even when there's no contraction
    if (this._qrs_interval_counter > 1 * this._qrs_interval_counter_factor) {
      this.heart_rate_btb = 60 / this._qrs_interval_counter;
      this._qrs_interval_counter_factor += 1;
      this.calc_avg_heartrate(this.heart_rate_btb)
    }
    // (heart_rate is the rolling average maintained by calc_avg_heartrate; it is intentionally not
    // overwritten here with the beat-to-beat value, which is published separately as heart_rate_btb)

    // measure the interval between breaths
    if (this._rr_update_counter > 0.015) {
      this._rr_update_counter = 0.0;
      // get the spontaneous respiratory rate from the breathing model
      this.resp_rate = this._breathing ? this._breathing.resp_rate_measured : this.resp_rate;
    }
    this._rr_update_counter += this._t


    // determine the begin of the cardiac cycle
    if (this._heart && this._heart.ncc_ventricular === 1) {
      // add 1 beat
      this._beats_counter += 1;
      // blood pressures
      if (this._aa) {
        this.abp_pre_syst = this._temp_aa_pres_max;
        this.abp_pre_diast = this._temp_aa_pres_min;
        this.abp_pre_mean =
          (2 * this._temp_aa_pres_min + this._temp_aa_pres_max) / 3.0;
        this._temp_aa_pres_max = -1000.0;
        this._temp_aa_pres_min = 1000.0;
      }
      if (this._ad) {
        this.abp_post_syst = this._temp_ad_pres_max;
        this.abp_post_diast = this._temp_ad_pres_min;
        this.abp_post_mean = (2 * this._temp_ad_pres_min + this._temp_ad_pres_max) / 3.0;
        this._temp_ad_pres_max = -1000.0;
        this._temp_ad_pres_min = 1000.0;
      }
      if (this._ra_ivci) {
        this.cvp_ivci = (2 * this._temp_ra_ivci_pres_min + this._temp_ra_ivci_pres_max) / 3.0;
        this._temp_ra_ivci_pres_max = -1000.0;
        this._temp_ra_ivci_pres_min = 1000.0;
      }
      if (this._ra_svc) {
        this.cvp_svc = (2 * this._temp_ra_svc_pres_min + this._temp_ra_svc_pres_max) / 3.0;
        this._temp_ra_svc_pres_max = -1000.0;
        this._temp_ra_svc_pres_min = 1000.0;
      }

      if (this._pa) {
        this.pap_syst = this._temp_pa_pres_max;
        this.pap_diast = this._temp_pa_pres_min;
        this.pap_mean =
          (2 * this._temp_pa_pres_min + this._temp_pa_pres_max) / 3.0;
        this._temp_pa_pres_max = -1000.0;
        this._temp_pa_pres_min = 1000.0;
      }
      if (this._lv) {
        const edv_lv_value = this._temp_lv_vol_max * 1000.0;
        const edv_rv_value = this._temp_rv_vol_max * 1000.0;
        const esv_lv_value = this._temp_lv_vol_min * 1000.0;
        const esv_rv_value = this._temp_rv_vol_min * 1000.0;

        this._edv_lv_list.push(edv_lv_value);
        this._edv_rv_list.push(edv_rv_value);
        this._esv_lv_list.push(esv_lv_value);
        this._esv_rv_list.push(esv_rv_value);

        this._edv_lv_sum += edv_lv_value;
        this._edv_rv_sum += edv_rv_value;
        this._esv_lv_sum += esv_lv_value;
        this._esv_rv_sum += esv_rv_value;

        // get the rolling averages
        this.edv_lv = this._edv_lv_sum / this._edv_lv_list.length;
        this.edv_rv = this._edv_rv_sum / this._edv_rv_list.length;

        this.esv_lv = this._esv_lv_sum / this._esv_lv_list.length;
        this.esv_rv = this._esv_rv_sum / this._esv_rv_list.length;

        this.lv_sv = this.edv_lv - this.esv_lv
        this.rv_sv = this.edv_rv - this.esv_rv

        if (this._edv_lv_list.length > this.hr_avg_beats) {
          this._edv_lv_sum -= this._edv_lv_list.shift();
          this._edv_rv_sum -= this._edv_rv_list.shift();
          this._esv_lv_sum -= this._esv_lv_list.shift();
          this._esv_rv_sum -= this._esv_rv_list.shift();
        }

        this.edp_lv = this._temp_lv_pres_min;
        this.esp_lv = this._temp_lv_pres_max;
        this.edp_rv = this._temp_rv_pres_min;
        this.esp_rv = this._temp_rv_pres_max;

        // reset pressures
        this._temp_lv_pres_max = -1000
        this._temp_lv_pres_min = 1000
        this._temp_rv_pres_max = -1000
        this._temp_rv_pres_min = 1000

        // reset the volumes
        this._temp_lv_vol_max = -1000
        this._temp_lv_vol_min = 1000
        this._temp_rv_vol_max = -1000
        this._temp_rv_vol_min = 1000

      }
    }

    // cardiac outputs
    if (this._beats_counter > this.flow_avg_beats) {

      if (this._lv_aa) {
        this.lvo = (this._lvo_counter / this._beats_time) * 60.0;
        this._lvo_counter = 0.0;
      }
      if (this._rv_pa) {
        this.rvo = (this._rvo_counter / this._beats_time) * 60.0;
        this._rvo_counter = 0.0;
      }
      if (this._ivc_ra) {
        this.ivc_flow = (this._ivc_flow_counter / this._beats_time) * 60.0;
        this._ivc_flow_counter = 0.0;
      }
      if (this._svc_ra) {
        this.svc_flow = (this._svc_flow_counter / this._beats_time) * 60.0;
        this._svc_flow_counter = 0.0;
      }
      if (this._aa_cor) {
        this.cor_flow = (this._cor_flow_counter / this._beats_time) * 60.0;
        this._cor_flow_counter = 0.0;
      }
      if (this._aa_br) {
        this.brain_flow = (this._brain_flow_counter / this._beats_time) * 60.0;
        this._brain_flow_counter = 0.0;
        this.do2_br = this._aa ? this.brain_flow * this._aa.to2 * 22.4 : this.do2_br;
      }
      if (this._ad_kid) {
        this.kid_flow = (this._kid_flow_counter / this._beats_time) * 60.0;
        this._kid_flow_counter = 0.0;
        this.do2_lb = this._ad ? this.kid_flow * 4 * this._ad.to2 * 22.4 : this.do2_lb;
      }

      if (this._ad_ls) {
        this.ls_flow = (this._ls_flow_counter / this._beats_time) * 60.0;
        this._ls_flow_counter = 0.0;
      }

      if (this._ad_int) {
        this.int_flow = (this._int_flow_counter / this._beats_time) * 60.0;
        this._int_flow_counter = 0.0;
      }

      if (this._ad_rlb) {
        this.rlb_flow = (this._rlb_flow_counter / this._beats_time) * 60.0;
        this._rlb_flow_counter = 0.0;
      }

      if (this._da) {
        this.da_flow = (this._da_flow_counter / this._beats_time) * 60.0;
        this._da_flow_counter = 0.0;
      }

      if (this._fo_ivci && this._fo_svc) {
        this.fo_ivci_flow = (this._fo_ivci_flow_counter / this._beats_time) * 60.0;
        this._fo_ivci_flow_counter = 0.0;
        this.fo_svc_flow = (this._fo_svc_flow_counter / this._beats_time) * 60.0;
        this._fo_svc_flow_counter = 0.0;
        this.fo_flow = this.fo_ivci_flow + this.fo_svc_flow;  

      }      

      if (this._vsd) {
        this.vsd_flow = (this._vsd_flow_counter / this._beats_time) * 60.0;
        this._vsd_flow_counter = 0.0;
      }

      if (this._ips) {
        this.ips_flow = (this._ips_flow_counter / this._beats_time) * 60.0;
        this._ips_flow_counter = 0.0;
      }

      if (this._ad_umb_art) {
        this.ua_flow = (this._ua_flow_counter / this._beats_time) * 60.0;
        this._ua_flow_counter = 0.0;
      }

      if (this._umb_ven_ivci) {
        this.uv_flow = (this._uv_flow_counter / this._beats_time) * 60.0;
        this._uv_flow_counter = 0.0;
      }

      // reset the counters
      this._beats_counter = 0;
      this._beats_time = 0.0;
    }

    // increase the timers
    this._qrs_interval_counter += this._t;
    this._beats_time += this._t;

    // get the pre- and postductal arterial o2-saturation levels from the ascending and descending aorta
    this.sao2_pre = this._aa ? this._aa.so2 : this.sao2_pre;
    this.sao2_post = this._ad ? this._ad.so2 : this.sao2_post;

    // get the venous o2 saturation from the right atrium
    this.svo2_ivci = this._ra_ivci ? this._ra_ivci.so2 : 0.0;
    this.svo2_svc = this._ra_svc ? this._ra_svc.so2 : 0.0;

  }
  collect_signals() {
    this.ecg_signal = this._heart ? this._heart.ecg_signal : 0.0;
    this.resp_signal = this._thorax ? this._thorax.vol : 0.0;
    this.sao2_pre_signal = this._aa ? this._aa.pres_in : 0.0;
    this.sao2_post_signal = this._ad ? this._ad.pres_in : 0.0;
    this.abp_signal = this._ad ? this._ad.pres_in : 0.0;
    this.pap_signal = this._pa ? this._pa.pres_in : 0.0;
    this.cvp_signal = this._ra_ivci ? this._ra_ivci.pres_in : 0.0;
    this.co2_signal = this._ventilator ? this._ventilator.co2 : 0.0;
  }

  collect_pressures() {
    this._temp_aa_pres_max = this._aa ? Math.max(this._temp_aa_pres_max, this._aa.pres_in) : -1000;
    this._temp_aa_pres_min = this._aa ? Math.min(this._temp_aa_pres_min, this._aa.pres_in) : 1000;

    this._temp_lv_pres_max = this._lv ? Math.max(this._temp_lv_pres_max, this._lv.pres_in) : -1000;
    this._temp_lv_pres_min = this._lv ? Math.min(this._temp_lv_pres_min, this._lv.pres_in) : 1000;

    this._temp_rv_pres_max = this._rv ? Math.max(this._temp_rv_pres_max, this._rv.pres_in) : -1000;
    this._temp_rv_pres_min = this._rv ? Math.min(this._temp_rv_pres_min, this._rv.pres_in) : 1000;

    this._temp_lv_vol_max = this._lv ? Math.max(this._temp_lv_vol_max, this._lv.vol) : -1000;
    this._temp_lv_vol_min = this._lv ? Math.min(this._temp_lv_vol_min, this._lv.vol) : 1000;

    this._temp_rv_vol_max = this._rv ? Math.max(this._temp_rv_vol_max, this._rv.vol) : -1000;
    this._temp_rv_vol_min = this._rv ? Math.min(this._temp_rv_vol_min, this._rv.vol) : 1000;

    this._temp_ad_pres_max = this._ad ? Math.max(this._temp_ad_pres_max, this._ad.pres_in) : -1000;
    this._temp_ad_pres_min = this._ad ? Math.min(this._temp_ad_pres_min, this._ad.pres_in) : 1000;

    this._temp_ra_ivci_pres_max = this._ra_ivci ? Math.max(this._temp_ra_ivci_pres_max, this._ra_ivci.pres_in) : -1000;
    this._temp_ra_ivci_pres_min = this._ra_ivci ? Math.min(this._temp_ra_ivci_pres_min, this._ra_ivci.pres_in) : 1000;
    
    this._temp_ra_svc_pres_max = this._ra_svc ? Math.max(this._temp_ra_svc_pres_max, this._ra_svc.pres_in) : -1000;
    this._temp_ra_svc_pres_min = this._ra_svc ? Math.min(this._temp_ra_svc_pres_min, this._ra_svc.pres_in) : 1000;

    this._temp_pa_pres_max = this._pa ? Math.max(this._temp_pa_pres_max, this._pa.pres_in) : -1000;
    this._temp_pa_pres_min = this._pa ? Math.min(this._temp_pa_pres_min, this._pa.pres_in) : 1000;
  }

  collect_blood_flows() {
    this._lvo_counter += this._lv_aa ? this._lv_aa.flow * this._t : 0.0;
    this._rvo_counter += this._rv_pa ? this._rv_pa.flow * this._t : 0.0;
    this._cor_flow_counter += this._aa_cor ? this._aa_cor.flow * this._t : 0.0;
    this._ivc_flow_counter += this._ivc_ra ? this._ivc_ra.flow * this._t : 0.0;
    this._svc_flow_counter += this._svc_ra ? this._svc_ra.flow * this._t : 0.0;
    this._brain_flow_counter += this._aa_br ? this._aa_br.flow * this._t : 0.0;
    this._kid_flow_counter += this._ad_kid ? this._ad_kid.flow * this._t : 0.0;
    this._ls_flow_counter += this._ad_ls ? this._ad_ls.flow * this._t : 0.0;
    this._int_flow_counter += this._ad_int ? this._ad_int.flow * this._t : 0.0;
    this._rlb_flow_counter += this._ad_rlb ? this._ad_rlb.flow * this._t : 0.0;
    this._da_flow_counter += this._da ? this._da.flow * this._t : 0.0;
    this._fo_ivci_flow_counter += this._fo_ivci ? this._fo_ivci.flow * this._t : 0.0;
    this._fo_svc_flow_counter += this._fo_svc ? this._fo_svc.flow * this._t : 0.0;
    this._vsd_flow_counter += this._vsd ? this._vsd.flow * this._t : 0.0;
    this._ips_flow_counter += this._ips ? this._ips.flow * this._t : 0.0;
    this._ua_flow_counter += this._ad_umb_art ? this._ad_umb_art.flow * this._t : 0.0;
    this._uv_flow_counter += this._umb_ven_ivci ? this._umb_ven_ivci.flow * this._t : 0.0;
  }
}

