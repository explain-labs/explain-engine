// Build the cardiovascular paper's experiment patients with the AI parameterization pipeline.
//
// For each case in papers/p1/cases/<id>.md: send the case description to the Explain bot
// (the Claude interpretation layer on the bot host), which answers with an `explain-build`
// SPEC that the host runs through scripts/build_patient.mjs. The reply is archived as
// papers/p1/specs/<id>.json (the bot's prose, the SPEC it wrote, the host's build report).
// The patient is then REBUILT LOCALLY from that SPEC with this checkout's engine — the host's
// engine may be another version — and written to model_definitions/p1_<id>.json, so the
// deposited scenario is reproducible from the archived SPEC without the language model.
//
// Usage:
//   set -a; source ../explain-ui/.env.local; set +a        # EXPLAIN_BOT_URL / EXPLAIN_BOT_API_KEY
//   node scripts/p1_build.mjs --only baseline,pda_none      # ask the bot, archive, rebuild
//   node scripts/p1_build.mjs --only baseline --no-bot      # rebuild from the archived SPEC only
//
// The API key is read from the environment and never printed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ONLY = opt("--only")?.split(",").filter(Boolean);
const NO_BOT = argv.includes("--no-bot");
const root = fileURLToPath(new URL("..", import.meta.url));
const casesDir = path.join(root, "papers/p1/cases");
const specsDir = path.join(root, "papers/p1/specs");
const defsDir = path.join(root, "model_definitions");
const BUILDER = path.join(root, "scripts/build_patient.mjs");
const log = (s) => process.stderr.write(s + "\n");

const BUILD_RE = /```explain-build\s*(\{[\s\S]*?\})\s*```/;

async function askBot(prompt) {
  const url = process.env.EXPLAIN_BOT_URL;
  const key = process.env.EXPLAIN_BOT_API_KEY;
  if (!url || !key) throw new Error("EXPLAIN_BOT_URL / EXPLAIN_BOT_API_KEY not set (source explain-ui/.env.local)");
  const res = await fetch(`${url.replace(/\/$/, "")}/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`bot host ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const ids = fs.readdirSync(casesDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).filter((id) => !ONLY || ONLY.includes(id));
let failed = 0;
for (const id of ids) {
  const specFile = path.join(specsDir, `${id}.json`);
  let archive;
  if (NO_BOT) {
    archive = JSON.parse(fs.readFileSync(specFile, "utf8"));
    log(`${id}: using archived SPEC (${archive.date})`);
  } else {
    const prompt = fs.readFileSync(path.join(casesDir, `${id}.md`), "utf8");
    log(`${id}: asking the bot…`);
    const t0 = Date.now();
    const reply = await askBot(prompt);
    const build = reply.build ?? null;
    // the SPEC: the host echoes the one it ran; fall back to the fenced block in the prose
    let spec = build?.spec ?? null;
    if (!spec) { const m = BUILD_RE.exec(reply.answer ?? ""); if (m) spec = JSON.parse(m[1]); }
    if (!spec) { log(`${id}: the bot produced no explain-build SPEC — reply archived, nothing built`); }
    archive = {
      case: `cases/${id}.md`,
      date: new Date().toISOString(),
      seconds: Math.round((Date.now() - t0) / 1000),
      conversation_id: reply.conversation_id ?? null,
      answer: reply.answer ?? "",
      spec,
      host_build: build, // the host's own calibration report (its engine version), for the record
    };
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(specFile, JSON.stringify(archive, null, 2) + "\n");
    log(`${id}: archived ${path.relative(root, specFile)} (${archive.seconds} s)`);
    if (!spec) { failed++; continue; }
  }
  // rebuild locally from the archived SPEC with this checkout's engine
  const spec = { ...archive.spec, name: `p1_${id}` };
  spec.description = spec.description || `${id}: built by the AI parameterization pipeline from the paper's Table targets (see papers/p1/specs/${id}.json)`;
  log(`${id}: rebuilding locally with scripts/build_patient.mjs…`);
  const r = spawnSync("node", [BUILDER, "--pretty"], { input: JSON.stringify(spec), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { log(`${id}: local build FAILED\n${r.stderr.slice(-2000)}`); failed++; continue; }
  const out = path.join(defsDir, `p1_${id}.json`);
  fs.writeFileSync(out, r.stdout);
  const report = JSON.parse(r.stdout).build_report;
  log(`${id}: wrote ${path.relative(root, out)} — ${report.converged ? "CONVERGED" : "INCOMPLETE"} in ${report.iters} iters`);
  for (const t of report.targets) log(`    ${t.key.padEnd(6)} target ${t.target}  value ${t.value}  ${t.within ? "ok" : "MISSED"}${t.lever_at_bound ? " (lever at bound)" : ""}`);
  // register in index.json (text edit: keep the file's formatting)
  const indexFile = path.join(defsDir, "index.json");
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  if (!index.includes(`p1_${id}`)) { index.push(`p1_${id}`); fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n"); }
}
process.exit(failed ? 1 : 0);
