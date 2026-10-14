# Paper P1 — the experiments behind the cardiovascular paper

*An integrated model for simulation of neonatal physiology — the cardiovascular system* (Antonius,
van Meurs, Westerhof, de Boode; Pediatric Research) validates the circulation model with four
experiments: the term baseline (Table 2), a preterm infant with no / bidirectional / left-to-right
ductal shunting against Bischoff 2021 (Table 3), three grades of pulmonary hypertension against
Jones & Crossland 2022 (Table 4) and three ductal Doppler patterns against van Laere 2018 (Fig. 5).

This folder makes those experiments reproducible on this engine.

| File | Role |
|---|---|
| `experiments.json` | **Source of truth.** One entry per experiment: the scenario it starts from, the ops that create the state (the same op shapes the app's lessons use), how long to settle and sample, and every measure with the paper's value and the literature target. |
| `../evaluate.js` | Shared evaluator (sample paths, derived quantities, per-kg, tolerance). Used by the probe and by the app's `/paper/p1` page, so both show the same number. |
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
