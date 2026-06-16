// Focused probe for the Placenta off-switch fix (stop + clamp must halt the
// umbilical-vein → IVCI return resistor, which used to be owned/clobbered by IVCI).
import fs from "node:fs";
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

let liveModel = null;
globalThis.self = globalThis;
globalThis.postMessage = (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "state") liveModel = msg.payload;
  if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
};
const _log = console.log;
console.log = () => {};
await import("../explain/ModelEngine.js");
const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

const path = new URL(`../public/model_definitions/term_fetus.json`, import.meta.url);
const def = JSON.parse(fs.readFileSync(path, "utf8")).model_definition || JSON.parse(fs.readFileSync(path, "utf8"));
send("POST", "build", def);
send("GET", "state", []);
console.log = _log;

const model = liveModel;
const M = model.models;
const PL = M.Placenta;
const ret = M.PL_UMB_VEN_IVCI;
const IVCI = M.IVCI;
const r = (x, n = 6) => Number((x ?? 0).toFixed(n));

console.log("== wiring ==");
console.log("return resistor found            :", !!ret, ret?.comp_from, "->", ret?.comp_to);
console.log("Placenta references it           :", PL._umb_ven_ret === ret);
console.log("autonomous (not owned by IVCI)   :", !Object.prototype.hasOwnProperty.call(IVCI._resistors, "PL_UMB_VEN_IVCI"));
console.log("PL_UMB_VEN not in IVCI.inputs    :", !IVCI.inputs.includes("PL_UMB_VEN"));

function run(secs) { send("POST", "calc", secs); }
function snap(label) {
  console.log(`\n== ${label} ==`);
  console.log("placenta_running / umb_clamped   :", PL.placenta_running, "/", PL.umb_clamped);
  console.log("return resistor is_enabled/no_flow:", ret.is_enabled, "/", ret.no_flow);
  console.log("return resistor flow (L/s)       :", r(ret.flow));
  console.log("PL_UMB_VEN vol (L)               :", r(M.PL_UMB_VEN.vol, 5), " enabled:", M.PL_UMB_VEN.is_enabled);
}

// 1) RUNNING, UNCLAMPED — expect real flow through the return
PL.placenta_running = true;
PL.umb_clamped = false;
run(5);
snap("RUNNING / UNCLAMPED");
const flowRunning = ret.flow;

// 2) STOPPED — the return resistor must be disabled and move NO volume (the old leak path).
// ret.flow is a stale field once the resistor stops stepping, so assert on is_enabled + actual
// volume conservation: drain comes out of PL_UMB_VEN, so its volume must not fall while stopped.
PL.placenta_running = false;
run(2); // settle the disable
const volBeforeStop = M.PL_UMB_VEN.vol;
const ivciBeforeStop = M.IVCI.vol;
run(5);
snap("STOPPED");
const stopVolDrift = M.PL_UMB_VEN.vol - volBeforeStop;
const retDisabledStopped = ret.is_enabled === false;

// 3) RUNNING, CLAMPED — return must be no_flow and move NO volume.
PL.placenta_running = true;
PL.umb_clamped = true;
run(2);
const volBeforeClamp = M.PL_UMB_VEN.vol;
run(5);
snap("RUNNING / CLAMPED");
const clampVolDrift = M.PL_UMB_VEN.vol - volBeforeClamp;
const retNoFlowClamped = ret.no_flow === true;

console.log("\n== verdict ==");
console.log("flow while running (should be ≠0)      :", r(flowRunning), Math.abs(flowRunning) > 1e-7 ? "OK" : "FAIL");
console.log("STOPPED: return disabled               :", retDisabledStopped ? "OK" : "FAIL");
console.log("STOPPED: PL_UMB_VEN vol drift (≈0)      :", r(stopVolDrift, 8), Math.abs(stopVolDrift) < 1e-7 ? "OK" : "FAIL");
console.log("CLAMPED: return no_flow set             :", retNoFlowClamped ? "OK" : "FAIL");
console.log("CLAMPED: PL_UMB_VEN vol drift (≈0)      :", r(clampVolDrift, 8), Math.abs(clampVolDrift) < 1e-7 ? "OK" : "FAIL");
