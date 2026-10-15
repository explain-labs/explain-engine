// Healthy reference set-points of the slow volume/pressure controller (Hormones: RAAS + ADH) for a
// patient re-sized or re-gestated from a baseline scenario.
//
// Hormones compares what it senses against fixed set-points: total blood volume (volume_setpoint)
// and renal perfusion pressure (perfusion_setpoint, KID_ART.pres). They describe the HEALTHY
// reference of the patient the scenario represents, not its current state: a coarctation keeps the
// term reference, so its low renal pressure activates RAAS, as it should. A smaller or less mature
// patient needs its own reference, or it reads as hypovolaemic and hypoperfused at rest. A 0.72 kg
// infant compared against the term 0.286 L and 40 mmHg sat at angiotensin x4.5 and doubled its
// arteriolar resistance through Circulation.svr_factor_art.
//
//   volume_setpoint     scales with the volume factor (weight_scale scales blood volume linearly)
//   perfusion_setpoint  scales with the healthy MAP the gestation defends (the baroreflex set-point
//                       of the healthy patient, br_map in the GA tables), relative to the baseline's
//
// Call it after weight_scale, with the baseline's values read before anything was changed.
export function scaleHormoneReferences(model, { volumeFactor = 1.0, mapRef = null, mapRefBaseline = null } = {}) {
  const H = model?.models?.Hormones;
  if (!H) return null;
  const before = { volume_setpoint: H.volume_setpoint, perfusion_setpoint: H.perfusion_setpoint };
  if (volumeFactor !== 1.0 && H.volume_setpoint > 0) H.volume_setpoint *= volumeFactor;
  if (mapRef != null && mapRefBaseline > 0 && H.perfusion_setpoint > 0) H.perfusion_setpoint *= mapRef / mapRefBaseline;
  return { before, after: { volume_setpoint: H.volume_setpoint, perfusion_setpoint: H.perfusion_setpoint } };
}

// one log line for the generators and the builder trace
export function describeHormoneReferences(r) {
  if (!r) return "Hormones: none in this scenario";
  const f = (x, d) => (typeof x === "number" ? x.toFixed(d) : String(x));
  return `Hormones references: volume_setpoint ${f(r.before.volume_setpoint, 3)} -> ${f(r.after.volume_setpoint, 3)} L, ` +
    `perfusion_setpoint ${f(r.before.perfusion_setpoint, 1)} -> ${f(r.after.perfusion_setpoint, 1)} mmHg`;
}
