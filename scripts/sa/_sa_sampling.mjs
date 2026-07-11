// Pure-JS experimental designs for sensitivity analysis.
//   - deterministic PRNG (mulberry32) so every campaign is reproducible from a seed
//   - Latin Hypercube (LHS)              -> PRCC / general global sampling
//   - Morris trajectories               -> elementary-effects screening (mu*, sigma)
//   - Saltelli cross-sample (A,B,AB_i)  -> variance-based Sobol' indices
//
// All designs are generated in the UNIT cube [0,1]^k. `toParam(problem, U)` maps a unit
// row to physical parameter values honouring each param's [lo,hi] and log/linear scale.
// A "problem" is { names:[...], lo:[...], hi:[...], scale:[...] } (scale = "log"|"linear").

// ---------- PRNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- unit-cube -> physical mapping ----------
export function problemFromParams(params) {
  return {
    names: params.map((p) => p.name),
    lo: params.map((p) => p.lo),
    hi: params.map((p) => p.hi),
    scale: params.map((p) => p.scale || "linear"),
  };
}

// map a single unit value u in [0,1] on dimension d to a physical value
export function unitToValue(problem, d, u) {
  const lo = problem.lo[d], hi = problem.hi[d];
  if (problem.scale[d] === "log") {
    // guard: log scale needs lo>0; params with lo==0 must be declared "linear"
    const a = Math.log(lo), b = Math.log(hi);
    return Math.exp(a + u * (b - a));
  }
  return lo + u * (hi - lo);
}

export function toParam(problem, U) {
  return U.map((row) => row.map((u, d) => unitToValue(problem, d, u)));
}

// ---------- Latin Hypercube ----------
// N points in [0,1]^k, one per stratum per dimension, randomly paired.
export function lhs(k, N, rng) {
  const U = Array.from({ length: N }, () => new Array(k));
  for (let d = 0; d < k; d++) {
    // random permutation of strata 0..N-1
    const perm = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < N; i++) U[i][d] = (perm[i] + rng()) / N;
  }
  return U;
}

// ---------- Morris trajectories (elementary effects) ----------
// Standard Morris (1991) oriented design with p levels, delta = p/(2(p-1)).
// Returns { U, moves } where U has r*(k+1) rows and moves[t] describes trajectory t:
//   moves[t] = [{ from, to, dim, sign }...]  (k steps), each step changes ONE dim by +/-delta.
// Elementary effect for dim on that step = (Y[to]-Y[from]) / (sign*delta_unit),
// where delta_unit = delta (both in unit space); analysis converts as needed.
export function morris(k, r, rng, { levels = 8 } = {}) {
  const p = levels;
  const delta = p / (2 * (p - 1));               // unit-space step
  const grid = [];                                // allowed base coords {0,1/(p-1),...}
  for (let i = 0; i < p; i++) grid.push(i / (p - 1));
  const gridLo = grid.filter((g) => g <= 1 - delta + 1e-9); // base coords that leave room for +delta

  const U = [];
  const moves = [];
  for (let t = 0; t < r; t++) {
    // random base point (each coord on a grid value that allows a +delta step)
    const base = new Array(k);
    for (let d = 0; d < k; d++) base[d] = gridLo[Math.floor(rng() * gridLo.length)];
    // random permutation = order in which dims are stepped
    const order = Array.from({ length: k }, (_, i) => i);
    for (let i = k - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    // random direction per dim (+/-). base coords all allow +delta; for - we start high instead.
    const dir = new Array(k);
    const start = base.slice();
    for (let d = 0; d < k; d++) {
      dir[d] = rng() < 0.5 ? 1 : -1;
      if (dir[d] === -1) start[d] = base[d] + delta; // so a -delta step lands back on the grid in-range
    }
    const startIdx = U.length;
    U.push(start.slice());
    const tMoves = [];
    let cur = start.slice();
    for (let s = 0; s < k; s++) {
      const d = order[s];
      const next = cur.slice();
      next[d] = cur[d] + dir[d] * delta;
      const fromIdx = U.length - 1, toIdx = U.length;
      U.push(next);
      tMoves.push({ from: fromIdx, to: toIdx, dim: d, sign: dir[d] });
      cur = next;
    }
    moves.push(tMoves);
    void startIdx;
  }
  return { U, moves, delta };
}

// ---------- Saltelli cross-sample for Sobol' indices ----------
// A, B independent base samples (N x k). Build AB_i = A with column i taken from B.
// Total rows = N*(k+2), laid out as [A(N)] [B(N)] [AB_0(N)] ... [AB_{k-1}(N)].
// Returns { U, N, k } — evaluate all rows, then slice with the helpers below.
export function saltelli(k, N, rng, { base = "lhs" } = {}) {
  const A = base === "lhs" ? lhs(k, N, rng) : Array.from({ length: N }, () => Array.from({ length: k }, () => rng()));
  const B = base === "lhs" ? lhs(k, N, rng) : Array.from({ length: N }, () => Array.from({ length: k }, () => rng()));
  const U = [];
  for (let i = 0; i < N; i++) U.push(A[i].slice());
  for (let i = 0; i < N; i++) U.push(B[i].slice());
  for (let d = 0; d < k; d++) {
    for (let i = 0; i < N; i++) {
      const row = A[i].slice();
      row[d] = B[i][d];
      U.push(row);
    }
  }
  return { U, N, k };
}

// slice helpers for a flat Y over the saltelli layout
export function saltelliSlices(Y, N, k) {
  const YA = Y.slice(0, N);
  const YB = Y.slice(N, 2 * N);
  const YAB = [];
  for (let d = 0; d < k; d++) YAB.push(Y.slice((2 + d) * N, (3 + d) * N));
  return { YA, YB, YAB };
}
