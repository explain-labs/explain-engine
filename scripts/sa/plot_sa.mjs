// Generate the two sensitivity-analysis figures for the AI-parameterization paper (P6),
// from the on-disk campaign results. Pure JavaScript, zero dependencies, emits standalone
// SVG (matching the repo's flat thesis/*.svg figure-asset convention) — no plotting library,
// consistent with the SA harness's no-dependency style.
//
//   node scripts/sa/plot_sa.mjs           # writes both SVGs into thesis/
//   node scripts/sa/plot_sa.mjs --out DIR # override output directory
//
// Fig A  (FigSA_onelever_validation.svg)      — per-target first-order Sᵢ vs total S_Tᵢ of the
//        DESIGNATED lever (weight-fixed Sobol′, term neonate, N=512). Colour = one-lever verdict.
// Fig B  (FigSA_operating_point_dominance.svg) — OAT local-dominance heatmap: which lever most
//        influences each target at each operating point. Visualises the operating-point-dependent
//        dominance finding (the SpO₂ row shifts diffusion → PVR/shunt in hypoxaemic phenotypes).
//
// Data sources (already on disk):
//   results/_summary.json                     — term-neonate Sobol′/PRCC/identifiability (Fig A)
//   results/<scenario>_oat_reduced.json       — OAT elasticities per operating point (Fig B)

import fs from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const RES = new URL("./results/", import.meta.url).pathname;
const OUT = arg("--out", new URL("../../thesis/", import.meta.url).pathname);
const load = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- shared display maps ---------------------------------------------------
const TARGET_LABEL = {
  map: "MAP", pap_m: "mean PAP", cvp: "CVP", hr: "HR", be: "BE", ph: "pH",
  co: "CO", pco2: "PaCO₂", spo2: "SpO₂", po2: "PaO₂", q_da: "ductal flow", q_fo: "FO flow",
};
const LEVER_LABEL = {
  systemic_R: "systemic R", pulmonary_R: "pulmonary R", venous_uvol: "venous uvol",
  heart_rate_ref: "HR ref", uma: "UMA", vent_drive: "vent drive",
  O2_diffusion: "O₂ diffusion", contractility: "contractility",
  pda_diameter: "ductal Ø", fo_diameter: "FO Ø", weight: "weight",
};
// stable colour per lever (for the heatmap)
const LEVER_COLOR = {
  systemic_R: "#4e79a7", pulmonary_R: "#e15759", venous_uvol: "#59a14f",
  heart_rate_ref: "#b07aa1", uma: "#9c755f", vent_drive: "#edc948",
  O2_diffusion: "#76b7b2", contractility: "#f28e2b",
  pda_diameter: "#bab0ac", fo_diameter: "#ff9da7", weight: "#8c8c8c",
};

// ---------------------------------------------------------------------------
// FIGURE A — one-lever validation (Sᵢ vs S_Tᵢ of the designated lever)
// ---------------------------------------------------------------------------
function figA() {
  const sum = load(RES + "_summary.json");
  if (!sum || !sum.term_neonate) throw new Error("missing results/_summary.json (term_neonate)");
  const T = sum.term_neonate.targets;
  // paper order: the three clean pressure levers, then coupled, then the inert oxygenation pair
  const order = ["map", "pap_m", "cvp", "hr", "be", "ph", "co", "pco2", "spo2", "po2"];
  const rows = order.filter((t) => T[t] && T[t].sobol);

  const W = 820, H = 460, mL = 70, mR = 210, mT = 54, mB = 70;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const yMax = 1.2;
  const y = (v) => mT + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
  const bandW = plotW / rows.length, barW = bandW * 0.30;

  const verdictColor = (v) =>
    v === "ONE-LEVER OK" ? "#2e7d32" : v.startsWith("dominant") ? "#e8a33d" : "#c0392b";
  const verdictName = (v) =>
    v === "ONE-LEVER OK" ? "clean one-lever" : v.startsWith("dominant") ? "dominant, interacting" : "dominated (fails)";

  let s = "";
  // y gridlines + axis
  for (let g = 0; g <= yMax + 1e-9; g += 0.2) {
    const yy = y(g);
    s += `<line x1="${mL}" y1="${yy.toFixed(1)}" x2="${mL + plotW}" y2="${yy.toFixed(1)}" stroke="#e5e5e5"/>`;
    s += `<text x="${mL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#555">${g.toFixed(1)}</text>`;
  }
  // the "= 1" reference (total variance) — S_Ti above it flags heavy interaction
  s += `<line x1="${mL}" y1="${y(1).toFixed(1)}" x2="${mL + plotW}" y2="${y(1).toFixed(1)}" stroke="#999" stroke-dasharray="4 3"/>`;
  s += `<text x="${mL + plotW + 6}" y="${(y(1) + 4).toFixed(1)}" font-size="11" fill="#999">1.0</text>`;

  rows.forEach((t, i) => {
    const r = T[t], so = r.sobol;
    const cx = mL + i * bandW + bandW / 2;
    const col = verdictColor(r.verdict);
    const siClamped = Math.max(0, so.Si); // a small negative Sᵢ (SpO₂) clamps to 0 for display
    // total-index bar (outline) behind the first-order bar (solid)
    const xT = cx - barW - 2, xS = cx + 2;
    s += `<rect x="${xT.toFixed(1)}" y="${y(so.STi).toFixed(1)}" width="${barW.toFixed(1)}" height="${(y(0) - y(so.STi)).toFixed(1)}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="1"/>`;
    s += `<rect x="${xS.toFixed(1)}" y="${y(siClamped).toFixed(1)}" width="${barW.toFixed(1)}" height="${(y(0) - y(siClamped)).toFixed(1)}" fill="${col}"/>`;
    // S_Ti>1 marker
    if (so.STi > 1.0) s += `<text x="${(xT + barW / 2).toFixed(1)}" y="${(y(so.STi) - 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="${col}">†</text>`;
    // Sᵢ value label
    s += `<text x="${(xS + barW / 2).toFixed(1)}" y="${(y(siClamped) - 4).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#333">${so.Si.toFixed(2)}</text>`;
    // target label
    s += `<text x="${cx.toFixed(1)}" y="${(mT + plotH + 18).toFixed(1)}" text-anchor="middle" font-size="12" fill="#222">${esc(TARGET_LABEL[t] || t)}</text>`;
    // designated lever (small, under the target)
    s += `<text x="${cx.toFixed(1)}" y="${(mT + plotH + 32).toFixed(1)}" text-anchor="middle" font-size="9" fill="#888">${esc(LEVER_LABEL[r.designated] || r.designated)}</text>`;
  });

  // axis lines
  s += `<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT + plotH}" stroke="#333"/>`;
  s += `<line x1="${mL}" y1="${mT + plotH}" x2="${mL + plotW}" y2="${mT + plotH}" stroke="#333"/>`;
  // y title
  s += `<text transform="translate(18,${mT + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="#333">Sobol index (variance fraction)</text>`;

  // legend
  const lx = mL + plotW + 26; let ly = mT + 6;
  const legend = [
    ["#2e7d32", "clean one-lever"],
    ["#e8a33d", "dominant, interacting"],
    ["#c0392b", "dominated (design fails)"],
  ];
  s += `<text x="${lx}" y="${ly}" font-size="12" font-weight="bold" fill="#333">Verdict (colour)</text>`; ly += 20;
  legend.forEach(([c, name]) => {
    s += `<rect x="${lx}" y="${ly - 10}" width="13" height="13" fill="${c}"/>`;
    s += `<text x="${lx + 19}" y="${ly + 1}" font-size="11.5" fill="#333">${name}</text>`; ly += 20;
  });
  ly += 8;
  s += `<text x="${lx}" y="${ly}" font-size="12" font-weight="bold" fill="#333">Bars</text>`; ly += 18;
  s += `<rect x="${lx}" y="${ly - 10}" width="13" height="13" fill="#555"/>`;
  s += `<text x="${lx + 19}" y="${ly + 1}" font-size="11.5" fill="#333">Sᵢ  first-order</text>`; ly += 18;
  s += `<rect x="${lx}" y="${ly - 10}" width="13" height="13" fill="#fff" stroke="#555"/>`;
  s += `<text x="${lx + 19}" y="${ly + 1}" font-size="11.5" fill="#333">S_Tᵢ  total</text>`; ly += 22;
  s += `<text x="${lx}" y="${ly}" font-size="11" fill="#666">† S_Tᵢ&gt;1: heavy</text>`; ly += 14;
  s += `<text x="${lx}" y="${ly}" font-size="11" fill="#666">interaction (finite-N)</text>`;

  const title = `<text x="${mL}" y="26" font-size="16" font-weight="bold" fill="#111">Sensitivity validation of the one-lever design</text>`
    + `<text x="${mL}" y="43" font-size="12" fill="#666">Designated lever per target — term neonate, body weight held fixed (Sobol′, N=512)</text>`;
  return svg(W, H, title + s);
}

// ---------------------------------------------------------------------------
// FIGURE B — operating-point dominance heatmap (OAT)
// ---------------------------------------------------------------------------
function figB() {
  const scenarios = [
    ["term_neonate", "Term"],
    ["preterm_28wk", "Preterm 28wk"],
    ["bischoff_cohort", "Bischoff 25wk"],
    ["pphn", "PPHN"],
    ["cdh_severe", "CDH (severe)"],
    ["dtga", "d-TGA"],
    ["hlhs", "HLHS"],
  ].filter(([f]) => fs.existsSync(RES + `${f}_oat_reduced.json`));
  const targets = ["map", "pap_m", "cvp", "hr", "co", "spo2", "po2", "pco2", "be", "ph"];

  // per (scenario,target) dominant lever = argmax|normSens| over the OAT elasticity cells
  const dom = {}; const designated = {};
  for (const [f] of scenarios) {
    const oat = load(RES + `${f}_oat_reduced.json`);
    const params = oat.params, ela = oat.result.elasticities;
    dom[f] = {};
    for (const t of targets) {
      const cells = ela[t]; if (!cells) { dom[f][t] = null; continue; }
      let mj = -1, mv = 0;
      cells.forEach((c, j) => { if (Number.isFinite(c.normSens) && Math.abs(c.normSens) > Math.abs(mv)) { mv = c.normSens; mj = j; } });
      dom[f][t] = mj >= 0 ? params[mj] : null;
    }
  }
  // designated levers (from term summary, stable across scenarios)
  const sum = load(RES + "_summary.json");
  for (const t of targets) designated[t] = sum?.term_neonate?.targets?.[t]?.designated;

  const cw = 118, ch = 30, mL = 92, mT = 96, mB = 96;
  const W = mL + scenarios.length * cw + 220, H = mT + targets.length * ch + mB;

  let s = "";
  // column headers
  scenarios.forEach(([, lab], c) => {
    const x = mL + c * cw + cw / 2;
    s += `<text x="${x.toFixed(1)}" y="${mT - 10}" text-anchor="middle" font-size="12" font-weight="bold" fill="#222">${esc(lab)}</text>`;
  });
  // rows
  targets.forEach((t, r) => {
    const yy = mT + r * ch;
    s += `<text x="${mL - 10}" y="${(yy + ch / 2 + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#222">${esc(TARGET_LABEL[t] || t)}</text>`;
    scenarios.forEach(([f], c) => {
      const x = mL + c * cw, lever = dom[f][t];
      const fill = lever ? LEVER_COLOR[lever] || "#ddd" : "#f4f4f4";
      const isDesignated = lever && lever === designated[t];
      s += `<rect x="${x}" y="${yy}" width="${cw - 3}" height="${ch - 3}" fill="${fill}" fill-opacity="0.55" stroke="${isDesignated ? "#111" : "#fff"}" stroke-width="${isDesignated ? 2 : 1}"/>`;
      s += `<text x="${(x + (cw - 3) / 2).toFixed(1)}" y="${(yy + ch / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="#111">${esc(LEVER_LABEL[lever] || "—")}</text>`;
    });
  });
  // highlight the SpO₂ / PaO₂ oxygenation band
  const oxRow = targets.indexOf("spo2");
  s += `<rect x="${mL - 2}" y="${mT + oxRow * ch - 2}" width="${scenarios.length * cw}" height="${2 * ch - 1}" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="5 3"/>`;
  s += `<text x="${mL + scenarios.length * cw + 8}" y="${(mT + oxRow * ch + ch - 4).toFixed(1)}" font-size="11" fill="#c0392b">oxygenation lever</text>`;
  s += `<text x="${mL + scenarios.length * cw + 8}" y="${(mT + oxRow * ch + 2 * ch - 6).toFixed(1)}" font-size="11" fill="#c0392b">shifts with phenotype</text>`;

  // note about designated-lever border
  s += `<rect x="${mL}" y="${H - mB + 40}" width="14" height="14" fill="#fff" stroke="#111" stroke-width="2"/>`;
  s += `<text x="${mL + 20}" y="${H - mB + 51}" font-size="11.5" fill="#333">bold border = calibrator's designated lever locally dominates (one-lever holds)</text>`;
  s += `<text x="${mL}" y="${H - mB + 74}" font-size="11" fill="#666">cell = the lever with the largest local (OAT) influence on that target at that operating point.</text>`;

  const title = `<text x="${mL - 20}" y="30" font-size="16" font-weight="bold" fill="#111">Operating-point-dependent dominance</text>`
    + `<text x="${mL - 20}" y="49" font-size="12" fill="#666">Which lever most influences each target — and how that changes with the disease phenotype</text>`;
  return svg(W, H, title + s);
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Helvetica, Arial, sans-serif">`
    + `<rect width="${w}" height="${h}" fill="#ffffff"/>${body}</svg>\n`;
}

// ---- write -----------------------------------------------------------------
const outs = [
  ["FigSA_onelever_validation.svg", figA()],
  ["FigSA_operating_point_dominance.svg", figB()],
];
for (const [name, content] of outs) {
  fs.writeFileSync(OUT + name, content);
  console.log(`wrote ${OUT}${name}  (${content.length} bytes)`);
}
