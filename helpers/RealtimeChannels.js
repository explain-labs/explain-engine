// RealtimeChannels.js
//
// Shared layout/contract for the realtime DATA PLANE that carries per-frame
// floats from the ModelEngine worker to the main-thread render layer
// (uPlot charts + the PixiJS diagram). This module holds ONLY constants and
// tiny pure helpers so it can be imported by both sides without pulling in any
// worker- or DOM-specific code.
//
// Two independent channels with different drop semantics:
//   - CHART: a ring of fixed-stride rows. The consumer must read EVERY row in
//     order (no dropped samples), so it drains the span [lastRead, writeIdx).
//   - ANIM:  a single "latest frame wins" snapshot. The consumer only ever
//     wants the newest frame; older frames are discarded.
//
// Two transports implement these channels (see ChannelWriter / ChannelReader):
//   - "transferable": one ArrayBuffer posted per flush with an ownership
//     transfer (zero-copy). No special hosting headers required.
//   - "shared": a SharedArrayBuffer written by the worker and read by the main
//     thread in its rAF loop, synchronized with Atomics. Requires COOP/COEP
//     cross-origin isolation (self.crossOriginIsolated === true).

// ---------------------------------------------------------------------------
// Message types (transferable transport, and the one-time registry handshake)
// ---------------------------------------------------------------------------
export const RT_MSG = {
  CHANNELS: "rt_channels", // one-time: registries (+ SAB handles in shared mode)
  CHART: "rt_chart", // transferable: a batch of chart rows
  ANIM: "rt_anim", // transferable: a single latest anim frame
};

export const RT_TRANSPORT = {
  SHARED: "shared",
  TRANSFERABLE: "transferable",
};

// ---------------------------------------------------------------------------
// Shared-memory control headers (Int32Array). One small control array per
// channel sits alongside the data array in shared mode. Indices into it:
// ---------------------------------------------------------------------------

// CHART control: a single-producer / single-consumer ring write cursor.
// WRITE_IDX is the total number of rows ever written (monotonic; the physical
// slot is WRITE_IDX % capacity). READ_HINT lets the writer detect a stalled
// reader. VERSION must match the registry the rows were written under.
export const CHART_CTRL = {
  WRITE_IDX: 0,
  READ_HINT: 1,
  VERSION: 2,
  CAPACITY: 3, // number of rows the data ring holds
  STRIDE: 4, // floats per row (col 0 = time, then signals)
  LEN: 5, // length of the control Int32Array
};

// ANIM control: a seqlock over two physical frames (flip buffer). The writer
// fills the inactive frame, flips ACTIVE, then bumps SEQ. The reader copies the
// ACTIVE frame and retries if SEQ changed mid-copy (torn-read protection).
export const ANIM_CTRL = {
  ACTIVE: 0, // 0 or 1 — which frame slot currently holds the newest data
  SEQ: 1, // bumped on every publish; odd while a write is in progress
  VERSION: 2,
  STRIDE: 3, // floats per frame (slot 0 = time, then component values)
  LEN: 4,
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// Chart ring capacity in rows. Sized for a comfortable scrolling window even if
// the main thread briefly stalls: ~10 s window at the 0.005 s fast sample rate
// is 2000 rows; ×4 safety headroom.
export const CHART_RING_ROWS = 8192;

// Column 0 of every chart row is the model time (Float64, seconds).
export const CHART_TIME_COL = 0;

// Anim frames are laid out as [time, (mag, tint) * componentCount]. Slot 0 is
// the frame's model time; thereafter two floats per animated component.
export const ANIM_TIME_SLOT = 0;
export const ANIM_FLOATS_PER_COMPONENT = 2; // [magnitude, tintSource]

/**
 * Stride (floats per frame) for an anim snapshot with `componentCount` animated
 * components: 1 time slot + 2 floats each.
 */
export function animStride(componentCount) {
  return ANIM_TIME_SLOT + 1 + componentCount * ANIM_FLOATS_PER_COMPONENT;
}

/** Buffer offset of a component's magnitude value within an anim frame. */
export function animMagOffset(componentIndex) {
  return 1 + componentIndex * ANIM_FLOATS_PER_COMPONENT;
}

/** Buffer offset of a component's tint-source value within an anim frame. */
export function animTintOffset(componentIndex) {
  return 1 + componentIndex * ANIM_FLOATS_PER_COMPONENT + 1;
}

/** True if SharedArrayBuffer + cross-origin isolation are available. */
export function sharedMemoryAvailable() {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof globalThis !== "undefined" &&
    globalThis.crossOriginIsolated === true
  );
}
