// Scenarios renamed after they were first published: old name -> current name. Model.load and
// scripts/build_patient.mjs resolve through it, so saved links, lessons, snapshots and builder specs
// that use an old name keep loading the current scenario.
export const SCENARIO_ALIASES = {
  term_neonate: "term_neonate_72h", // 2026-10-26, beside term_neonate_1h / _12h / _24h
};

export function resolveScenarioName(name) {
  return SCENARIO_ALIASES[name] ?? name;
}
