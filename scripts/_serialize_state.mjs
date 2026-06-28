// Serialize a live engine `model` object back into a clean model_definition,
// replicating explain/Model.js `_processModelState` (what the in-app save uses).
//
// Strips the runtime helpers (DataCollector/TaskScheduler/ModelScaler), the
// `_`-prefixed locals, the engine-level ncc* cycle counters, the forwarded
// diagram/animation blocks, re-parents any nested `components` back under their
// owner model, and zeroes model_time_total. Mutates and returns the same object.
//
// This is the exact logic that was copy-pasted inline into scripts/_make_*.mjs
// and scripts/reseed_*.mjs (e.g. reseed_preterm.mjs:44-60); extracted here so the
// generic builder (build_patient.mjs) and those scripts can share one source.
export function serializeState(model) {
  delete model["DataCollector"];
  delete model["TaskScheduler"];
  delete model["ModelScaler"];
  delete model["_baseline_weight"];
  delete model["diagram_definition"];
  delete model["animation_definition"];
  for (const key in model) if (key.startsWith("ncc")) delete model[key];
  Object.values(model.models).forEach((m) => {
    for (const key in m) {
      if (key.startsWith("_")) delete m[key];
      if (key === "components" && Object.keys(m[key]).length > 0) {
        Object.keys(m[key]).forEach((cn) => {
          m.components[cn] = model.models[cn];
          delete model.models[cn];
        });
      }
    }
  });
  model.model_time_total = 0;
  return model;
}
