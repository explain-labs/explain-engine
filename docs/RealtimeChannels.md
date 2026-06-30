# RealtimeChannels

`RealtimeChannels.js` is the **shared layout/contract** for the realtime data plane that carries per-frame floats from the `ModelEngine` worker to the main-thread render layer (uPlot charts + the PixiJS sprite diagram). It is pure infrastructure: the module exports **only constants and tiny pure helpers**, no worker- or DOM-specific code, so it can be imported by both the writer side ([ChannelWriter](./ChannelWriter.md)) and the reader side (`ChannelReader`, main thread) without dragging either environment's dependencies across. Think of it as the single source of truth both ends agree on for buffer offsets, control-header indices, message names, and transport selection.

## Role in the engine

This module defines the wire format; it does not move any data itself. It sits underneath the realtime fast path:

- [ChannelWriter](./ChannelWriter.md) (worker) allocates buffers laid out per these constants and writes samples.
- [AnimationPacker](./AnimationPacker.md) (worker) uses the `anim*` helpers to compute its frame stride and slot offsets.
- The main-thread `ChannelReader` attaches to the same buffers using the same constants to drain them in its `requestAnimationFrame` loop.

See [ARCHITECTURE](./ARCHITECTURE.md) for the full worker → main realtime pipeline.

It models **two independent channels with different drop semantics**:

- **CHART** — a ring of fixed-stride rows. The consumer must read **every** row in order (no dropped samples); it drains the span `[lastRead, writeIdx)`.
- **ANIM** — a single "latest frame wins" snapshot. The consumer only ever wants the newest frame; older frames are discarded.

And **two transports** that implement those channels:

- `"transferable"` — one `ArrayBuffer` posted per flush with an ownership transfer (zero-copy). No special hosting headers required.
- `"shared"` — a `SharedArrayBuffer` written by the worker and read by the main thread in its rAF loop, synchronized with `Atomics`. Requires COOP/COEP cross-origin isolation (`self.crossOriginIsolated === true`).

## Key state

This module is constants-only. Each export:

### Message types — `RT_MSG`

Used as the `type` field of worker → main messages (transferable transport + the one-time registry handshake).

| Constant | Value | Meaning |
|---|---|---|
| `RT_MSG.CHANNELS` | `"rt_channels"` | One-time handshake: registries (+ SAB handles in shared mode) |
| `RT_MSG.CHART` | `"rt_chart"` | Transferable: a batch of chart rows |
| `RT_MSG.ANIM` | `"rt_anim"` | Transferable: a single latest anim frame |

### Transport — `RT_TRANSPORT`

| Constant | Value |
|---|---|
| `RT_TRANSPORT.SHARED` | `"shared"` |
| `RT_TRANSPORT.TRANSFERABLE` | `"transferable"` |

### Chart control header — `CHART_CTRL`

Indices into the small `Int32Array` control array that sits alongside the chart data ring in shared mode. The chart ring is a **single-producer / single-consumer** ring cursor.

| Index | Value | Meaning |
|---|---|---|
| `CHART_CTRL.WRITE_IDX` | `0` | Total rows ever written (monotonic). Physical slot = `WRITE_IDX % capacity` |
| `CHART_CTRL.READ_HINT` | `1` | Lets the writer detect a stalled reader |
| `CHART_CTRL.VERSION` | `2` | Must match the registry the rows were written under |
| `CHART_CTRL.CAPACITY` | `3` | Number of rows the data ring holds |
| `CHART_CTRL.STRIDE` | `4` | Floats per row (col 0 = time, then signals) |
| `CHART_CTRL.LEN` | `5` | Length of the control `Int32Array` |

### Anim control header — `ANIM_CTRL`

Indices into the anim control array. The anim channel is a **seqlock over two physical frames** (a flip buffer): the writer fills the inactive frame, flips `ACTIVE`, then bumps `SEQ`; the reader copies the `ACTIVE` frame and retries if `SEQ` changed mid-copy (torn-read protection).

| Index | Value | Meaning |
|---|---|---|
| `ANIM_CTRL.ACTIVE` | `0` | `0` or `1` — which frame slot holds the newest data |
| `ANIM_CTRL.SEQ` | `1` | Bumped on every publish; odd while a write is in progress |
| `ANIM_CTRL.VERSION` | `2` | Registry version |
| `ANIM_CTRL.STRIDE` | `3` | Floats per frame (slot 0 = time, then component values) |
| `ANIM_CTRL.LEN` | `4` | Length of the control `Int32Array` |

### Defaults & layout constants

| Constant | Value | Meaning |
|---|---|---|
| `CHART_RING_ROWS` | `8192` | Chart ring capacity in rows. Sized for ~10 s window at the 0.005 s fast sample rate (≈2000 rows) × ~4 safety headroom |
| `CHART_TIME_COL` | `0` | Column 0 of every chart row is model time (Float64, seconds) |
| `ANIM_TIME_SLOT` | `0` | Slot 0 of every anim frame is model time |
| `ANIM_FLOATS_PER_COMPONENT` | `2` | Two floats per animated component: `[magnitude, tintSource]` |

## Key methods

All are pure helpers used to compute anim-frame geometry consistently on both sides.

| Signature | Behavior |
|---|---|
| `animStride(componentCount)` | Floats per anim frame: `ANIM_TIME_SLOT + 1 + componentCount * ANIM_FLOATS_PER_COMPONENT`. So `1 + 2*count`. |
| `animMagOffset(componentIndex)` | Float offset of a component's **magnitude** within a frame: `1 + componentIndex * 2`. |
| `animTintOffset(componentIndex)` | Float offset of a component's **tint-source** value: `1 + componentIndex * 2 + 1`. |
| `sharedMemoryAvailable()` | `true` iff `SharedArrayBuffer` is defined **and** `globalThis.crossOriginIsolated === true`. Drives default transport selection in [ChannelWriter](./ChannelWriter.md). |

## Protocol / layout

**Chart row layout** (Float64): `[time, signal_0, signal_1, …]` — column 0 is model time (`CHART_TIME_COL`), then one float per watched signal in registry order. Stride = `1 + signalCount`.

**Anim frame layout** (Float32): `[time, mag_0, tint_0, mag_1, tint_1, …]` — slot 0 is model time (`ANIM_TIME_SLOT`), then `(magnitude, tintSource)` pairs per animated component. Stride = `animStride(count)`.

**Shared-mode buffers:** each channel pairs a control `Int32Array` (`CHART_CTRL.LEN` / `ANIM_CTRL.LEN` entries) with a data typed array (`Float64Array` ring for chart, two-frame `Float32Array` for anim). The control array's `VERSION` / `STRIDE` / `CAPACITY` fields let the reader validate it is attached to a buffer that still matches the current registry.

**Handshake:** `RT_MSG.CHANNELS` is posted once per (re)allocation and carries the transport descriptor, the chart registry (`version` + `slots`), and the anim registry. In shared mode it additionally carries the `SharedArrayBuffer` handles (structured clone shares, not copies, SABs across the worker boundary). After the handshake, shared mode needs **no per-tick messages**; transferable mode posts `RT_MSG.CHART` / `RT_MSG.ANIM` on each flush.

## Notes / caveats

- **Transport is selected, not negotiated.** `sharedMemoryAvailable()` decides the default at writer construction. If the page is not cross-origin isolated, the entire data plane silently falls back to `"transferable"` and still works — just with one buffer posted per tick instead of zero.
- **Version gating.** Every control header carries a `VERSION`. A reader holding an old registry must ignore rows/frames whose version does not match; this is how a live watchlist or diagram change (which reallocates buffers and bumps the version) avoids mis-decoding stale data.
- This module has **no runtime behavior to break** — changing a constant here silently changes the contract for both [ChannelWriter](./ChannelWriter.md) and the reader. Keep the two ends in lockstep.
