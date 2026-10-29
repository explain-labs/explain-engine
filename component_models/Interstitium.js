import { BaseModelClass } from "../base_models/BaseModelClass.js";

/*
  The Interstitium is the extracellular fluid outside the blood: one well-mixed pool fed by Starling
  filtration from the systemic capillary beds and drained by lymph back into the venous system. Like
  Kidneys it holds no blood itself: its pool is plain state (volume, solutes, albumin), so it stays out
  of the blood-pool loops (warming, lactate clearance, glucose, drugs, the Circulation volume sums).

  Per filtration site, every 15 ms:
    Jv  = Kf_i · [(Pc − Pif) − σ(πp − πif) − p_offset_i]
    Pc  = the bed's capillary pressure: its own pressure (a *_CAP compartment) or, for a lumped bed with
          its vein named (RUB/VUB), Pv + (Pa − Pv) · pc_art_fraction (Pappenheimer)
    πp, πif = oncotic_base · albumin / albumin_ref (the Kidneys law)
  The offsets are seeded after a warm-up so each site filters its share of the resting lymph flow:
  neutral at rest, and Kf sets how strongly the beds respond to a change.

  Lymph:  Q = lymph_flow_rest · (1 + gain·(Pif − Pif_rest)) · (1 − lymph_pv_gain·(Pv − Pv_rest)), gain =
          lymph_gain above the resting pressure and lymph_gain_below under it
          clamped to 0 … lymph_max_ratio · lymph_flow_rest, into lymph_site with the pool's composition.

  Interstitial pressure: Pif = pif_rest + (V − V_rest)/C, with C = compliance_above above the resting
  volume and compliance_below under it (stiff: a dehydrated interstitium gives little fluid).

  Water carries the small solutes at the bed's concentration; albumin crosses by (1 − σ) convection
  plus a diffusive exchange (albumin_ps, seeded so the resting pool holds isf_albumin_ratio · plasma);
  haemoglobin, glucose (Glucose owns its own interstitial exchange), the drugs and the blood gases stay
  in the blood and concentrate as water leaves.
*/

export class Interstitium extends BaseModelClass {
  // static properties
  static model_type = "Interstitium";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent parameters (config)
    this.isf_volume_per_kg = 0.36; // L/kg — resting interstitial volume (ECF ~0.40 minus the plasma)
    this.pif_rest = -1.0; // mmHg — resting interstitial fluid pressure
    this.compliance_above = 40.0; // mL/mmHg/kg — above the resting volume
    this.compliance_below = 4.0; // mL/mmHg/kg — below the resting volume
    this.kf_per_kg = 0.08; // mL/min/mmHg/kg — whole-body capillary filtration coefficient (fitted, term 72 h)
    this.sigma = 0.85; // albumin reflection coefficient
    this.oncotic_base = 18.0; // mmHg — oncotic pressure at albumin_ref (as Kidneys)
    this.albumin_ref = 25.0; // g/L
    this.isf_albumin_ratio = 0.6; // resting interstitial / plasma albumin (πif / πp)
    this.lymph_flow_rest = 0.1; // mL/min/kg — resting lymph flow (= resting net filtration)
    this.lymph_gain = 1.0; // fractional rise of lymph flow per mmHg of Pif above rest
    this.lymph_gain_below = 0.3; // fractional fall per mmHg of Pif below rest (no data; weaker, so lymph keeps flowing)
    this.lymph_pv_gain = 0.127; // fractional fall of lymph flow per mmHg of outflow pressure above rest
    this.lymph_max_ratio = 3.4; // lymph flow ceiling (× rest)
    this.lymph_site = "SVC"; // venous compartment the thoracic duct drains into
    this.pc_art_fraction = 0.2; // lumped beds: share of the arteriovenous pressure drop downstream of the capillaries
    this.seed_delay = 30.0; // s of warm-up averaging before the resting balance is seeded
    // filtration sites: the bed's compartment, its vein for a lumped bed (else ""), its share of Kf
    this.filtration_sites = [
      { bed: "RUB", vein: "VUB", share: 0.4 },
      { bed: "RLB", vein: "VLB", share: 0.4 },
      { bed: "INT_CAP", vein: "", share: 0.12 },
      { bed: "LS_CAP", vein: "", share: 0.08 },
    ];
    // small solutes that travel with the water at the bed's concentration (as Kidneys)
    this.filterable_solutes = ["na", "k", "ca", "cl", "lact", "mg", "phosphates", "uma"];

    // factor stack on Kf (additive, like Kidneys.kf)
    this.kf_factor = 1.0;
    this.kf_factor_ps = 1.0;
    this.kf_factor_scaling_ps = 1.0;

    // -----------------------------------------------
    // state (saved): the pool and the seeded resting balance
    this.isf_volume = 0.0; // L; <= 0 → seeded at isf_volume_per_kg · weight
    this.isf_volume_rest = 0.0; // L — the volume Pif is referenced to
    this.isf_solutes = {}; // mmol/L (albumin g/L); empty → seeded from the first site's blood
    this.p_offsets = []; // mmHg per site; empty → seeded after the warm-up
    this.pv_rest = 0.0; // mmHg — resting lymph outflow pressure (seeded)
    this.albumin_ps = 0.0; // L/s — diffusive albumin exchange (seeded)

    // -----------------------------------------------
    // dependent parameters (read-outs, clinical units)
    this.pif = 0.0; // mmHg
    this.oncotic_if = 0.0; // mmHg
    this.net_filtration = 0.0; // mL/min, blood → interstitium
    this.lymph_flow = 0.0; // mL/min, interstitium → blood
    this.isf_volume_ml_kg = 0.0; // mL/kg

    // -----------------------------------------------
    // local parameters
    this._sites = [];
    this._lymph_site = null;
    this._update_interval = 0.015;
    this._update_counter = 0.0;
    this._seed_timer = 0.0;
    this._seed_sums = null; // per-site time integrals of the Starling drive during the warm-up
    this._pv_sum = 0.0;
  }

  init_model(args = []) {
    super.init_model(args);
  }

  calc_model() {
    this._update_counter += this._t;
    if (this._update_counter < this._update_interval) return;
    const u = this._update_counter;
    this._update_counter = 0.0;

    // the beds are Circulation components and may be built after us: resolve lazily
    if (this._sites.length !== this.filtration_sites.length || !this._lymph_site) this._resolve();
    if (!this._lymph_site || this._sites.length === 0) return;

    const w = this._model_engine.weight;
    if (!(this.isf_volume > 0.0)) {
      this.isf_volume = this.isf_volume_per_kg * w;
      this.isf_volume_rest = this.isf_volume;
    }
    if (!(this.isf_volume_rest > 0.0)) this.isf_volume_rest = this.isf_volume;
    if (Object.keys(this.isf_solutes).length === 0) this._seed_solutes(this._sites[0].bed);

    this.pif = this._pif();
    this.oncotic_if = this._oncotic(this.isf_solutes.albumin);

    // warm-up: average each site's Starling drive and the lymph outflow pressure, then seed the
    // offsets so every site filters its share of the resting lymph flow
    if (this.p_offsets.length !== this._sites.length) {
      this._warm_up(u);
      this._readouts(0.0, 0.0, w);
      return;
    }

    // filtration, per site (L over this update)
    const kf = this._kf_eff() * w / 60000.0; // L/s/mmHg
    let jv_total = 0.0;
    this._sites.forEach((s, i) => {
      const jv = kf * s.share * (this._drive(s) - this.p_offsets[i]); // L/s
      jv_total += this._filter(s.bed, jv * u);
      this._diffuse_albumin(s, u);
    });

    // lymph back to the venous system
    const q_rest = this.lymph_flow_rest * w / 60000.0; // L/s
    const d_pif = this.pif - this.pif_rest;
    let ratio = (1.0 + (d_pif >= 0.0 ? this.lymph_gain : this.lymph_gain_below) * d_pif) * (1.0 - this.lymph_pv_gain * (this._lymph_site.pres - this.pv_rest));
    if (ratio < 0.0) ratio = 0.0;
    if (ratio > this.lymph_max_ratio) ratio = this.lymph_max_ratio;
    let lymph = q_rest * ratio * u; // L
    if (lymph > this.isf_volume * 0.5) lymph = this.isf_volume * 0.5;
    if (lymph > 0.0) {
      this._lymph_site.volume_in(lymph, { to2: 0.0, tco2: 0.0, temp: this._lymph_site.temp, solutes: this.isf_solutes, drugs: {} });
      this.isf_volume -= lymph;
    }

    this._readouts(jv_total / u, lymph / u, w);
  }

  _resolve() {
    const models = this._model_engine.models;
    this._lymph_site = models[this.lymph_site] ?? null;
    this._sites = [];
    for (const f of this.filtration_sites) {
      const bed = models[f.bed];
      if (!bed) continue;
      this._sites.push({ bed, vein: f.vein ? models[f.vein] ?? null : null, share: f.share });
    }
  }

  _seed_solutes(src) {
    for (const s of this.filterable_solutes) this.isf_solutes[s] = src.solutes?.[s] ?? 0.0;
    this.isf_solutes.albumin = this.isf_albumin_ratio * (src.solutes?.albumin ?? this.albumin_ref);
  }

  _warm_up(u) {
    if (!this._seed_sums || this._seed_sums.length !== this._sites.length) {
      this._seed_sums = this._sites.map(() => 0.0);
      this._pv_sum = 0.0;
      this._seed_timer = 0.0;
    }
    this._sites.forEach((s, i) => (this._seed_sums[i] += this._drive(s) * u));
    this._pv_sum += this._lymph_site.pres * u;
    this._seed_timer += u;
    if (this._seed_timer < this.seed_delay) return;

    // Kf_i · (drive − offset) = share_i · lymph_rest  →  offset = drive − lymph_rest / Kf
    const kf = this._kf_eff();
    const excess = kf > 0.0 ? this.lymph_flow_rest / kf : 0.0; // mmHg
    this.p_offsets = this._seed_sums.map((sum) => sum / this._seed_timer - excess);
    this.pv_rest = this._pv_sum / this._seed_timer;

    // diffusive albumin exchange that holds the resting pool at isf_albumin_ratio · plasma:
    // q·(1−σ)·Cp + PS·(Cp − Cif) = q·Cif
    const q = this.lymph_flow_rest * this._model_engine.weight / 60000.0; // L/s
    const cp = this._sites[0].bed.solutes?.albumin ?? this.albumin_ref;
    const cif = this.isf_solutes.albumin;
    this.albumin_ps = cp > cif ? Math.max(0.0, (q * cif - q * (1.0 - this.sigma) * cp) / (cp - cif)) : 0.0;
    this._seed_sums = null;
  }

  // Starling drive of a site without its offset (mmHg)
  _drive(s) {
    const pc = s.vein ? s.vein.pres + (s.bed.pres - s.vein.pres) * this.pc_art_fraction : s.bed.pres;
    const pi_p = this._oncotic(s.bed.solutes?.albumin);
    return pc - this.pif - this.sigma * (pi_p - this.oncotic_if);
  }

  // move dv litres of water from a blood compartment into the pool (dv < 0: back into the blood).
  // Returns the volume moved
  _filter(src, dv) {
    if (dv === 0.0) return 0.0;
    if (dv > 0.0) {
      // never drain the compartment below a small floor
      if (dv > src.vol * 0.5) dv = src.vol * 0.5;
      const vol_before = src.vol;
      const vol_after = vol_before - dv;
      const pool_after = this.isf_volume + dv;
      for (const s of this.filterable_solutes) {
        const c = src.solutes?.[s] ?? 0.0;
        this.isf_solutes[s] = ((this.isf_solutes[s] ?? 0.0) * this.isf_volume + c * dv) / pool_after;
      }
      // albumin crosses by (1 − σ) convection, out of the blood's mass
      const cp = src.solutes?.albumin ?? 0.0;
      const cif = this.isf_solutes.albumin ?? 0.0;
      const m_alb = (1.0 - this.sigma) * cp * dv;
      this.isf_solutes.albumin = (cif * this.isf_volume + m_alb) / pool_after;
      // what does not cross keeps its mass in the smaller blood volume
      const ratio = vol_before / vol_after;
      for (const s in src.solutes) {
        if (this.filterable_solutes.includes(s) || typeof src.solutes[s] !== "number") continue;
        src.solutes[s] = s === "albumin" ? (cp * vol_before - m_alb) / vol_after : src.solutes[s] * ratio;
      }
      for (const d in src.drugs) if (typeof src.drugs[d] === "number") src.drugs[d] *= ratio;
      src.to2 *= ratio;
      src.tco2 *= ratio;
      src.vol = vol_after;
      this.isf_volume = pool_after;
      return dv;
    }
    // absorption: pool water and small solutes back into the bed, albumin by (1 − σ) convection;
    // no haemoglobin, glucose, drugs or gases (the blood's own dilute by the volume, keeping their mass)
    let back = -dv;
    if (back > this.isf_volume * 0.5) back = this.isf_volume * 0.5;
    const fluid = { to2: src.to2, tco2: src.tco2, temp: src.temp, solutes: { ...src.solutes }, drugs: { ...src.drugs } };
    for (const s of this.filterable_solutes) fluid.solutes[s] = this.isf_solutes[s] ?? 0.0;
    fluid.solutes.albumin = (1.0 - this.sigma) * (this.isf_solutes.albumin ?? 0.0);
    for (const k of ["hemoglobin", "glucose"]) if (k in fluid.solutes) fluid.solutes[k] = 0.0;
    for (const d in fluid.drugs) fluid.drugs[d] = 0.0;
    fluid.to2 = 0.0;
    fluid.tco2 = 0.0;
    this.isf_solutes.albumin = ((this.isf_solutes.albumin ?? 0.0) * this.isf_volume - fluid.solutes.albumin * back) / (this.isf_volume - back);
    src.volume_in(back, fluid);
    this.isf_volume -= back;
    return -back;
  }

  // diffusive albumin exchange of one site over u seconds (mass in g, concentrations g/L)
  _diffuse_albumin(s, u) {
    if (!(this.albumin_ps > 0.0)) return;
    const cp = s.bed.solutes?.albumin ?? 0.0;
    const cif = this.isf_solutes.albumin ?? 0.0;
    let m = this.albumin_ps * s.share * (cp - cif) * u;
    // never move more than a fraction of either side's mass in one update
    const lim = 0.1 * Math.min(cp * s.bed.vol, cif * this.isf_volume);
    if (m > lim) m = lim;
    if (m < -lim) m = -lim;
    if (s.bed.vol > 0.0) s.bed.solutes.albumin = cp - m / s.bed.vol;
    this.isf_solutes.albumin = cif + m / this.isf_volume;
  }

  _pif() {
    const w = this._model_engine.weight;
    const dv = this.isf_volume - this.isf_volume_rest; // L
    const c = (dv >= 0.0 ? this.compliance_above : this.compliance_below) * w / 1000.0; // L/mmHg
    return this.pif_rest + (c > 0.0 ? dv / c : 0.0);
  }

  _oncotic(albumin) {
    return this.oncotic_base * ((albumin ?? this.albumin_ref) / this.albumin_ref);
  }

  _kf_eff() {
    const kf =
      this.kf_per_kg +
      (this.kf_factor - 1.0) * this.kf_per_kg +
      (this.kf_factor_ps - 1.0) * this.kf_per_kg +
      (this.kf_factor_scaling_ps - 1.0) * this.kf_per_kg;
    this.kf_factor = 1.0;
    return kf > 0.0 ? kf : 0.0;
  }

  _readouts(jv, lymph, w) {
    this.net_filtration = jv * 60000.0; // L/s → mL/min
    this.lymph_flow = lymph * 60000.0;
    this.isf_volume_ml_kg = (this.isf_volume * 1000.0) / w;
  }
}
