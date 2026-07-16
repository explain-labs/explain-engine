# ChannelWriter

`ChannelWriter.js` is the **worker-side producer** of the realtime data plane. It writes chart rows and anim frames into the buffers defined by [RealtimeChannels](./RealtimeChannels.md), hiding the choice of transport (`"shared"` vs `"transferable"`) behind one interface so callers never branch on it. It is infrastructure, not a physiological model. It is instantiated once in `ModelEngine.build()` (and reused across `update_diagram`), and the matching consumer — `ChannelReader` — lives on the main thread. See [RealtimeChannels](./RealtimeChannels.md) for the buffer layout contract the two ends share, and [ARCHITECTURE](./ARCHITECTURE.md) for the full pipeline.

## Role in the engine

`ChannelWriter` is the single sink for the realtime fast path:

- The `DataCollector` calls `acquireChartRing()` (via `set_channels`) when the watchlist/layout changes, then `appendChartRow()` for each sample collected during `collect_data()`.
- [AnimationPacker](./AnimationPacker.md) calls `writeAnimFrame()` once per realtime tick (through its `pack_and_write`).
- `ModelEngine._model_step_rt()` calls `flush()` at the end of each tick (a no-op in shared mode).
- `ModelEngine._post_rt_channels()` calls `descriptor()` to build the one-time `RT_MSG.CHANNELS` handshake.

Transport is chosen **once at construction**:

- `"shared"` — `SharedArrayBuffer` + `Atomics` (default when cross-origin isolated). Worker writes, main thread reads in its rAF loop; **no per-tick `postMessage`**.
- `"transferable"` — one `ArrayBuffer` transferred per `flush()` (zero-copy). The fallback when `SharedArrayBuffer` is unavailable.

## Key state

Constructor: `new ChannelWriter(post, opts = {})`

- `post` — the worker's `postMessage` shim, `(msg, transferList?) => void`.
- `opts.transport` — force `"shared"` | `"transferable"`. Defaults to `"shared"` when `sharedMemoryAvailable()`, else `"transferable"`.

| Field | Mode | Description |
|---|---|---|
| `transport` | both | `RT_TRANSPORT.SHARED` or `.TRANSFERABLE`, fixed at construction |
| `_chartStride` | both | Floats per chart row (col 0 = time, then signals) |
| `_chartVersion` | both | Registry version the current chart rows belong to |
| `_chartCapacity` | both | Ring capacity in rows (default `CHART_RING_ROWS` = 8192) |
| `_chartCtrl` | shared | `Int32Array` chart control header (`CHART_CTRL` layout) |
| `_chartRing` | shared | `Float64Array` ring, `capacity * stride` floats |
| `_chartBatch` | transferable | `Float64Array` scratch the tick's rows are appended into |
| `_chartBatchRows` | transferable | Rows pending in the batch |
| `_chartBatchCap` | transferable | Batch capacity in rows (starts at 1024, grows ×2 if full) |
| `_animStride` | both | Floats per anim frame |
| `_animVersion` | both | Anim registry version |
| `_animCtrl` | shared | `Int32Array` anim control header (`ANIM_CTRL` layout) |
| `_animFrames` | shared | `Float32Array` of length `2 * stride` — two flip-buffer frames |
| `_animPending` | transferable | Latest `Float32Array` frame, coalesced until `flush()` |

## Key methods

### `acquireChartRing(stride, version, capacityRows = CHART_RING_ROWS)`

(Re)allocates the chart ring for a new column layout. Called at build and whenever the watchlist changes the number of signals.

- **Shared mode:** allocates a fresh `Int32Array` control header (over a SAB) with `WRITE_IDX`/`READ_HINT` zeroed and `VERSION`/`CAPACITY`/`STRIDE` set, plus a `Float64Array` ring (over a SAB) sized `capacityRows * stride`.
- **Transferable mode:** allocates a `Float64Array` batch of `1024 * stride` floats and resets the pending row count.

### `appendChartRow(values)`

Appends one chart row; `values.length` must equal `stride` (col 0 = time). No-op if `stride === 0`.

- **Shared mode:** reads `WRITE_IDX` with `Atomics.load`, writes the row into slot `(w % capacity) * stride`, then **publishes the new row last** via `Atomics.store(WRITE_IDX, w + 1)` — data is in place before the cursor advances.
- **Transferable mode:** copies the row into the batch at `batchRows * stride` and increments. If the batch is full within one tick (very unlikely), it grows the buffer once (×2) before writing.

### `acquireAnimSnapshot(stride, version)`

(Re)allocates the anim snapshot for a scenario's component layout (`stride` floats per frame, slot 0 = time).

- **Shared mode:** allocates an `Int32Array` control header with `ACTIVE`/`SEQ` zeroed and `VERSION`/`STRIDE` set, plus a `Float32Array` holding two physical frames back-to-back (`2 * stride`).
- **Transferable mode:** clears `_animPending`.

### `writeAnimFrame(values)`

Publishes the latest anim frame; `values.length` must equal anim stride. No-op if `stride === 0`.

- **Shared mode (seqlock):** loads `ACTIVE`, writes into the **inactive** frame (`next = active ^ 1`) at `next * stride`, then `Atomics.store(ACTIVE, next)` to flip, then `Atomics.add(SEQ, 1)` to signal a new publish. The reader uses `SEQ` to detect torn reads.
- **Transferable mode:** coalesces — allocates a fresh frame copy and stores it as `_animPending`; only the most recent frame survives until `flush()`.

### `flush()`

No-op unless transport is `"transferable"`. Otherwise:

- If chart rows are pending, copies exactly the used rows into a fresh `Float64Array` and posts `{ type: RT_MSG.CHART, version, stride, count, buffer }` transferring `buffer`; resets the pending count.
- If an anim frame is pending, posts `{ type: RT_MSG.ANIM, version, stride, buffer }` transferring its buffer; clears `_animPending`.

### `descriptor()`

Returns the transport descriptor merged by `ModelEngine` into the `RT_MSG.CHANNELS` handshake. Always carries `transport` plus `chart`/`anim` `{ stride, version }`. In shared mode it additionally exposes the underlying `SharedArrayBuffer`s (`chart.ctrl`, `chart.ring`, `chart.capacity`, `anim.ctrl`, `anim.frames`) for the reader to attach to — structured clone shares (does not copy) SABs across the worker boundary.

## Protocol / layout

The ring-buffer indices and frame layout are owned by [RealtimeChannels](./RealtimeChannels.md). In brief:

- **Chart ring** is single-producer/single-consumer with a monotonic `WRITE_IDX`; the physical slot is `WRITE_IDX % capacity`. Writing data **before** advancing the cursor (and the reader reading the cursor before the data) is the synchronization invariant.
- **Anim frames** use a seqlock: write inactive frame → flip `ACTIVE` → bump `SEQ`. Odd `SEQ` means a write is in progress; the reader retries if `SEQ` changes mid-copy.
- Both control headers carry a `VERSION` so a reader holding a stale registry rejects mismatched data after a layout change.

## Notes / caveats

- **One transport for the writer's lifetime.** It is decided at construction by `sharedMemoryAvailable()` (or `opts.transport`) and never switches. Reallocations (`acquireChartRing`/`acquireAnimSnapshot`) keep the same transport.
- **`flush()` is shared-mode-free.** In shared mode the reader pulls directly from the SABs in its rAF loop, so `flush()` returns immediately and no per-tick messages are sent. Calling it every tick (as `ModelEngine` does) is correct and cheap.
- **SharedArrayBuffer fallback.** When the page is not cross-origin isolated (no COOP/COEP), `SharedArrayBuffer` is unavailable and the writer transparently uses `"transferable"`: a copied-and-transferred `ArrayBuffer` per flush. Functionally identical to the consumer; only the per-tick cost differs.
- **Publish ordering matters.** In shared mode, `appendChartRow` stores the row data before bumping `WRITE_IDX`, and `writeAnimFrame` flips `ACTIVE`/`SEQ` after the frame is written. Reordering these would expose torn reads to the main thread.
