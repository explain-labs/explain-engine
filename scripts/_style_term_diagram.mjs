// Give term_neonate_72h's diagram the shared teaching style (SHUNT_STYLE in _diagram.mjs): the duct and the
// foramen ovale in a muted warm grey with captions along the line, and flow arrows instead of dots; and draw
// it at 0.9 of its size (TERM_SCALING; the ToF scenarios keep 1, see _make_tof.mjs); the intrapulmonary
// shunt (IPS) is hidden (disabled, so the file keeps its order). Drawing
// only: the rest of the file is left byte-for-byte as it is (checked). Re-runnable (the result is the same).
//   node scripts/_style_term_diagram.mjs [--write]
import fs from "node:fs";
import { SHUNT_STYLE, hideConnectors, patchDiagram } from "./_diagram.mjs";

const TERM_SCALING = 0.9; // global diagram scale (discs, lines, captions, arrows)

const file = new URL("../model_definitions/term_neonate_72h.json", import.meta.url);
const before = fs.readFileSync(file, "utf8");
const j = JSON.parse(before);
const rest = (x) => JSON.stringify({ ...x, diagram_definition: undefined });
const restBefore = rest(j);
patchDiagram(j.diagram_definition, SHUNT_STYLE);
patchDiagram(j.diagram_definition, { settings: { scaling: TERM_SCALING } });
hideConnectors(j.diagram_definition.components, "IPS");
if (rest(j) !== restBefore) throw new Error("only the diagram may change");
const text = JSON.stringify(j, null, 2);
if (process.argv.includes("--write")) {
  fs.writeFileSync(file, text);
  process.stderr.write(text === before ? "term_neonate_72h: diagram already styled\n" : "term_neonate_72h: diagram styled\n");
} else process.stderr.write("dry run (pass --write)\n");
