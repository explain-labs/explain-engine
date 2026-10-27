# ScenarioAliases

`helpers/ScenarioAliases.js` maps the old names of renamed scenarios to their current names, so saved
links, lessons, user snapshots and patient-builder specs that still use an old name load the current
scenario instead of failing.

## Exports

| Export | Description |
|---|---|
| `SCENARIO_ALIASES` | `{ oldName: currentName }`. Currently `term_neonate` → `term_neonate_72h` (2026-10-26). |
| `resolveScenarioName(name)` | The current name for `name`, or `name` itself when it was never renamed. |

## Used by

- [Model](./ARCHITECTURE.md) `load(definition_name)`: resolves the name before fetching `/model_definitions/<name>.json` (logs the redirect).
- `scripts/build_patient.mjs`: resolves `spec.baseline` before reading the baseline file.

Scripts that read a scenario file by path (probes, generators) use the current names directly.

## Adding an alias

Rename the file in `model_definitions/`, update `index.json` and the references, and add the old name
here. Keep an alias for as long as published links or saved specs may use the old name.
