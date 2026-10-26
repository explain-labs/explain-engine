# Archived scripts

Generators (`_make_*`) and reseeders (`reseed_*`) for the scenarios in
[`model_definitions/archive/`](../../model_definitions/archive/): the adult, CHD, CDH, PDA-pattern
and older preterm/fetal sets. They were moved here in the v1.0 documentation pass.

- They read and write `model_definitions/archive/` only (the base `term_neonate.json` is read from
  the canonical folder), so running one cannot overwrite a current scenario.
- They predate parts of the current engine and the v1.0 bake; their output is not validated.
  `term_neonate_cdh.json` no longer exists, so the CDH pair fails on a missing file.
- The only shipped scenario is `term_neonate`, reseeded by `scripts/reseed_term_neonate.mjs`. The validated
  preterm and fetal generators were removed with their scenarios on 2026-10-25, to be rebuilt. See
  [`docs/TESTING.md`](../../docs/TESTING.md).
