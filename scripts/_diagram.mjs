// Shared diagram_definition edits for the scenario generators (_make_*.mjs). The baseline term_neonate_72h
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

// ---- teaching simplification ----------------------------------------------------------------------------
// simplifyDiagram(dd, spec) returns a simpler copy of a diagram_definition without touching the model:
//   hide:     [names]  drop these components and every connector touching them
//   lump:     [{ name, label?, members, colourFrom?, layoutFrom?, layout? }]  fold `members` into one disc
//             `name` (may be one of them). The AnimationPacker sums a component's `models`, so the disc shows
//             the members' total volume; its colour is the to2 of the FIRST listed model, hence colourFrom's
//             models go first. Layout from layoutFrom (default: the member called `name`, else the first
//             member), deep-merged with `layout`.
//   layout:   { name: patch }  deep-merged into a kept component's layout (move a disc, caption a connector)
//   labels:   { name: text }   new label for a kept component ("\n" breaks the line)
//   settings: { ... }          diagram settings to override (e.g. { flowMarker: "arrow" })
// Connectors are re-pointed to the discs; one with both ends in a disc is dropped, parallel ones (same ends)
// merge into one called FROM_TO carrying all their resistors (summed flow), with the widest line's layout
// and colour; a connector that stays alone keeps its name (lesson highlights such as DA, FO, VSD use it).
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

// path widths are stored as numbers or strings ("3")
const pathWidth = (c) => Number(c.layout?.path?.width) || 0;

export function simplifyDiagram(dd, spec) {
  const out = structuredClone(dd);
  const src = out.components ?? {};
  const hidden = new Set(spec.hide ?? []);
  const lumps = spec.lump ?? [];
  const lumpOf = new Map();
  for (const l of lumps) for (const m of l.members) lumpOf.set(m, l.name);
  const end = (name) => lumpOf.get(name) ?? name;

  // compartments and other non-connectors, in their original order; a lump takes the place of its layout source
  const comps = {};
  for (const [name, c] of Object.entries(src)) {
    if (c.type === "Connector" || hidden.has(name)) continue;
    const lump = lumps.find((l) => l.members.includes(name));
    if (!lump) {
      comps[name] = c;
      continue;
    }
    const layoutFrom = lump.layoutFrom ?? (lump.members.includes(lump.name) ? lump.name : lump.members[0]);
    if (name !== layoutFrom) continue;
    const colourFrom = lump.colourFrom ?? layoutFrom;
    const models = [];
    for (const m of [colourFrom, ...lump.members.filter((x) => x !== colourFrom)])
      for (const x of src[m]?.models ?? []) if (!models.includes(x)) models.push(x);
    const disc = structuredClone(c);
    disc.models = models;
    if (lump.label !== undefined) disc.label = lump.label;
    if (lump.layout) deepMerge(disc.layout, lump.layout);
    comps[lump.name] = disc;
  }

  // connectors: re-point the ends, drop those inside one disc or touching a hidden component, merge parallels
  const merged = new Map();
  for (const [name, c] of Object.entries(src)) {
    if (c.type !== "Connector" || hidden.has(name)) continue;
    const from = end(c.dbcFrom);
    const to = end(c.dbcTo);
    if (from === to || !comps[from] || !comps[to]) continue;
    const key = `${from}>${to}`;
    const hit = merged.get(key);
    if (!hit) {
      merged.set(key, { names: [name], conn: { ...c, dbcFrom: from, dbcTo: to, models: [...(c.models ?? [])] } });
      continue;
    }
    hit.names.push(name);
    // the widest line gives the layout and goes first (its first resistor sets the colour), so e.g. a thin
    // coronary return does not stand for a whole venous return
    if (pathWidth(c) > pathWidth(hit.conn)) {
      const own = c.models ?? [];
      hit.conn = { ...c, dbcFrom: from, dbcTo: to, models: [...own, ...hit.conn.models.filter((x) => !own.includes(x))] };
    } else {
      for (const x of c.models ?? []) if (!hit.conn.models.includes(x)) hit.conn.models.push(x);
    }
  }
  for (const { names, conn } of merged.values()) comps[names.length === 1 ? names[0] : `${conn.dbcFrom}_${conn.dbcTo}`] = conn;

  for (const [name, patch] of Object.entries(spec.layout ?? {})) if (comps[name]?.layout) deepMerge(comps[name].layout, patch);
  for (const [name, label] of Object.entries(spec.labels ?? {})) if (comps[name]) comps[name].label = label;
  if (spec.settings) out.settings = { ...(out.settings ?? {}), ...spec.settings };
  out.components = comps;
  return out;
}
