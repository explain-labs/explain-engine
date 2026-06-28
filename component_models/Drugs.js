import { BaseModelClass } from "../base_models/BaseModelClass";

/*
  The Drugs class is the pharmacology (PK/PD) controller. Like `Hormones` and `Ans` it is a process
  controller: it holds no blood of its own, resolves references to other models lazily, and owns its
  effector channels while enabled (releasing them once on disable).

  CAUSAL LOOP (per drug):

    SOURCE  — dosing injects drug mass into a blood compartment's existing `drugs{}` dict:
                bolus    : C += dose / vol                 (dose in mcg, vol in L → ng/mL)
                infusion : C += (rate·weight/60)·dt / vol  (rate in mcg/kg/min)
    TRANSPORT — handled entirely by the engine's existing `volume_in` mixing (BloodCapacitance /
                BloodTimeVaryingElastance / HeartChamber): any key present in a compartment's
                `drugs{}` advects through the whole circuit by incoming-volume fraction, exactly as
                solutes (Na/K) do. We only SEED the key into every blood compartment (the dicts ship
                empty), lazily on the first step.
    SINK    — elimination = a diffuse first-order term on every compartment (`clearance.global`,
                e.g. COMT/MAO/uptake) PLUS organ-localized intrinsic clearance at configured clearing
                compartments (`clearance.sites`, e.g. KID_CAP renal, LS_CAP hepatic). Because those
                organ compartments are continuously perfused, the localized term yields
                perfusion-/flow-scaled whole-body clearance (a well-stirred organ model): if organ
                blood flow falls, the drug lingers — exactly like real renal/hepatic clearance.
    BIOPHASE — optional effect compartment per drug: dCe/dt = ke0·(C_site − Ce). When ke0 > 0 the PD
                map is driven by the lagged biophase concentration Ce, giving onset/offset hysteresis
                (effect peak trails the plasma peak). ke0 = 0 (default) → PD uses the site conc directly.
    EFFECT  — each drug contributes an independent sigmoid Emax/Hill per effect; the contributions
                are SUMMED across all enabled drugs onto the shared *_drug_factor channels (so two
                drugs compose additively rather than overwrite). M2 effects: heart rate (β1
                chronotropy → Heart.hr_drug_factor), contractility (β1 inotropy → each chamber's
                el_max_drug_factor), systemic vascular resistance (α1 → Circulation.svr_factor_drug).

  Concentration unit convention: mcg/L ≡ ng/mL throughout (dose in mcg, blood volumes in L).

  Adding a drug = a new `drug_defs` entry (it is seeded, transported, cleared and aggregated
  automatically). Next milestone (M4): surface params + dosing methods to the UI registry.
*/

export class Drugs extends BaseModelClass {
  // static properties
  static model_type = "Drugs";

  constructor(model_ref, name = "") {
    super(model_ref, name);

    // -----------------------------------------------
    // gating
    this.drugs_running = true; // master gate (false → effector channels released to neutral)

    // -----------------------------------------------
    // wiring (resolved lazily; the blood compartments are built by Circulation AFTER this model inits)
    this.injection_site = "IVCI"; // central-venous compartment that receives IV boluses/infusions
    this.effect_site = "AA"; // systemic-arterial compartment whose concentration drives the effect
    this.heart_name = "Heart"; // effector target (heart-rate + contractility channels)
    this.circulation_name = "Circulation"; // effector target (systemic vascular resistance channel)

    // -----------------------------------------------
    // per-drug registry. Concentrations live in the compartments' drugs{} dict (ng/mL = mcg/L).
    // clearance.global = diffuse first-order rate (1/s) on every compartment; clearance.sites =
    // organ-localized intrinsic rates (1/s) at the named clearing compartments (perfusion-scaled).
    // ke0 = effect-compartment rate (1/s); 0 disables the biophase lag. Each effect is an
    // independent sigmoid Emax/Hill; emax is the max FRACTIONAL change on its *_drug_factor.
    this.drug_defs = {
      adrenaline: {
        enabled: true,
        // PK — mostly diffuse (adrenaline is widely metabolised) with a minor renal/hepatic component
        clearance: { global: 0.022, sites: { KID_CAP: 0.6, LS_CAP: 0.9, INT_CAP: 0.4 } },
        ke0: 0.0, // biophase off by default
        // PD — heart rate (β1 chronotropy)
        hr_ec50: 20.0, hr_emax: 0.6, hr_hill: 1.5,
        // PD — contractility / inotropy (β1)
        cont_ec50: 25.0, cont_emax: 0.8, cont_hill: 1.5,
        // PD — systemic vascular resistance (α1); higher EC50 (α dominates at higher concentration)
        svr_ec50: 40.0, svr_emax: 0.5, svr_hill: 2.0,
      },
      noradrenaline: {
        enabled: true,
        // PK — similar fast handling; clearing organs configured to exercise organ-localized clearance
        clearance: { global: 0.018, sites: { KID_CAP: 0.6, LS_CAP: 1.0, INT_CAP: 0.4 } },
        ke0: 0.0,
        // PD — predominantly α1 vasoconstriction, modest β1 inotropy, minimal direct chronotropy
        hr_ec50: 30.0, hr_emax: 0.1, hr_hill: 1.5,
        cont_ec50: 30.0, cont_emax: 0.35, cont_hill: 1.5,
        svr_ec50: 25.0, svr_emax: 0.9, svr_hill: 2.0,
      },
      pge1: {
        // Prostaglandin E1 (alprostadil) — keeps the ductus arteriosus patent in duct-dependent CHD.
        enabled: true,
        // PK — extensive pulmonary first-pass metabolism (~80% in one lung pass) → brisk whole-body
        // clearance, hence the short clinical half-life and need for continuous infusion.
        clearance: { global: 0.08, sites: {} },
        ke0: 0.0,
        // PD — ductal patency only (→ Pda.diameter_drug_factor). PGE1 is potent and heavily cleared, so
        // a clinical infusion (~0.01–0.05 mcg/kg/min) yields a low effect-site conc (~0.01–0.05 ng/mL);
        // EC50 is set in that range so the clinical dose band sits on the sigmoid's rising limb. emax 1.5
        // → up to a 2.5× patency factor at saturation (capped at the anatomic max in Pda). No
        // HR/inotropy/SVR effect in this version; the known systemic vasodilation + apnea are future.
        pda_ec50: 0.02, pda_emax: 1.5, pda_hill: 1.0,
      },
    };

    // -----------------------------------------------
    // dependent parameters (diagnostic read-outs)
    this.concentrations = {}; // { drug: effect-site conc (ng/mL) }
    this.biophase = {}; // { drug: effect-compartment conc (ng/mL) }
    this.conc_inj = 0.0; // adrenaline injection-site conc (convenience read-out)
    this.conc_eff = 0.0; // adrenaline effect-site conc (convenience read-out)
    this.hr_drug_factor = 1.0; // applied (summed) → Heart.hr_drug_factor (1.0 = no effect)
    this.cont_drug_factor = 1.0; // applied (summed) → each chamber's el_max_drug_factor (1.0 = no effect)
    this.svr_drug_factor = 1.0; // applied (summed) → Circulation.svr_factor_drug (1.0 = no effect)
    this.pda_drug_factor = 1.0; // applied (summed) → Pda.diameter_drug_factor (1.0 = no effect)

    // active continuous infusions: { drugName: rate_mcg_kg_min }
    this.infusions = {};

    // -----------------------------------------------
    // local parameters
    this._was_active = false; // tracks active→inactive for the one-shot channel release
    this._seeded = false; // whether the drugs{} keys have been seeded into the circuit
    this._blood_components = []; // resolved list of blood compartments (lazy)
    this._clearance_targets = []; // resolved [{ comp, drug, rate }] for organ-localized clearance
    this._ce = {}; // per-drug biophase (effect-compartment) concentration state
    this._injection = null;
    this._effect = null;
    this._heart = null;
    this._circ = null;
    this._pda = null;

    // blood-carrying model types whose drugs{} dict participates in transport (mirrors Blood.js)
    this._blood_modeltypes = [
      "BloodVessel",
      "HeartChamber",
      "BloodCapacitance",
      "BloodTimeVaryingElastance",
      "BloodPump",
      "MicroVascularUnit",
    ];
  }

  init_model(args) {
    // base applies args (no components on this model). Refs/seeding are resolved lazily on first step
    // because Circulation builds the blood compartments during ITS init, possibly after this model.
    const default_defs = this.drug_defs; // full built-in set from the constructor
    super.init_model(args); // a scenario may overwrite drug_defs with an older/partial baked set
    // Merge the built-in defaults UNDER the scenario-provided defs: scenario tuning wins for drugs it
    // defines, but any built-in drug the baked state predates (e.g. pge1 added after those scenarios
    // were serialized) is still present — so we don't have to re-bake every scenario JSON.
    this.drug_defs = { ...default_defs, ...this.drug_defs };
  }

  calc_model() {
    // master gate — release owned channels once, then idle
    if (!this.drugs_running) {
      if (this._was_active) this._release_channels();
      this._was_active = false;
      return;
    }

    this._resolve_refs(); // resolves refs, seeds the drugs{} keys and clearance targets (once)

    // 1. SOURCE — apply active continuous infusions at the injection site
    if (this._injection && this._injection.vol > 0.0) {
      Object.keys(this.infusions).forEach((drug) => {
        const rate = this.infusions[drug]; // mcg/kg/min
        if (rate > 0.0 && this._injection.drugs[drug] !== undefined) {
          const mass = (rate * this._model_engine.weight) / 60.0 * this._t; // mcg added this step
          this._injection.drugs[drug] += mass / this._injection.vol; // → ng/mL
        }
      });
    }

    // 2. SINK — diffuse (global) clearance on every compartment ...
    Object.keys(this.drug_defs).forEach((drug) => {
      const kg = this.drug_defs[drug].clearance?.global ?? 0.0;
      if (kg <= 0.0) return;
      this._blood_components.forEach((comp) => {
        const c = comp.drugs[drug];
        if (c > 0.0) { const n = c - c * kg * this._t; comp.drugs[drug] = n > 0.0 ? n : 0.0; }
      });
    });
    // ... plus organ-localized intrinsic clearance at the clearing compartments (perfusion-scaled)
    this._clearance_targets.forEach(({ comp, drug, rate }) => {
      const c = comp.drugs[drug];
      if (c > 0.0) { const n = c - c * rate * this._t; comp.drugs[drug] = n > 0.0 ? n : 0.0; }
    });

    // 3. EFFECT — biophase lag (optional) then sum each effect across all enabled drugs
    let hr_sum = 0.0, cont_sum = 0.0, svr_sum = 0.0, pda_sum = 0.0;
    Object.keys(this.drug_defs).forEach((drug) => {
      const def = this.drug_defs[drug];
      const c_site = this._effect?.drugs?.[drug] ?? 0.0;
      this.concentrations[drug] = c_site;
      // effect-compartment (biophase) lag toward the site concentration
      let c_drive = c_site;
      if (def.ke0 > 0.0) {
        const ce = this._ce[drug] ?? 0.0;
        this._ce[drug] = ce + def.ke0 * (c_site - ce) * this._t;
        c_drive = this._ce[drug];
      }
      this.biophase[drug] = c_drive;
      if (!def.enabled) return;
      // _emax returns 0 for any effect a drug doesn't define (undefined emax), so drugs compose without
      // every drug needing every channel (e.g. pge1 has only pda_*, the catecholamines only hr/cont/svr)
      hr_sum   += this._emax(c_drive, def.hr_emax,   def.hr_ec50,   def.hr_hill);
      cont_sum += this._emax(c_drive, def.cont_emax, def.cont_ec50, def.cont_hill);
      svr_sum  += this._emax(c_drive, def.svr_emax,  def.svr_ec50,  def.svr_hill);
      pda_sum  += this._emax(c_drive, def.pda_emax,  def.pda_ec50,  def.pda_hill);
    });
    this.hr_drug_factor = 1.0 + hr_sum;
    this.cont_drug_factor = 1.0 + cont_sum;
    this.svr_drug_factor = 1.0 + svr_sum;
    this.pda_drug_factor = 1.0 + pda_sum;
    this.conc_eff = this.concentrations.adrenaline ?? 0.0;
    this.conc_inj = this._injection?.drugs?.adrenaline ?? 0.0;

    // write the (summed) effector channels
    if (this._heart) this._heart.hr_drug_factor = this.hr_drug_factor; // already wired into HR calc
    this._write_chamber_inotropy(this.cont_drug_factor); // mirrors the Mob inotropy path
    if (this._circ) this._circ.svr_factor_drug = this.svr_drug_factor; // independent SVR channel
    if (this._pda) this._pda.diameter_drug_factor = this.pda_drug_factor; // ductal patency (PGE1)

    this._was_active = true;
  }

  // ---- dosing API (callable via callModelFunction / TaskScheduler) ----

  // instantaneous IV bolus: add `dose` mcg to the injection-site compartment (→ ng/mL)
  administer_bolus(drug, dose) {
    this._resolve_refs();
    if (this._injection && this._injection.vol > 0.0 && this._injection.drugs[drug] !== undefined) {
      this._injection.drugs[drug] += dose / this._injection.vol;
    }
  }

  // start/stop a weight-based continuous infusion (mcg/kg/min); rate 0 stops it
  set_infusion(drug, rate) {
    this.infusions[drug] = rate;
  }

  // adjust a PK/PD constant of a drug from the UI (the params live in a nested per-drug dict that the
  // flat setPropValue path can't reach, so this setter is exposed instead — mirrors Metabolism's
  // set_metabolic_active_model). `param` is a dotted path into the drug def, e.g. "hr_emax", "ke0",
  // "clearance.global".
  set_drug_param(drug, param, value) {
    const def = this.drug_defs[drug];
    if (!def || param == null) return;
    const parts = String(param).split(".");
    let obj = def;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null || typeof obj[parts[i]] !== "object") obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }

  // ---- internals ----

  // resolve effector/site references lazily and seed the circuit (drug keys + clearance targets) once
  _resolve_refs() {
    if (!this._heart) this._heart = this._model_engine.models[this.heart_name] ?? null;
    if (!this._circ) this._circ = this._model_engine.models[this.circulation_name] ?? null;
    if (!this._injection) this._injection = this._model_engine.models[this.injection_site] ?? null;
    if (!this._effect) this._effect = this._model_engine.models[this.effect_site] ?? null;
    if (!this._pda) this._pda = this._model_engine.models["Pda"] ?? null;
    if (!this._seeded) this._seed_drugs();
  }

  // write the inotropy factor to every heart chamber, reaching them through the Heart's resolved
  // chamber refs exactly as Mob does for el_max_mob_factor (atria + both ventricles, RA split guarded)
  _write_chamber_inotropy(factor) {
    const h = this._heart;
    if (!h) return;
    if (h._lv) h._lv.el_max_drug_factor = factor;
    if (h._rv) h._rv.el_max_drug_factor = factor;
    if (h._la) h._la.el_max_drug_factor = factor;
    if (h._raivci) h._raivci.el_max_drug_factor = factor;
    if (h._rasvc) h._rasvc.el_max_drug_factor = factor;
    if (h._ra) h._ra.el_max_drug_factor = factor;
  }

  // ensure every blood compartment carries each drug key (the dicts ship empty), so the existing
  // volume_in mixing has something to propagate, and resolve the organ-localized clearance targets.
  // Runs once, after Circulation has built its components onto model.models.
  _seed_drugs() {
    this._blood_components = [];
    for (const model_name in this._model_engine.models) {
      const m = this._model_engine.models[model_name];
      if (m && this._blood_modeltypes.includes(m.model_type) && m.drugs) {
        this._blood_components.push(m);
        Object.keys(this.drug_defs).forEach((drug) => {
          if (m.drugs[drug] === undefined) m.drugs[drug] = 0.0;
        });
      }
    }
    if (this._blood_components.length === 0) return; // circuit not built yet — retry next step

    // resolve organ-localized clearance targets once the compartments exist
    this._clearance_targets = [];
    Object.keys(this.drug_defs).forEach((drug) => {
      const sites = this.drug_defs[drug].clearance?.sites ?? {};
      Object.keys(sites).forEach((site) => {
        const comp = this._model_engine.models[site];
        if (comp && comp.drugs) this._clearance_targets.push({ comp, drug, rate: sites[site] });
      });
    });
    this._seeded = true;
  }

  // release owned effector channels back to neutral exactly once (on disable)
  _release_channels() {
    this._resolve_refs();
    if (this._heart) this._heart.hr_drug_factor = 1.0;
    this._write_chamber_inotropy(1.0);
    if (this._circ) this._circ.svr_factor_drug = 1.0;
    if (this._pda) this._pda.diameter_drug_factor = 1.0;
    this.hr_drug_factor = 1.0;
    this.cont_drug_factor = 1.0;
    this.svr_drug_factor = 1.0;
    this.pda_drug_factor = 1.0;
  }

  // sigmoid Emax / Hill: effect = emax · c^n / (ec50^n + c^n)
  _emax(c, emax, ec50, n) {
    if (!emax || c <= 0.0) return 0.0;
    const cn = Math.pow(c, n);
    return (emax * cn) / (Math.pow(ec50, n) + cn);
  }
}
