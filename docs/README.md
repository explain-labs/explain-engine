# Explain Engine — Model Documentation Index

This directory documents the **Explain physiological simulation engine** — the framework-agnostic
ES modules in this repository, not any consuming UI layer. Each model class and engine helper has
its own reference doc; this page is the map.

**New here?** Start with **[ARCHITECTURE](./ARCHITECTURE.md)** — the whole-model developer overview
(two-thread design, message protocol, build/step loop, the cross-cutting patterns every model uses,
and how to add a new model). Then dive into the per-class docs below.

Each per-class doc follows the v1.0 house template (see the template section in
[ARCHITECTURE](./ARCHITECTURE.md)): summary → physiology in plain language → inheritance → property
tables (with defaults) → calculation → factor system → inputs and outputs → assumptions and
limitations → example JSON → usage in the scenarios → references. Helpers and module functions use a
short form. The exemplar is [BloodCapacitance](./BloodCapacitance.md). Pages marked *experimental*
(MaternalPlacenta, Uterus, Resuscitation) describe models whose app panels are hidden as unfinished.

> **Factor layers:** every tunable has `*_factor` (per step), `*_factor_ps` (persistent) and
> `*_factor_scaling_ps` (scaling) layers; the name is the same in every model family. See
> [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

---

## Architecture & contract

| Doc | What it covers |
|---|---|
| [ARCHITECTURE](./ARCHITECTURE.md) | Whole-model overview: threads, wire protocol, build/step loop, cross-cutting patterns, how to add a model, the doc template. |
| [BaseModelClass](./BaseModelClass.md) | Abstract root of every model: lifecycle contract (construct → init_model → step_model → calc_model), shared fields. |

## Formats & developer workflow

| Doc | What it covers |
|---|---|
| [MODEL_DEFINITIONS](./MODEL_DEFINITIONS.md) | The scenario / model-definition JSON format a developer authors — top-level keys, the `model_definition.models` map, `scaler_config`, `configuration.events`, and how `build()` consumes it. |
| [TESTING](./TESTING.md) | Running the engine headlessly in Node — the zero-edit shim harness, the `probe_*.mjs` verification pattern, and the reseed/scenario-generation tooling in `scripts/`. |

## Base elements (`base_models/`)

The reusable physical primitives every component model is built from.

| Doc | Models |
|---|---|
| [Capacitance](./Capacitance.md) | Elastic volume compartment; pressure from volume above unstressed volume (linear + non-linear). Canonical factor/`_eff` implementation. |
| [Resistor](./Resistor.md) | Flow element between two compartments; pressure-driven flow (forward/back/non-linear R), moves volume. |
| [TimeVaryingElastance](./TimeVaryingElastance.md) | Compartment whose elastance varies over the cardiac cycle; basis for heart chambers. |
| [Container](./Container.md) | Enclosing pressure container (thorax/pericardium); applies external pressure to members. |
| [BloodDiffusor](./BloodDiffusor.md) | Diffusion of O₂/CO₂/solutes between two blood compartments. |
| [GasExchanger](./GasExchanger.md) | O₂/CO₂ transfer across the blood–gas (alveolar–capillary) barrier. |

## Blood side

| Doc | Models |
|---|---|
| [Blood](./Blood.md) | Whole-blood manager: Hb, blood volume, P50, composition init/propagation across compartments. |
| [BloodCapacitance](./BloodCapacitance.md) | Blood-filled compartment; `volume_in` mixes gases/solutes/drugs/temp/viscosity by volume fraction. **(template exemplar)** |
| [BloodTimeVaryingElastance](./BloodTimeVaryingElastance.md) | Time-varying-elastance compartment carrying blood composition (pumping chamber). |
| [BloodVessel](./BloodVessel.md) | Vessel segment with embedded resistor + ANS tone; **multiplicative** factor composition + α-coupling. |
| [BloodMixing](./BloodMixing.md) | Blood composition mixing on inflow and exchange without net flow (`mix_blood_in`, `exchange_blood`). *(helper)* |
| [Orifice](./Orifice.md) | Bernoulli orifice term and jet velocity shared by Shunts and Pda (`orifice_b`, `jet_velocity`). *(helper)* |
| [BloodComposition](./BloodComposition.md) | Acid–base / oxygenation solver (`calc_blood_composition`): Stewart SID + O₂/CO₂ dissociation, Haldane/Bohr coupling. *(module function, not a model_type)* |

## Gas side

| Doc | Models |
|---|---|
| [Gas](./Gas.md) | Gas-phase manager: atmospheric pressure, humidity, gas composition init. |
| [GasCapacitance](./GasCapacitance.md) | Gas-filled elastic compartment (lung/airway); tracks partial pressures/fractions. |
| [GasComposition](./GasComposition.md) | Builds a gas compartment's composition from a dry FiO2, temperature and humidity. *(module function)* |
| [GasMixing](./GasMixing.md) | Gas exchange between two gas compartments without net flow (`exchange_gas`, used by `Resistor.mix_flow`). *(helper)* |

## Cardiac

| Doc | Models |
|---|---|
| [Heart](./Heart.md) | Master cardiac driver: HR, conduction/cycle counters, activation, ECG, arrhythmias (AV block / escape / VT / PVC). |
| [HeartChamber](./HeartChamber.md) | A single chamber (LA/LV/RA/RV); time-varying elastance with ANS, mob, drug, load & remodel factors. |
| [HeartFunction](./HeartFunction.md) | Load-induced contractility compromise (afterload mismatch, wall-stress dilation, remodeling). |
| [HeartValve](./HeartValve.md) | Cardiac valve: a one-way [Resistor](./Resistor.md) under its own type. |
| [Mob](./Mob.md) | Myocardial oxygen balance / heart-muscle metabolism. |

## Vascular & circulatory

| Doc | Models |
|---|---|
| [Circulation](./Circulation.md) | High-level circulation orchestrator; wires/scales the systemic & pulmonary network. |
| [Shunts](./Shunts.md) | Intracardiac/extracardiac shunts (foramen ovale, VSD, intrapulmonary). |
| [Pda](./Pda.md) | Ductus arteriosus: viscous (cone) + Bernoulli resistance on `AAR_DA`, drug-modulated diameter, Doppler velocity envelope. |
| [Placenta](./Placenta.md) | **Fetal** placenta: cord, villous circulation and exchange with a fixed maternal pool. |
| [MaternalPlacenta](./MaternalPlacenta.md) | **Maternal** intervillous-space bed / spiral-artery perfusion. *(experimental)* |
| [Uterus](./Uterus.md) | Uterine circulation + pregnancy adaptation + contractions/labor (IUP waveform, MVU). *(experimental)* |

## Control & regulatory

| Doc | Models |
|---|---|
| [Ans](./Ans.md) | Autonomic nervous system controller; hub doc for the afferent→efferent baro/chemoreflex loop. |
| [AnsAfferent](./AnsAfferent.md) | Afferent receptor (input → firing rate, piecewise linear with a time constant). |
| [AnsEfferent](./AnsEfferent.md) | Efferent pathway (summed, clamped firing rate → effect factor on a target). |
| [Hormones](./Hormones.md) | RAAS/ADH controllers acting on vascular tone & fluid balance. |
| [Kidneys](./Kidneys.md) | Renal filtration (NFP/GFR autoregulation, reabsorption, urine, per-solute mass balance). |
| [Brain](./Brain.md) | Cerebral autoregulation (CBF control) + ICP / Monro-Kellie. |

## Metabolic, thermal & pharmacology

| Doc | Models |
|---|---|
| [Metabolism](./Metabolism.md) | Whole-body O₂ consumption / CO₂ production; Q10 temperature dependence. |
| [Thermoregulation](./Thermoregulation.md) | Body-temperature control; drives HR temp factor, metabolic Q10, blood temperature. |
| [Glucose](./Glucose.md) | Glucose/insulin homeostasis; IV dextrose. |
| [Lactate](./Lactate.md) | Hypoxia-driven lactate production → Stewart SID → metabolic acidosis. |
| [Drugs](./Drugs.md) | Pharmacology PK/PD (adrenaline, noradrenaline, PGE1): circuit transport, clearance, ke0, effect sites. |
| [Fluids](./Fluids.md) | IV fluid/infusion administration into blood compartments. |

## Respiratory

| Doc | Models |
|---|---|
| [Breathing](./Breathing.md) | Spontaneous breathing drive: chemoreflex minute volume split into rate and tidal volume, muscle pressure on the thorax. |
| [Apnea](./Apnea.md) | Apnea of prematurity: episodic ventilation suppression (central/obstructive/mixed) → emergent desaturation + hypoxic bradycardia. |
| [Respiration](./Respiration.md) | Respiratory coordinator: lung, chest-wall, airway and exchange levers, series dead space, atelectasis (recruitment, resorption). |
| [Surfactant](./Surfactant.md) | Dynamic RDS alveolar recruitment/derecruitment with hysteresis + surfactant therapy. |

## Devices (`device_models/`)

| Doc | Models |
|---|---|
| [Ventilator](./Ventilator.md) | Mechanical ventilator physics (modes incl. CPAP/PS/HFOV via ET tube); the base of Sle6000, and the adults' ventilator. |
| [Sle6000](./Sle6000.md) | SLE6000 neonatal ventilator, the ventilator of every scenario up to 30 kg: the Ventilator driven through the device's modes, settings, circuits and monitored values, with the OxyGenie closed-loop O2 controller. |
| [Ecls](./Ecls.md) | Extracorporeal life support (ECMO): pump, oxygenator, cannulae. |
| [Monitor](./Monitor.md) | Patient monitor; derives displayed vitals from model state. |
| [Resuscitation](./Resuscitation.md) | CPR: chest compressions and ventilation cycles. *(experimental)* |

## Engine helpers (`helpers/`)

Infrastructure that the worker attaches to the live `model` object — not physiological models.

| Doc | Helper |
|---|---|
| [DataCollector](./DataCollector.md) | Dual-rate (fast 0.005 s / slow 1.0 s) property watchlists + sample buffers. |
| [TaskScheduler](./TaskScheduler.md) | Deferred/tweened prop mutations and scheduled model-function calls. |
| [ModelScaler](./ModelScaler.md) | Group scaling (absolute factor on the `*_factor_scaling_ps` layer), volume-only weight scaling and `incorporate` (bake). The shipped scenarios are baked, so 1.0 = the scenario as loaded. |
| [ModelRegistry](./ModelRegistry.md) | Name → class registry that lets `BaseModelClass` build built-in and custom models as sub-components. |
| [Units](./Units.md) | Shared constants: STPD O2 conversion, gas constant, water vapour pressure. |
| [Calibrator](./Calibrator.md) | Closed-loop calibration controllers (shared by patient-build and live `tune_model`). |
| [ChannelWriter](./ChannelWriter.md) | Worker→main realtime producer; writes samples into shared-memory ring buffers. |
| [RealtimeChannels](./RealtimeChannels.md) | Shared constants/layout for the realtime channel protocol. |
| [AnimationPacker](./AnimationPacker.md) | Packs per-component animation values (magnitude/tint) into the animation channel. |
| [RealTimeMovingAverage](./RealTimeMovingAverage.md) | O(1) rolling-average smoother for realtime signals. |

## Realtime read side (`realtime/`, main thread)

The main-thread mirror of the `ChannelWriter`/`RealtimeChannels`/`AnimationPacker` write side.

| Doc | Component |
|---|---|
| [RealtimeBus](./RealtimeBus.md) | `requestAnimationFrame` loop that drains a `ChannelReader` and pushes frames to renderer adapters (`onRegistry`/`onFrame`). |
| [ChannelReader](./ChannelReader.md) | Read side of the data plane; decodes the shared-memory (`Atomics`/seqlock) or transferable transport. |

## Clinical references

Not tied to a single class — physiology/clinical background and scenario-build roadmaps.

| Doc | What it covers |
|---|---|
| [fetal_circulation](./fetal_circulation.md) | (The fetal scenarios were removed on 2026-10-25 to be rebuilt; kept as the design record.) Fetal scenarios (`fetus_term`, `fetus_30wk`): the fetal invariants, why a gestational age costs a calibration pass, measured operating points, known limitations. |
| [TermNeonateReference](./TermNeonateReference.md) | Literature reference values for a healthy term neonate at ~72 h (hemodynamics, heart, flows, breathing, gases, metabolism, shunts), graded by evidence, with the matching JSON for validating `term_neonate`. |
| [chd_duct_fo_dependent](./chd_duct_fo_dependent.md) | Duct- & foramen-ovale-dependent CHD taxonomy, lesion catalog, engine-lever mapping, build roadmap, bibliography. |
