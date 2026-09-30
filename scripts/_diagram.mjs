// Shared diagram_definition edits for the scenario generators (_make_*.mjs). The baseline term_neonate
// diagram only draws the normal circulation, so a lesion that adds a pathway must add its connector (or
// its flow is never drawn), and one that closes a structure should hide the connector drawn over it.

// Add a straight chord connector `name` (from -> to, animated by the flow of `models`) to diagram
// components `dc`, styled like the baseline foramen-ovale chord. Chords cross the ring interior, so they
// don't run over the ring arcs the way a ring-to-ring "arc" connector would.
export function addChordConnector(dc, name, models, from, to, label = "") {
  dc[name] = { ...structuredClone(dc.FO), label, models, dbcFrom: from, dbcTo: to };
  return dc[name];
}

// Add a VSD connector (LV -> RV; flow +ve = left-to-right). Matches the one scripts/_make_tof.mjs draws.
export function addVsdConnector(dc) {
  return addChordConnector(dc, "VSD", ["VSD"], "LV", "RV", "VSD");
}

// Hide connectors drawn over closed/atretic structures (the renderer skips disabled connectors).
export function hideConnectors(dc, ...names) {
  for (const n of names) if (dc[n]) dc[n].enabled = false;
}

// Draw connector `name` narrower than the standard 7 px to show a stenosis (the coronaries, the thinnest
// vessels in the baseline diagram, are 3 px; a critical valve is drawn thinner still).
export const STENOSIS_WIDTH = 2;
export function narrowConnector(dc, name, width = STENOSIS_WIDTH) {
  if (dc[name]) dc[name].layout.path.width = width;
}
