# Paper P1 — the experiments behind the cardiovascular paper

*An integrated model for simulation of neonatal physiology — the cardiovascular system* (Antonius,
van Meurs, Westerhof, de Boode; Pediatric Research) validates the circulation model with four
experiments: the term baseline (Table 2), a preterm infant with no / bidirectional / left-to-right
ductal shunting against Bischoff 2021 (Table 3), three grades of pulmonary hypertension against
Jones & Crossland 2022 (Table 4) and three ductal Doppler patterns against van Laere 2018 (Fig. 5).

This folder makes those experiments reproducible on this engine.

> **2026-10-20:** the scenarios behind seven experiments (`baseline` on `p1_baseline`, `pda_none` on
> `p1_pda_none`, the `pda_*` and `doppler_*` cases on `bischoff_cohort`) were built on the older engine
> and moved to `model_definitions/archive/`. Those experiments are to be re-run from scratch on the
> current engine; until then they cannot run, and only the three `ph_*` experiments (on `term_neonate`)
> work. The app's `/paper/p1` page shows only those three.

| File | Role |
|---|---|
| `experiments.json` | **Source of truth.** One entry per experiment: the scenario it starts from, the ops that create the state (the same op shapes the app's lessons use), how long to settle and sample, and every measure with the paper's value and the literature target. |
| `../evaluate.js` | Shared evaluator (sample paths, derived quantities, per-kg, tolerance). Used by the probe and by the app's `/paper/p1` page, so both show the same number. |
| `cases/`, `specs/` | Pipeline prompts and the bot's archived replies/SPECs for the pipeline-built states |
| `../../scripts/p1_build.mjs` | Asks the bot, archives, rebuilds locally (see below) |
| `../../scripts/probe_p1.mjs` | Runs every experiment headlessly and prints `paper | engine | Δ | literature`. `--only`, `--override id:Model.prop=value` (lever sweeps) and `--json`. |

```bash
node scripts/probe_p1.mjs                       # all ten experiments, about four minutes
node scripts/probe_p1.mjs --only ph_severe --override "ph_severe:PAAL_LL_ART.r_factor_ps=5"
```

## Why the experiments had to be rebuilt

The paper's tables were produced in January 2026 by the earlier Python implementation of the
model. This engine was started in June 2026 and no scenario or script recorded the settings behind
any column. The experiments here reconstruct each case from the **method the paper describes**:

- **Table 2** — `term_neonate` scaled to the paper's 3.3 kg neonate at 24 h (`weight_scale`), heart-rate
  set-point 118 min⁻¹. Chamber volumes are read per kg, as Jhaveri 2023 reports them.
- **Table 3** — `bischoff_cohort` (the cohort infant: 25 wk, 720 g, CPAP) with the duct closed, 2.2 mm with
  high pulmonary resistance (bidirectional) or 2.2 mm with lower resistance (left-to-right), a small foramen
  (1.5 mm), and the paper's "minor additional tuning of arterial resistances" as a lower upper-body
  arteriolar resistance (`AA_BR_ART`, `AA_RUB` ×0.6), which restores SVC flow.
- **Table 4** — the Table 2 baseline with a 3 mm foramen and the resistance of the pulmonary arterioles
  (`PAAL_LL_ART`, `PAAR_RL_ART`) and the pulmonary-artery elastance (`PA.el_base`) raised, exactly the levers
  §3.1.3 names; the duct opened to 3 mm for the last column.
- **Fig. 5** — the Table 3 infant with a 3 mm duct (non-restrictive), a 1 mm duct (restrictive) and the
  bidirectional state. `Pda.velocity_pa` is the paper's Eq. 12 (continuity velocity at the pulmonary end);
  `Pda.velocity_doppler` is the Bernoulli jet a CW Doppler would read. Both are latched per beat
  (`velocity_pa_max/min`, `velocity_doppler_max/min`, `forward_fraction`).

Read-outs are beat-averaged over the sampling window (the paper sampled at end-expiration, −3.5 mmHg);
`Monitor` gained an `la` min/max target in the two scenarios so the transpulmonary gradient can be read.

## States built by the AI parameterization pipeline (pilot: `baseline`, `pda_none`)

The paper set its states by hand. Two of them are also **re-created by the pipeline** so the
reproduction exercises the method the later papers describe (two stages: the language model
interprets, the calibrator fits):

1. `cases/<id>.md` is the prompt: the paper's own description of the case and its table.
2. `scripts/p1_build.mjs` sends it to the Explain bot (Claude on the bot host, via `/v1/ask`),
   which answers with a build SPEC; the host runs the builder. The reply (prose, SPEC, the host's
   report) is archived as `specs/<id>.json`.
3. The patient is then **rebuilt locally** from the archived SPEC with this checkout's
   `scripts/build_patient.mjs` → `model_definitions/p1_<id>.json`, so the deposited scenario matches
   this engine version and is reproducible without the language model
   (`node scripts/p1_build.mjs --only <id> --no-bot`; `node scripts/probe_p1.mjs --rebuild`
   measures the rebuilt patient beside the archived one — identical in the pilot).

What the bot did (archived verbatim): for Table 2 it targeted weight 3.3 kg, HR 118, ABP 70/45
(as the sys/dia pair → MAP 53.3 and pulse pressure 25), LVO 0.597 L/min, shunts closed, and
listed EF as derived; converged in 10 iterations. For Table 3 "no PDA" it started from
`bischoff_cohort`, closed the duct, and targeted the cohort means LVO 169.7, RVO 170.3 and SVC flow
73.4 mL·kg⁻¹·min⁻¹ (converted to L/min) together with the cohort's pressure 45/25 and heart rate
159 — the last two are not in the paper's table and were given in the case prompt — with a 2 mm
foramen as the starting point for the RVO lever.

Two builder targets were added for this (`rvo` ← foramen ovale diameter, with the duct closed the
only path by which RVO differs from LVO; `svc` ← the upper/lower-body resistance split, which
redistributes flow without moving the total resistance the MAP lever owns), and three builder
fixes fell out of the pilot: flow tolerances now scale with body weight (0.05 L/min meant
70 mL·kg⁻¹·min⁻¹ on a 720 g infant), the contractility lever starts from the baseline's own
factor instead of 1.0, and an SVC lever on the upper-body resistance alone was replaced because it
fought the MAP lever to both bounds.

**What the pilot shows.** The pipeline reaches the paper's values. Table 2: within the literature
SD on every row except the end-systolic volumes (LVESV 1.4 vs 0.9 ± 0.2 mL/kg, RVESV 1.9 vs
1.5 ± 0.2), because LVO is fitted with contractility (the hand-rescaled state kept them inside).
Table 3 "no PDA": LVO = RVO ≈ 172, LVO/RVO 1.00, SVC ≈ 71 against the paper's 179/179/1.0/74, at
the cohort's pressure 44/25 (target 45/25) and heart rate 159. The ejection fraction is low (≈17 %),
largely inherited: the untouched cohort scenario runs at 24 % with its baked contractility ×0.5.

**The pulse-pressure fix this needed.** The infant first stopped at about 35/24 with the stiffness
lever at ×1.8. That ceiling was numerical: the aorta AA → AAR → AD is three compartments joined by
tiny resistors, and explicit integration of such a chain fails once dt·(E₁+E₂)/R exceeds 4/3
(measured 0.80 at ×1.8, 1.34 at ×3). `Resistor.implicit` integrates those two resistors
backward-Euler (docs/Resistor.md: identical to the explicit result in the old stable range, equal to
a half-time-step reference within 0.2 mmHg beyond it, no CPU cost); builder and live tuner switch it
on, after which term and 0.72 kg patients are stable to at least ×8 (`ARTERIAL_EL_MAX` 2 → 6).
Two pipeline fixes came with it: arteries are sized against the term weight, so an already-small
baseline made before the size rule (bischoff_cohort, preterm_*wk) is stiffened too (×2.2 at
0.72 kg); and a sys/dia pair without a MAP no longer fits the clinical estimate dia + pp/3, which
the model's true time-averaged mean does not follow in a small infant (≈ dia + 0.46·pp), but a MAP
target re-derived each iteration from the model's own waveform. The MAP tolerance is at most 5 % of
the target. Bundled scenarios are not changed. The other eight states remain hand-tuned until the
pilot is judged.

## Where the engine differs from the paper (as of this version)

Tolerances in `experiments.json` are the literature SDs where the source gives one, else the
paper's own margin. Rows flagged `!` by the probe:

- **Pulmonary hypertension, severe states.** The paper's columns show systemic pressure and output
  falling with the pulmonary hypertension (ABP 50/24, LVP 51, Qs 132–143). This engine keeps the
  systemic side up (ABP ≈ 63/40, Qs ≈ 165) with the same pulmonary levers, so TPG/PAP are matched but
  the systemic pressures are 10–14 mmHg above the paper and the diastolic ABP stays near baseline. The
  paper names no lever for that fall; it is not reproduced rather than tuned in by other means.
- **Left-to-right duct.** LVO 211 vs 261 (literature 250 ± 46) at the LVO/RVO ratio the paper reports;
  a larger shunt raises LVO but also the ratio.
- **Restrictive Doppler.** Jet velocities are below van Laere's panel (≈1 vs ≈3 m·s⁻¹) unless the duct is
  narrowed well below 1 mm; the pattern (continuous, low pulsatility) is reproduced.

Tag the engine release that ships this folder and cite that tag from the paper's companion page.
