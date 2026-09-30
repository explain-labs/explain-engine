// Shared diagram_definition edits for the scenario generators (_make_*.mjs). The baseline term_neonate
// diagram has no VSD connector, so a lesion that opens the ventricular septum must add one or the shunt
// flow is never drawn.

// Add a VSD connector (LV -> RV; flow +ve = left-to-right) to diagram components `dc`, styled like the
// baseline foramen-ovale chord. Matches the connector scripts/_make_tof.mjs draws.
export function addVsdConnector(dc) {
  dc.VSD = { ...structuredClone(dc.FO), label: "VSD", models: ["VSD"], dbcFrom: "LV", dbcTo: "RV" };
  return dc.VSD;
}
