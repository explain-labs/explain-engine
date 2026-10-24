// Scenario migration for two resistance-channel fixes (format-preserving, patches only the keys named).
//
// 1. Hormones gets its own systemic channels in Circulation (svr_factor_hormones_art / _ven, like Drugs'
//    svr_factor_drug). Hormones used to write svr_factor_art / svr_factor_ven, so the user's setting of
//    those was overwritten. The current values (all from Hormones) move to the new channels with their
//    prev_* bookkeeping, and svr_factor_art / _ven (+ prev) go to 1: every vessel's r_factor_ps is
//    unchanged by this part.
// 2. Kidneys' autoregulation writes the afferent inflow resistor AD_KID_ART instead of the KID_ART
//    vessel: an absolute write to KID_ART.r_factor_ps erased what Circulation adds there (SVR, Hormones,
//    Drugs). AD_KID_ART.r_factor_ps takes the autoregulation factor; KID_ART.r_factor_ps takes the value
//    its sibling arteriole INT_ART accumulated (the channel history KID_ART lost). Kidneys.aff_vessel_name
//    (replaced by aff_resistor_name, default AD_KID_ART) and the stale Circulation.svr_factor are removed.
//
//   node scripts/_migrate_svr_channels.mjs <scenario> [...] [--write]
import fs from "node:fs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const names = argv.filter((a) => !a.startsWith("--"));
const out = (...a) => process.stderr.write(a.join(" ") + "\n");

// [start, end) of the object `"name": { … }` inside model_definition that has its own model_type
function findModelBlock(src, name) {
  let from = src.indexOf('"model_definition"');
  for (;;) {
    const start = src.indexOf(`"${name}": {`, from);
    if (start < 0) throw new Error(`${name} not found`);
    let depth = 0, end = start;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (/\n\s*"model_type": "/.test(src.slice(start, end))) return [start, end];
    from = end;
  }
}
// the block's own direct-member key lines, by indentation of its first key
function editBlock(src, name, fn) {
  const [start, end] = findModelBlock(src, name);
  const lines = src.slice(start, end).split("\n");
  const ind = lines[1].match(/^\s*/)[0];
  const out_lines = fn(lines, ind);
  return src.slice(0, start) + out_lines.join("\n") + src.slice(end);
}
const setKey = (lines, ind, key, value) => {
  const i = lines.findIndex((l) => l.startsWith(`${ind}"${key}": `));
  if (i < 0) throw new Error(`${key} not found`);
  lines[i] = lines[i].replace(/^(\s*"[^"]+": )[^,]*(,?)$/, `$1${value}$2`);
  return lines;
};
const insertAfter = (lines, ind, after, key, value) => {
  const i = lines.findIndex((l) => l.startsWith(`${ind}"${after}": `));
  if (i < 0) throw new Error(`${after} not found`);
  lines.splice(i + 1, 0, `${ind}"${key}": ${value},`);
  return lines;
};
const removeKey = (lines, ind, key) => {
  const i = lines.findIndex((l) => l.startsWith(`${ind}"${key}": `));
  if (i < 0) return lines;
  if (!lines[i].trimEnd().endsWith(",")) lines[i - 1] = lines[i - 1].replace(/,\s*$/, "");
  lines.splice(i, 1);
  return lines;
};

for (const name of names) {
  const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
  const src = fs.readFileSync(file, "utf8");
  const md = JSON.parse(src).model_definition.models;
  const C = md.Circulation, K = md.Kidneys;
  const KA = C.components.KID_ART, IA = C.components.INT_ART;
  const af = KA.r_factor_ps, sib = IA.r_factor_ps;

  let p = src;
  p = editBlock(p, "Circulation", (L, ind) => {
    insertAfter(L, ind, "svr_factor_drug", "svr_factor_hormones_ven", C.svr_factor_ven);
    insertAfter(L, ind, "svr_factor_drug", "svr_factor_hormones_art", C.svr_factor_art);
    insertAfter(L, ind, "prev_svr_factor_drug", "prev_svr_factor_hormones_ven", C.prev_svr_factor_ven);
    insertAfter(L, ind, "prev_svr_factor_drug", "prev_svr_factor_hormones_art", C.prev_svr_factor_art);
    for (const k of ["svr_factor_art", "prev_svr_factor_art", "svr_factor_ven", "prev_svr_factor_ven"]) setKey(L, ind, k, 1);
    removeKey(L, ind, "svr_factor");
    return L;
  });
  p = editBlock(p, "KID_ART", (L, ind) => setKey(L, ind, "r_factor_ps", sib));
  p = editBlock(p, "AD_KID_ART", (L, ind) => setKey(L, ind, "r_factor_ps", af));
  p = editBlock(p, "Kidneys", (L, ind) => removeKey(L, ind, "aff_vessel_name"));

  // check: exactly the intended changes
  const exp = JSON.parse(src);
  const em = exp.model_definition.models, EC = em.Circulation;
  EC.svr_factor_hormones_art = C.svr_factor_art; EC.svr_factor_hormones_ven = C.svr_factor_ven;
  EC.prev_svr_factor_hormones_art = C.prev_svr_factor_art; EC.prev_svr_factor_hormones_ven = C.prev_svr_factor_ven;
  EC.svr_factor_art = 1; EC.prev_svr_factor_art = 1; EC.svr_factor_ven = 1; EC.prev_svr_factor_ven = 1;
  delete EC.svr_factor;
  EC.components.KID_ART.r_factor_ps = sib;
  em.AD_KID_ART.r_factor_ps = af;
  delete em.Kidneys.aff_vessel_name;
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  if (canon(JSON.parse(p)) !== canon(exp)) throw new Error(`${name}: migration changed more than intended`);
  out(`${name}: Hormones channels art/ven ${C.svr_factor_art.toFixed(4)}/${C.svr_factor_ven.toFixed(4)}; KID_ART r_factor_ps ${af.toFixed(4)} -> ${sib.toFixed(4)} (INT_ART), AD_KID_ART 1 -> ${af.toFixed(4)}`);
  if (WRITE) fs.writeFileSync(file, p);
}
