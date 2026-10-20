# Archived scenarios

These scenarios were moved here on 2026-10-16 (36 of them), when the healthy term neonate (`term_neonate`)
became the single reference for a rebuild of the builder's lever map. All of them derive from older
term states, and they are **not maintained** while `term_neonate` is being fixed.

On 2026-10-20 the four that were kept in place for live pages joined them: `bischoff_cohort`,
`p1_baseline`, `p1_pda_none` (the P1 companion's experiments, to be re-run on the current engine) and
`tof_severe` (the ToF lesson, offline until it is rebuilt). They were made with the older engine too.

- They are not listed in `../index.json`, and explain-ui's `sync-scenarios.mjs` only copies
  top-level files, so they no longer appear in the app.
- The exact pre-archive state of every scenario is the tag `scenarios-before-term-rebuild`.
- **Don't edit them in place.** Each one comes back by being rebuilt from the fixed `term_neonate`
  (via its `scripts/_make_*.mjs` generator or the patient builder), then moved back to
  `model_definitions/` and added to `index.json`.

Generators, probes and SA contexts that still point at `model_definitions/<name>.json` for an archived
scenario will not find it until that scenario is rebuilt.
