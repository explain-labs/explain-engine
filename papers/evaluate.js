// Shared evaluator for the paper-companion experiments (papers/<id>/experiments.json);
// paper-independent, so every companion and probe imports this one file.
//
// explain-ui's paper companions (/paper/<id>) use it in the browser, sampling the engine's slow stream.
// Each experiment lists `measures`; a measure is either sampled from one dot-path (`path`,
// averaged over the window) or derived from earlier measures (`derive: [op, a, b]`). The
// optional `factor` multiplies and `per_kg` divides by the patient's weight (kg).
//
// Plain ES module, dependency-free, importable from Node and from Vite (alias @explain).

// every dot-path an experiment needs sampled
export function samplePaths(experiment) {
  const paths = new Set();
  for (const m of experiment.measures) if (m.path) paths.add(m.path);
  return [...paths];
}

// resolve "Model.prop.sub" against the live model object (engine side)
export function resolvePath(model, path) {
  const segs = path.split(".");
  let cur = model?.models?.[segs[0]];
  for (let i = 1; i < segs.length && cur != null; i++) cur = cur[segs[i]];
  return typeof cur === "number" ? cur : undefined;
}

// averages: { path: mean over the window }, weight: kg -> { key: value }
export function evaluate(experiment, averages, weight) {
  const out = {};
  for (const m of experiment.measures) {
    let v;
    if (m.path) {
      v = averages[m.path];
    } else if (m.derive) {
      const [op, a, b] = m.derive;
      const x = out[a], y = out[b];
      if (typeof x !== "number" || typeof y !== "number") v = undefined;
      else if (op === "sub") v = x - y;
      else if (op === "add") v = x + y;
      else if (op === "div") v = y !== 0 ? x / y : undefined;
      else if (op === "mul") v = x * y;
    }
    if (typeof v === "number") {
      if (m.factor) v *= m.factor;
      if (m.per_kg && weight > 0) v /= weight;
    }
    out[m.key] = v;
  }
  return out;
}

// numeric formatting shared by the probe and the comparison table
export function fmt(v, round = 1) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "–";
  return v.toFixed(round);
}

// |engine - paper| within the stated tolerance (absolute), or within 10 % when none is given
export function withinTolerance(m, engine) {
  if (typeof m.paper !== "number" || typeof engine !== "number") return null;
  const tol = typeof m.tol === "number" ? m.tol : Math.abs(m.paper) * 0.1;
  return Math.abs(engine - m.paper) <= tol;
}
