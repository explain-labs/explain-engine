import { BaseModelClass } from "../base_models/BaseModelClass.js";

/*
  The Kidneys class turns the (otherwise passive) renal vascular bed
  (KID_ART -> KID_CAP -> KID_VEN) into an active filtration unit. It is a
  controller/process model (like Placenta): it does not hold blood itself but
  operates on the existing glomerular-capillary compartment (KID_CAP) and a new
  URINE bladder compartment it owns via the `components` mechanism.

  MVP scope: FLUID BALANCE & URINE OUTPUT only.
    glomerular Starling filtration -> GFR
    tubular reabsorption (single scalar fraction)
    net urine = GFR * (1 - reabsorption_fraction)
    -> water + freely-filterable small solutes leave the blood into URINE,
       slowly lowering the circulating blood volume (diuresis).

  NOT in this version: electrolyte homeostasis, clearance/acid-base, RAAS/ADH,
  GFR autoregulation. Albumin & hemoglobin are NOT filtered (retained in blood).
*/

export class Kidneys extends BaseModelClass {
  // static properties
  static model_type = "Kidneys";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // independent parameters (config)
    this.kidneys_running = true; // master gate for filtration
    this.kid_cap_name = "KID_CAP"; // glomerular capillary compartment (filtration source)
    this.urine_name = "URINE"; // bladder / urine sink compartment

    this.kf = 6.6e-6; // glomerular filtration coefficient (L/s per mmHg) — SCENARIO-CALIBRATED
    this.p_bowman = 8.0; // Bowman's capsule hydrostatic pressure (mmHg)
    this.oncotic_base = 18.0; // plasma oncotic pressure at reference albumin (mmHg)
    this.albumin_ref = 25.0; // reference plasma albumin the oncotic_base is tied to (g/L)
    this.reabsorption_fraction = 0.985; // fraction of GFR reabsorbed; urine = GFR*(1-FR)

    // small solutes that travel into the urine at plasma concentration.
    // albumin & hemoglobin are deliberately EXCLUDED (retained -> hemoconcentration)
    this.filterable_solutes = ["na", "k", "ca", "cl", "lact", "mg", "phosphates", "uma"];

    // factor stack on kf (additive, like Capacitance/Resistor) so it composes with
    // interventions (non-persistent), scenario adjustments (persistent) and ModelScaler
    this.kf_factor = 1.0;
    this.kf_factor_ps = 1.0;
    this.kf_factor_scaling_ps = 1.0;

    // factor stack on the reabsorption fraction (multiplicative, since it is a fraction)
    this.reabs_factor = 1.0;
    this.reabs_factor_ps = 1.0;
    this.reabs_factor_scaling_ps = 1.0;

    // -----------------------------------------------
    // dependent parameters (read-outs, clinical units)
    this.nfp = 0.0; // net filtration pressure (mmHg)
    this.gfr = 0.0; // glomerular filtration rate (mL/min)
    this.urine_flow = 0.0; // urine output (mL/min)
    this.urine_volume = 0.0; // total diuresis = URINE.vol (mL)

    // -----------------------------------------------
    // local parameters
    this._gfr_ls = 0.0; // GFR in L/s (used for the transfer math)
    this._urine_ls = 0.0; // urine flow in L/s
    this._kf_eff = 0.0; // effective filtration coefficient after factors
    this._reabs_eff = 0.0; // effective reabsorption fraction after factors
    this._kid_cap = null; // reference to the glomerular capillary (source)
    this._urine = null; // reference to the URINE bladder (sink)
  }

  init_model(args) {
    // base applies args and instantiates the URINE component into model.models
    super.init_model(args);

    // URINE is our OWN component (just instantiated by super) — safe to resolve now.
    this._urine = this._model_engine.models[this.urine_name] ?? null;
    // KID_CAP is a component of another model (Circulation) that may be instantiated
    // AFTER us in build order, so it is resolved lazily in calc_model().
  }

  calc_model() {
    // lazy reference resolution: KID_CAP (a Circulation component) may not have existed
    // at init time; by the first step the build is complete and all models are registered
    if (!this._kid_cap) this._kid_cap = this._model_engine.models[this.kid_cap_name] ?? null;
    if (!this._urine) this._urine = this._model_engine.models[this.urine_name] ?? null;

    // gating and wiring guards
    if (!this.kidneys_running) {
      this._zero_outputs();
      return;
    }
    if (!this._kid_cap || !this._urine) return;
    if (this._kid_cap.vol <= 0.0) {
      this._zero_outputs();
      return;
    }

    // effective filtration coefficient (3-layer additive convention)
    this._kf_eff =
      this.kf +
      (this.kf_factor - 1.0) * this.kf +
      (this.kf_factor_ps - 1.0) * this.kf +
      (this.kf_factor_scaling_ps - 1.0) * this.kf;
    this.kf_factor = 1.0; // reset the non-persistent layer

    // effective reabsorption fraction (multiplicative, clamped to a sane fraction)
    this._reabs_eff =
      this.reabsorption_fraction *
      this.reabs_factor *
      this.reabs_factor_ps *
      this.reabs_factor_scaling_ps;
    this.reabs_factor = 1.0;
    if (this._reabs_eff < 0.0) this._reabs_eff = 0.0;
    if (this._reabs_eff > 0.9999) this._reabs_eff = 0.9999;

    // Starling net filtration pressure
    const p_glom = this._kid_cap.pres; // glomerular hydrostatic pressure (mmHg)
    const onc = this._oncotic_pressure(); // plasma oncotic pressure (mmHg)
    this.nfp = p_glom - this.p_bowman - onc;
    if (this.nfp < 0.0) this.nfp = 0.0;

    // GFR and net urine flow (L/s) — only the net leaves the blood
    this._gfr_ls = this._kf_eff * this.nfp;
    this._urine_ls = this._gfr_ls * (1.0 - this._reabs_eff);

    // conservative volume + solute transfer this step
    this._transfer(this._urine_ls * this._t);

    // read-outs in clinical units
    this.gfr = this._gfr_ls * 60000.0; // L/s -> mL/min
    this.urine_flow = this._urine_ls * 60000.0; // L/s -> mL/min
    this.urine_volume = this._urine.vol * 1000.0; // L -> mL (cumulative diuresis)
  }

  // plasma oncotic pressure, simple linear approximation tied to albumin so it both
  // opposes filtration at baseline and rises with hemoconcentration (self-limiting)
  _oncotic_pressure() {
    const alb = this._kid_cap.solutes?.albumin ?? this.albumin_ref;
    return this.oncotic_base * (alb / this.albumin_ref);
  }

  // conservative transfer of the net urine from KID_CAP into the URINE bladder.
  // NOT BloodCapacitance.volume_in (which would copy ALL solutes incl. albumin/Hb and
  // cause artifactual proteinuria + progressive blood protein loss).
  _transfer(dvol) {
    if (dvol <= 0.0) return;

    const src = this._kid_cap;

    // never drain more than available; keep a tiny floor so vol stays > 0
    const max_removable = src.vol - 1e-9;
    if (max_removable <= 0.0) return;
    if (dvol > max_removable) dvol = max_removable;

    // 1. snapshot plasma concentrations of the FILTERABLE solutes
    const conc = {};
    for (const s of this.filterable_solutes) {
      conc[s] = src.solutes?.[s] ?? 0.0;
    }

    // 2. remove water from the blood. solutes are stored as concentrations, so lowering
    //    vol alone keeps every concentration constant (corrected for proteins in step 4)
    const vol_before = src.vol;
    src.vol -= dvol;
    if (src.vol < 0.0) src.vol = 0.0;
    const vol_after = src.vol;

    // 3. mass-mix water + filterable solutes into the URINE bladder (concentration store)
    const old_uvol = this._urine.vol;
    const new_uvol = old_uvol + dvol;
    if (new_uvol > 0.0) {
      for (const s of this.filterable_solutes) {
        const existing = this._urine.solutes?.[s] ?? 0.0;
        this._urine.solutes[s] = (existing * old_uvol + conc[s] * dvol) / new_uvol;
      }
    }
    this._urine.vol = new_uvol;

    // 4. hemoconcentration: albumin & hemoglobin stay in the blood (total amount
    //    conserved), so their concentration must rise as the plasma volume shrank
    if (vol_after > 0.0) {
      const ratio = vol_before / vol_after;
      for (const s of ["albumin", "hemoglobin"]) {
        if (src.solutes?.[s] !== undefined) src.solutes[s] *= ratio;
      }
    }
  }

  // zero the active read-outs while keeping the accumulated bladder volume
  _zero_outputs() {
    this._gfr_ls = 0.0;
    this._urine_ls = 0.0;
    this.nfp = 0.0;
    this.gfr = 0.0;
    this.urine_flow = 0.0;
    if (this._urine) this.urine_volume = this._urine.vol * 1000.0;
  }
}
