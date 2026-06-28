// Headless worker-shim harness for the Explain engine.
//
// explain/ModelEngine.js is a Web-Worker module: its only entry point is
// `self.onmessage`, and it replies via `postMessage`. Neither exists in plain
// Node, so we install global shims BEFORE dynamic-importing the engine, then
// drive it through the same { type, message, payload } envelope explain/Model.js
// uses over the wire. `calc` runs fully synchronously, so after each call the
// model state is final and readable directly. Same trick as scripts/headless.mjs;
// extracted so build_patient.mjs (and any future tool) reuses one copy.
//
// console.log is silenced (the engine logs chattily to stdout on every message);
// keep it silenced so a caller can emit pure JSON on stdout and diagnostics on
// stderr (console.error is never touched). Pass { verbose:true } to see engine logs.
import { register } from "node:module";

let _engineImported = false;

export async function createEngine({ verbose = false } = {}) {
  let liveModel = null;
  globalThis.self = globalThis;
  globalThis.postMessage = (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "state") liveModel = msg.payload; // live model object, by reference
    if (msg.type === "error") console.error("ENGINE ERROR:", msg.message, msg.payload ?? "");
    if (msg.type === "status" && /ERROR/i.test(msg.message || "")) console.error("ENGINE:", msg.message);
  };

  const _log = console.log;
  if (!verbose) console.log = () => {};

  // register the extensionless-resolve hook BEFORE the first engine import
  // (the engine uses Vite-style extensionless relative imports)
  if (!_engineImported) {
    register("./resolve-extensionless.mjs", import.meta.url);
    await import("../explain/ModelEngine.js");
    _engineImported = true;
  }

  const send = (type, message, payload) => self.onmessage({ data: { type, message, payload } });

  return {
    send,
    // build a model_definition and capture the live `model` handle (by reference)
    build(def) {
      send("POST", "build", def);
      send("GET", "state", []);
      return liveModel;
    },
    calc(seconds) {
      send("POST", "calc", seconds);
    },
    scale(group, factor) {
      send("POST", "scale", { group, factor });
    },
    get model() {
      return liveModel;
    },
    log: _log, // the original console.log, for callers that want to restore it
  };
}
