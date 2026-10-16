// One-off repair: give term_neonate's large arteries (AA, AAR, AD) non-linear stiffening.
//
// Their el_k was 0, so the aorta was a linear spring. Pressure in a compartment is
//   P = el_k * S^2 + el * S,   S = V - U (stressed volume, L)
// Per vessel, with V0 its mean volume, S0 its mean stressed volume, P0 = E0*S0 its mean recoil
// pressure and E0 its effective elastance, the new (el', el_k, U') keep
//   1. the same pressure at the same volume:          P(V0) = P0
//   2. the same incremental stiffness (pulse pressure): dP/dV(V0) = E0
//   3. the quadratic term carrying half the pressure:  el_k*S'^2 = 0.5*P0
// which solve to  S' = 1.5*S0,  el' = E0/3,  el_k = E0/(4.5*S0),  U' = V0 - 1.5*S0.
// The vessel holds the same blood at rest; stiffness then rises with pressure (~x1.2 at +50 %, the
// most a quadratic term can give is stiffness ~ sqrt(P)). Only the touched fields are patched.
//
//   node scripts/_fix_artery_elk.mjs [scenario=term_neonate] [--write]
import fs from "node:fs";
import { createEngine } from "./_harness.mjs";
import { measureVitals } from "./_probe.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const name = argv.find((a) => !a.startsWith("--")) ?? "term_neonate";
const file = new URL(`../model_definitions/${name}.json`, import.meta.url);
const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);
const out = (s) => process.stderr.write(s + "\n");

const ARTERIES = ["AA", "AAR", "AD"];
const PART = ["BR_ART", "LS_ART", "INT_ART", "KID_ART", "RUB", "RLB"]; // the MAP lever, for the check
const eng = await createEngine();
const send = eng.send;

// 1. mean volume and effective elastance of each artery at rest
const model = eng.build(structuredClone(json.model_definition));
const M = model.models;
eng.calc(180);
const N = 1500, V = {};
for (const n of ARTERIES) V[n] = 0;
for (let i = 0; i < N; i++) { send("POST", "calc", 0.02); for (const n of ARTERIES) V[n] += M[n].vol / N; }

// 2. solve the three conditions per vessel and patch the JSON
function findModel(o, n) {
  if (!o || typeof o !== "object") return null;
  if (o.name === n && o.model_type) return o;
  for (const x of Object.values(o)) { const r = findModel(x, n); if (r) return r; }
  return null;
}
const changes = [];
for (const n of ARTERIES) {
  const c = M[n], t = findModel(json.model_definition.models, n);
  for (const k of ["el_base", "el_k", "u_vol"]) if (typeof t?.[k] !== "number") throw new Error(`${n}.${k} not found in ${name}.json`);
  const E0 = c.el_eff, U = c.u_vol_eff, S0 = V[n] - U;
  const elMul = c.el_eff / c.el_base, uMul = c.u_vol_eff / c.u_vol; // factor layers (scaling) stay as they are
  const el = E0 / 3, elk = E0 / (4.5 * S0), Unew = V[n] - 1.5 * S0;
  if (Unew <= 0) throw new Error(`${n}: unstressed volume would be ${Unew}`);
  changes.push(`${n}: el_base ${t.el_base.toFixed(0)}->${(el / elMul).toFixed(0)}, el_k 0->${elk.toExponential(3)}, u_vol ${(t.u_vol * 1000).toFixed(2)}->${((Unew / uMul) * 1000).toFixed(2)} mL (S0 ${(S0 * 1000).toFixed(2)} mL)`);
  t.el_base = el / elMul; t.el_k = elk; t.u_vol = Unew / uMul;
}
out(`${name}: ${changes.join("; ")}`);

const text = JSON.stringify(json, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) +
  (raw.endsWith("\n") ? "\n" : "");

// 3. check: rest, and the MAP lever x1.3 (arterioles; baroreflex disconnected), before vs after
const KEYS = ["sys", "dia", "map", "hr", "lvo", "cvp", "pap_m"];
function report(label, def) {
  for (const [tag, f] of [["rest", 1.0], ["MAP lever x1.3", 1.3]]) {
    const m = eng.build(structuredClone(def)), MM = m.models;
    MM.BR_MAP.efferents = [];
    for (const n of PART) for (const k of ["r_for", "r_back", "r_k"]) MM[n][k] *= f;
    eng.calc(180);
    const v = measureVitals(m, send, { window: 30 });
    out(`${label} ${tag.padEnd(15)}: ` + KEYS.map((k) => `${k} ${v[k].toFixed(2)}`).join(", ") + `, PP ${(v.sys - v.dia).toFixed(2)}`);
  }
}
report("before", JSON.parse(raw).model_definition);
report("after ", JSON.parse(text).model_definition);

if (WRITE) { fs.writeFileSync(file, text); out(`written ${name}.json`); }
