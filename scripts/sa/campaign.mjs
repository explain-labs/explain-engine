// Staged SA campaign driver. Runs the full screen-then-quantify sequence sequentially
// (each stage spawns run_sa.mjs, which itself forks the worker pool — so we run stages one
// at a time to avoid oversubscribing cores), logging timing + a consolidated manifest.
//
//   node scripts/sa/campaign.mjs            # full campaign (hours; run in background)
//   node scripts/sa/campaign.mjs --quick    # tiny sizes, plumbing only
//
// Stages (per the approved plan):
//   Tier 0  OAT (reduced)     at term_neonate, pphn, cdh_severe, dtga, hlhs   (cheap)
//   Tier 1  Morris (expanded) at term_neonate, pphn, cdh_severe               (screening)
//   Tier 2  Sobol (reduced)   at term_neonate(N=512), pphn(N=256), cdh_severe(N=256)
//   Tier 3  PRCC (reduced)    at term_neonate, pphn, cdh_severe               (monotone cross-check)
// term/pphn/cdh_severe keep all clinical outputs interpretable; dtga/hlhs are OAT-only
// (transposition/single-ventricle make the systemic-CO output ill-defined — documented caveat).

import { spawn } from "node:child_process";
import fs from "node:fs";

const RUN = new URL("./run_sa.mjs", import.meta.url).pathname;
const quick = process.argv.includes("--quick");

const FULL = ["term_neonate", "pphn", "cdh_severe"];
const stages = quick ? [
  { tier: "oat", set: "reduced", pts: ["term_neonate"] },
  { tier: "morris", set: "reduced", pts: ["term_neonate"], extra: ["--r", "3"] },
  { tier: "sobol", set: "reduced", pts: ["term_neonate"], extra: ["--N", "16"] },
  { tier: "prcc", set: "reduced", pts: ["term_neonate"], extra: ["--N", "16"] },
] : [
  { tier: "oat", set: "reduced", pts: ["term_neonate", "pphn", "cdh_severe", "dtga", "hlhs"] },
  { tier: "morris", set: "expanded", pts: FULL, extra: ["--r", "20"] },
  { tier: "prcc", set: "reduced", pts: FULL, extra: ["--N", "768"] },
  // Sobol last (longest); term at full N, disease states at reduced N
  { tier: "sobol", set: "reduced", pts: ["term_neonate"], extra: ["--N", "512"] },
  { tier: "sobol", set: "reduced", pts: ["pphn"], extra: ["--N", "256"] },
  { tier: "sobol", set: "reduced", pts: ["cdh_severe"], extra: ["--N", "256"] },
];

const runOne = (scenario, tier, set, extra = []) => new Promise((resolve) => {
  const args = [RUN, "--scenario", scenario, "--tier", tier, "--set", set, ...extra];
  const t0 = Date.now();
  console.error(`\n>>> ${tier}/${set} @ ${scenario} ${extra.join(" ")}`);
  const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
  child.on("exit", (code) => {
    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    console.error(`<<< ${tier}/${set} @ ${scenario} done in ${dt}s (exit ${code})`);
    resolve({ scenario, tier, set, extra, seconds: Number(dt), code });
  });
});

const manifest = [];
const T0 = Date.now();
for (const st of stages) {
  for (const pt of st.pts) {
    const rec = await runOne(pt, st.tier, st.set, st.extra || []);
    manifest.push(rec);
    fs.writeFileSync(new URL("./results/_campaign_manifest.json", import.meta.url).pathname,
      JSON.stringify({ startedMsAgo: Date.now() - T0, runs: manifest }, null, 2));
  }
}
console.error(`\n=== campaign complete: ${manifest.length} runs in ${((Date.now() - T0) / 60000).toFixed(1)} min ===`);
