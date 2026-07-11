// Pure-JS sensitivity-analysis estimators, each usable on a single output series.
//   - OAT elasticities (central difference, signed, dimensionless)
//   - Morris elementary effects -> mu, mu*, sigma
//   - Sobol' first-order S_i and total S_Ti (Jansen 1999 estimators) + bootstrap CIs
//   - PRCC (rank-transform partial correlation) + bootstrap CIs
//   - identifiability: FIM = S^T S, eigen-spectrum (Jacobi), condition number,
//     column-pivoted-QR subset selection
//
// Validated against the Ishigami function (known analytic Sobol indices) in
// scripts/sa/validate_estimators.mjs before use on the engine.

import { mulberry32 } from "./_sa_sampling.mjs";

// ---------------- basic stats ----------------
export const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export function variance(a) {
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
}
export const std = (a) => Math.sqrt(variance(a));

// average ranks with tie handling (fractional ranks)
export function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const rank = (i + j) / 2 + 1; // 1-based average rank over the tie block
    for (let t = i; t <= j; t++) r[idx[t][1]] = rank;
    i = j + 1;
  }
  return r;
}

// ---------------- OAT elasticities ----------------
// central difference elasticity S = (dy/dx)*(x/y) at nominal x0,y0.
// yPlus, yMinus measured at x0*(1+h) and x0*(1-h) (multiplicative step) OR
// pass absolute xPlus/xMinus for linear-scale params.
export function elasticity({ y0, yPlus, yMinus, x0, xPlus, xMinus }) {
  const dydx = (yPlus - yMinus) / (xPlus - xMinus);
  return (dydx * x0) / y0;
}

// ---------------- Morris elementary effects ----------------
// moves: array of trajectories, each a list of {from,to,dim,sign}; Y indexed by U row.
// deltaUnit = the unit-space step used in the design. Returns per-dim {mu, muStar, sigma}.
export function morrisEE(moves, Y, k, deltaUnit) {
  const ee = Array.from({ length: k }, () => []);
  for (const traj of moves) {
    for (const mv of traj) {
      const d = (Y[mv.to] - Y[mv.from]) / (mv.sign * deltaUnit);
      ee[mv.dim].push(d);
    }
  }
  return ee.map((es) => {
    const mu = mean(es);
    const muStar = mean(es.map(Math.abs));
    const sigma = es.length > 1 ? std(es) : 0;
    return { mu, muStar, sigma, n: es.length };
  });
}

// ---------------- Sobol' indices (Jansen estimators) ----------------
// YA, YB: N-vectors; YAB: array of k N-vectors. Returns per-dim {Si, STi}.
// Jansen 1999:  V - Vi ~ (1/2N) sum (YB - YAB_i)^2   -> Si = 1 - that/Var
//               VTi    ~ (1/2N) sum (YA - YAB_i)^2   -> STi = that/Var
export function sobolJansen(YA, YB, YAB) {
  const N = YA.length;
  const all = YA.concat(YB);
  const Var = variance(all);
  const k = YAB.length;
  const res = [];
  for (let d = 0; d < k; d++) {
    const ab = YAB[d];
    let sTot = 0, sFirst = 0;
    for (let i = 0; i < N; i++) {
      const dT = YA[i] - ab[i];
      sTot += dT * dT;
      const dF = YB[i] - ab[i];
      sFirst += dF * dF;
    }
    const VTi = sTot / (2 * N);
    const Si = 1 - sFirst / (2 * N) / Var;
    res.push({ Si, STi: VTi / Var });
  }
  return { Var, indices: res };
}

// bootstrap CIs for Sobol indices by resampling the N base rows (with replacement).
export function sobolBootstrap(YA, YB, YAB, { nboot = 500, seed = 12345, alpha = 0.05 } = {}) {
  const N = YA.length, k = YAB.length;
  const rng = mulberry32(seed);
  const SiB = Array.from({ length: k }, () => []);
  const STiB = Array.from({ length: k }, () => []);
  for (let b = 0; b < nboot; b++) {
    const idx = new Array(N);
    for (let i = 0; i < N; i++) idx[i] = Math.floor(rng() * N);
    const ya = idx.map((i) => YA[i]);
    const yb = idx.map((i) => YB[i]);
    const yab = YAB.map((col) => idx.map((i) => col[i]));
    const { indices } = sobolJansen(ya, yb, yab);
    for (let d = 0; d < k; d++) { SiB[d].push(indices[d].Si); STiB[d].push(indices[d].STi); }
  }
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))]; };
  return Array.from({ length: k }, (_, d) => ({
    SiCI: [q(SiB[d], alpha / 2), q(SiB[d], 1 - alpha / 2)],
    STiCI: [q(STiB[d], alpha / 2), q(STiB[d], 1 - alpha / 2)],
  }));
}

// ---------------- linear algebra (small dense) ----------------
// invert a square matrix via Gauss-Jordan with partial pivoting; returns null if singular.
export function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-14) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row) => row.slice(n));
}

// Jacobi eigenvalue algorithm for a symmetric matrix -> {values[], vectors[][]} (vectors as columns).
export function jacobiEigen(Sym, { maxSweeps = 100, tol = 1e-12 } = {}) {
  const n = Sym.length;
  const A = Sym.map((r) => r.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let qi = p + 1; qi < n; qi++) off += A[p][qi] * A[p][qi];
    if (off < tol) break;
    for (let p = 0; p < n; p++) {
      for (let qi = p + 1; qi < n; qi++) {
        if (Math.abs(A[p][qi]) < 1e-300) continue;
        const app = A[p][p], aqq = A[qi][qi], apq = A[p][qi];
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(phi), s = Math.sin(phi);
        for (let i = 0; i < n; i++) {
          const aip = A[i][p], aiq = A[i][qi];
          A[i][p] = c * aip - s * aiq;
          A[i][qi] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = A[p][i], aqi = A[qi][i];
          A[p][i] = c * api - s * aqi;
          A[qi][i] = s * api + c * aqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][qi];
          V[i][p] = c * vip - s * viq;
          V[i][qi] = s * vip + c * viq;
        }
      }
    }
  }
  const values = A.map((_, i) => A[i][i]);
  return { values, vectors: V };
}

// ---------------- PRCC ----------------
// X: N x k design (raw params), y: N-vector output. Rank-transform both, then
// partial correlation of each rank(X_i) with rank(y) controlling all other ranks.
// PRCC_i = -Cinv[i, y] / sqrt(Cinv[i,i]*Cinv[y,y]) where C is the (k+1)-corr matrix.
export function prcc(X, y) {
  const N = X.length, k = X[0].length;
  const cols = [];
  for (let d = 0; d < k; d++) cols.push(ranks(X.map((r) => r[d])));
  cols.push(ranks(y));
  const m = cols.map(mean);
  const sd = cols.map(std);
  const p = k + 1;
  // correlation matrix of ranks
  const C = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += (cols[a][i] - m[a]) * (cols[b][i] - m[b]);
      const cov = s / (N - 1);
      const val = cov / (sd[a] * sd[b]);
      C[a][b] = C[b][a] = val;
    }
  }
  const Cinv = invert(C);
  if (!Cinv) return new Array(k).fill(NaN);
  const yi = k;
  const out = new Array(k);
  for (let i = 0; i < k; i++) out[i] = -Cinv[i][yi] / Math.sqrt(Cinv[i][i] * Cinv[yi][yi]);
  return out;
}

export function prccBootstrap(X, y, { nboot = 500, seed = 999, alpha = 0.05 } = {}) {
  const N = X.length, k = X[0].length;
  const rng = mulberry32(seed);
  const boot = Array.from({ length: k }, () => []);
  for (let b = 0; b < nboot; b++) {
    const Xi = new Array(N), yi = new Array(N);
    for (let i = 0; i < N; i++) { const r = Math.floor(rng() * N); Xi[i] = X[r]; yi[i] = y[r]; }
    const pc = prcc(Xi, yi);
    for (let d = 0; d < k; d++) boot[d].push(pc[d]);
  }
  const q = (arr, pp) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(pp * (s.length - 1))))]; };
  return Array.from({ length: k }, (_, d) => [q(boot[d], alpha / 2), q(boot[d], 1 - alpha / 2)]);
}

// ---------------- identifiability ----------------
// Build the local sensitivity matrix S (nOut x k) of normalized sensitivities, then
// FIM = S^T S. Report eigen-spectrum, condition number, and a greedy column-pivoted-QR
// ordering of parameters (most-to-least identifiable given orthogonality to those picked).
export function fimAnalysis(S) {
  const nOut = S.length, k = S[0].length;
  // FIM = S^T S  (k x k)
  const F = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++) {
    for (let b = a; b < k; b++) {
      let s = 0;
      for (let r = 0; r < nOut; r++) s += S[r][a] * S[r][b];
      F[a][b] = F[b][a] = s;
    }
  }
  const { values } = jacobiEigen(F);
  const evals = values.slice().sort((a, b) => b - a);
  const posMin = evals.filter((v) => v > 1e-30).slice(-1)[0] ?? 0;
  const cond = posMin > 0 ? evals[0] / posMin : Infinity;
  // greedy column-pivoted QR on S (Gram-Schmidt with pivoting) -> parameter ordering
  const order = columnPivotQR(S);
  return { fim: F, eigenvalues: evals, condition: cond, qrOrder: order };
}

// column-pivoted QR: repeatedly pick the column with largest residual norm, orthogonalize
// the rest against it. Returns [{param, normBefore}] in pick order (identifiability ranking).
export function columnPivotQR(S) {
  const nOut = S.length, k = S[0].length;
  // work on copies of columns
  const cols = Array.from({ length: k }, (_, d) => S.map((r) => r[d]));
  const chosen = [];
  const remaining = new Set(Array.from({ length: k }, (_, i) => i));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = (a) => Math.sqrt(dot(a, a));
  const basis = [];
  while (remaining.size) {
    let best = -1, bestN = -1;
    for (const d of remaining) { const n = norm(cols[d]); if (n > bestN) { bestN = n; best = d; } }
    chosen.push({ param: best, residualNorm: bestN });
    remaining.delete(best);
    // orthonormal basis vector from chosen residual
    let q = cols[best].slice();
    const qn = norm(q);
    if (qn < 1e-14) { // degenerate: rest are ~dependent
      for (const d of remaining) chosen.push({ param: d, residualNorm: norm(cols[d]) });
      break;
    }
    q = q.map((x) => x / qn);
    basis.push(q);
    for (const d of remaining) {
      const proj = dot(cols[d], q);
      cols[d] = cols[d].map((x, i) => x - proj * q[i]);
    }
    void nOut;
  }
  return chosen;
}
