# Drugs (pharmacology PK/PD)

The `Drugs` model is the **pharmacology PK/PD controller** — a process/controller model in the same
family as [`Hormones`](./Hormones.md) and `Ans`. It holds **no blood of its own**, resolves
references to other models **lazily** (the blood compartments are built by [`Circulation`](./Circulation.md)
after this model inits), runs each step, and **owns its effector channels while enabled** (releasing
them once to neutral on disable, gated by `drugs_running`). Default config is **neutral**: with no
drug present every concentration is `0`, so every `*_drug_factor` reads `1.0` (no effect) and a
scenario that ships a `Drugs` model behaves identically until a dose is given.

The novelty versus `Hormones` is that the "signal" being controlled is an actual **drug mass that
rides the blood circuit** — `Drugs` does not transport anything itself; it seeds a drug key into
every blood compartment's `drugs{}` dict and lets the engine's existing `volume_in` mixing advect it,
exactly as Na/K solutes propagate (see [`BloodCapacitance`](./BloodCapacitance.md)).

## Per-drug causal loop

```
SOURCE (dosing)          TRANSPORT (free)            SINK (clearance)            BIOPHASE         EFFECT (summed)
injection_site.drugs{}   volume_in mixing carries    diffuse global term on      optional ke0     sigmoid Emax/Hill per drug
  bolus    C += dose/vol the seeded drug key around  EVERY compartment  +        effect-comp lag  SUMMED onto shared channels:
  infusion C += rate·wt  the whole circuit, by       organ-localized intrinsic   dCe/dt =         Heart.hr_drug_factor   (β1 chrono)
           /60·dt/vol     incoming-volume fraction    clearance at named sites    ke0·(C−Ce)       chamber.el_max_drug_factor (β1 ino)
  (mcg → ng/mL)          (drugs ride blood, free)    (KID_CAP/LS_CAP, perf.-scl.) → hysteresis    Circulation.svr_factor_drug (α1)
                                                                                                   Pda.diameter_drug_factor (PGE1)
```

- **SOURCE** — dosing injects drug mass into the `injection_site` compartment's `drugs{}` dict
  (default `IVCI`, a central vein). A **bolus** adds `dose / vol` (dose in mcg, vol in L → ng/mL); a
  weight-based **infusion** adds `(rate · weight / 60) · dt / vol` each step (rate in mcg/kg/min).
- **TRANSPORT** — handled entirely by the engine. `Drugs` only **seeds** the drug key (value `0.0`)
  into every blood-carrying compartment once (`_seed_drugs`, lazily on first step); the existing
  `volume_in` mixing then advects it for free, like solutes. Blood model types that participate:
  `BloodVessel`, `HeartChamber`, `BloodCapacitance`, `BloodTimeVaryingElastance`, `BloodPump`,
  `MicroVascularUnit`.
- **SINK** — elimination is a **diffuse first-order** term (`clearance.global`, 1/s, e.g. COMT/MAO/
  uptake) decaying the drug on **every** compartment, **plus** organ-localized **intrinsic clearance**
  (`clearance.sites`, 1/s) at named clearing compartments (e.g. `KID_CAP` renal, `LS_CAP` hepatic).
  Because those organs are continuously perfused, the localized term behaves as a **well-stirred
  organ model**: whole-body clearance scales with organ blood flow — if perfusion falls the drug
  lingers, exactly like real renal/hepatic clearance.
- **BIOPHASE** — an optional effect compartment per drug, `dCe/dt = ke0·(C_site − Ce)`. With
  `ke0 > 0` the PD map is driven by the lagged biophase concentration `Ce`, giving onset/offset
  **hysteresis** (effect peak trails plasma peak). `ke0 = 0` (default) → PD uses the effect-site conc
  directly.
- **EFFECT** — each drug contributes an independent sigmoid `effect = emax·c^n / (ec50^n + c^n)`
  (`_emax`), and contributions are **summed across all enabled drugs** onto the shared
  `*_drug_factor` channels, so drugs **compose additively** rather than overwrite. `_emax` returns
  `0` for any effect a drug leaves undefined (`emax` undefined), so drugs compose without every drug
  defining every channel.

The effect-site concentration is read from the `effect_site` compartment (default `AA`, a systemic
artery). Concentration unit convention throughout: **mcg/L ≡ ng/mL** (dose in mcg, blood volumes in L).

## Effector channels (owned, default-neutral)

| Channel | Target | Pharmacology |
|---|---|---|
| `hr_drug_factor` | [`Heart`](./Heart.md)`.hr_drug_factor` | β1 chronotropy (heart rate) |
| `cont_drug_factor` | each chamber's `el_max_drug_factor` (via the Heart inotropy path, mirroring Mob) | β1 inotropy (contractility) |
| `svr_drug_factor` | [`Circulation`](./Circulation.md)`.svr_factor_drug` | α1 systemic vasoconstriction |
| `pda_drug_factor` | [`Pda`](./Pda.md)`.diameter_drug_factor` | ductal patency (PGE1) |

Inotropy is fanned to every heart chamber through the `Heart`'s resolved chamber refs
(`_lv`/`_rv`/`_la`/`_raivci`/`_rasvc`/`_ra`), exactly as `Mob` writes `el_max_mob_factor`. The SVR
channel is independent of the ANS and Hormones channels (`svr_factor_art/_ven`), so they compose.

## Drugs currently defined (`drug_defs`)

| Drug | PK (`clearance`) | PD effects |
|---|---|---|
| `adrenaline` | global 0.022 + sites KID_CAP 0.6 / LS_CAP 0.9 / INT_CAP 0.4 | HR (ec50 20, emax 0.6), cont (ec50 25, emax 0.8), SVR (ec50 40, emax 0.5) |
| `noradrenaline` | global 0.018 + sites KID_CAP 0.6 / LS_CAP 1.0 / INT_CAP 0.4 | predominantly α1 SVR (ec50 25, emax 0.9), modest cont (emax 0.35), minimal HR (emax 0.1) |
| `pge1` | global 0.08, no sites | **ductal patency only** — `pda_ec50 0.02`, `pda_emax 1.5`, `pda_hill 1.0` |

**PGE1 (prostaglandin E1 / alprostadil)** is the duct-dependent-CHD agent: its **only** effect is
ductal patency through the channel `Pda.diameter_drug_factor`. Its very low `pda_ec50` (0.02 ng/mL)
reflects a **potent + heavily cleared** drug — extensive pulmonary first-pass metabolism (~80% per
lung pass, hence the high `global` clearance, short half-life, and need for continuous infusion)
yields a low effect-site conc (~0.01–0.05 ng/mL at a clinical 0.01–0.05 mcg/kg/min infusion) that
sits on the sigmoid's rising limb. `pda_emax 1.5` allows up to a ~2.5× patency factor at saturation
(capped at the anatomic maximum inside [`Pda`](./Pda.md)). It defines no HR/inotropy/SVR params — and
because `_emax` is undefined-safe, drugs **compose without every drug defining every channel**
(PGE1 has only `pda_*`; the catecholamines only `hr_*`/`cont_*`/`svr_*`).

### The `init_model` merge

`init_model` captures the constructor's full built-in `drug_defs`, lets `super.init_model(args)`
overwrite it with whatever a scenario baked, then merges:

```js
this.drug_defs = { ...default_defs, ...this.drug_defs };
```

Scenario tuning wins for drugs it defines, but any **newly-added built-in drug** the baked state
predates (e.g. `pge1`, added after older scenarios were serialized) is still present — so new drugs
become available in **old scenarios without re-baking the JSON**.

## Dosing API

Callable via `callModelFunction` / the `TaskScheduler` (see the engine docs):

| Method | Effect |
|---|---|
| `administer_bolus(drug, dose_mcg)` | instantaneous IV bolus — adds `dose_mcg / vol` to the injection-site `drugs{}` |
| `set_infusion(drug, rate_mcg_kg_min)` | start/stop a weight-based continuous infusion; `rate 0` stops it |
| `set_drug_param(drug, param, value)` | set a PK/PD constant via a **dotted path** into the per-drug def (e.g. `"hr_emax"`, `"ke0"`, `"clearance.global"`) — the nested dict is unreachable by the flat `setPropValue` path |

## Read-outs

| Read-out | Meaning |
|---|---|
| `concentrations` | `{ drug: effect-site conc (ng/mL) }` |
| `biophase` | `{ drug: effect-compartment conc Ce (ng/mL) }` (= site conc when `ke0 = 0`) |
| `conc_inj` / `conc_eff` | adrenaline injection-site / effect-site conc (convenience) |
| `hr_drug_factor` / `cont_drug_factor` / `svr_drug_factor` / `pda_drug_factor` | applied (summed) effector factors (1.0 = no effect) |
| `infusions` | active continuous infusions `{ drug: rate_mcg_kg_min }` |

## Notes / scope

- While enabled, `Drugs` **owns** the four `*_drug_factor` channels (`Heart.hr_drug_factor`, each
  chamber's `el_max_drug_factor`, `Circulation.svr_factor_drug`, `Pda.diameter_drug_factor`) — manual
  edits are overwritten each step. The clean "off" switch is `drugs_running = false`, which releases
  all owned channels back to `1.0` exactly once.
- Adding a drug = a new `drug_defs` entry; it is seeded, transported, cleared and aggregated
  automatically. Surfacing per-drug params + dosing methods to the UI registry is the next milestone.

## See also
[`Heart`](./Heart.md) · [`Circulation`](./Circulation.md) · [`Pda`](./Pda.md) ·
[`Hormones`](./Hormones.md) · [`BloodCapacitance`](./BloodCapacitance.md)
