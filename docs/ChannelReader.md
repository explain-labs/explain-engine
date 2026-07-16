# ChannelReader

`ChannelReader.js` is the **main-thread consumer** of the realtime data plane — the exact mirror of the worker-side [ChannelWriter](./ChannelWriter.md). It is configured once from the worker's `rt_channels` handshake, then read every animation frame by the [RealtimeBus](./RealtimeBus.md): `drainChart()` returns every chart row written since the last drain (in order, no dropped samples), and `readAnim()` returns only the newest anim frame (older frames discarded). It hides the transport choice (`"shared"` vs `"transferable"`) behind one interface, exactly as the writer does. See [RealtimeChannels](./RealtimeChannels.md) for the buffer-layout contract the two ends share, and [ARCHITECTURE](./ARCHITECTURE.md) for the full pipeline.

## Role in the engine

`ChannelReader` is infrastructure, not a physiological model. It is instantiated **only by [RealtimeBus](./RealtimeBus.md)** (`this.reader = new ChannelReader()` in its constructor) and is driven entirely by the bus:

- the bus calls `configure(payload)` on the `RT_MSG.CHANNELS` handshake,
- in transferable mode the bus feeds it `RT_MSG.CHART` / `RT_MSG.ANIM` messages via `onMessage(msg)`,
- the bus's rAF `_tick()` calls `drainChart()` and `readAnim()`.

It has no dependency on Vue, the DOM, or `Model` — it only imports the shared constants from [RealtimeChannels](./RealtimeChannels.md).

## Transports

The active transport is taken from the descriptor at `configure` time (`this.transport = descriptor.transport`):

- **`RT_TRANSPORT.SHARED`** (`"shared"`) — the reader attaches typed-array views over the worker's `SharedArrayBuffer`s and reads them with `Atomics`. The chart ring uses a single-producer/single-consumer write cursor; the anim snapshot uses a seqlock. No per-tick messages are involved — the reader pulls directly from shared memory in the rAF loop.
- **`RT_TRANSPORT.TRANSFERABLE`** (`"transferable"`) — the worker posts one `ArrayBuffer` per flush; the bus hands those messages to `onMessage`, which queues chart rows and coalesces the latest anim frame. The fallback when `SharedArrayBuffer` / cross-origin isolation is unavailable.

## `configure(payload)`

Called on every `RT_MSG.CHANNELS` handshake. Payload shape:

```js
{
  descriptor,                              // ChannelWriter.descriptor() output
  chart: { version, slots },
  anim:  { version, components, layout }   // omitted if no anim channel
}
```

It records `transport` from `descriptor.transport`, then:

- **Chart registry:** `chartVersion = chart.version`, `chartSlots = chart.slots`, `chartStride = descriptor.chart?.stride ?? chartSlots.length`.
- **Anim registry** (only if `payload.anim` present): `animVersion`, `animComponents`, `animLayout`, and `animStride = descriptor.anim?.stride ?? layout?.stride ?? 0`.
- **Drops stale in-flight data:** resets `_chartQueue = []` and `_animPending = null`, so data buffered under a previous layout/version is discarded on reconfigure.
- In **shared** mode calls `_attachShared(descriptor)`.
- If `animStride > 0`, allocates `_animScratch = new Float32Array(animStride)` (the reusable torn-read copy buffer).

`_attachShared(d)` first **nulls any previously attached views** (a reconfigure may drop a channel), then:

- **Chart** (if `d.chart.ctrl` and `d.chart.ring`): wraps `_chartCtrl = new Int32Array(d.chart.ctrl)`, `_chartRing = new Float64Array(d.chart.ring)`, `_chartCapacity = d.chart.capacity`, and seeds `_chartLastRead = Atomics.load(_chartCtrl, CHART_CTRL.WRITE_IDX)` — reading **begins from "now"**, so pre-attach history is not replayed.
- **Anim** (if `d.anim.ctrl` and `d.anim.frames`): wraps `_animCtrl = new Int32Array(d.anim.ctrl)`, `_animFrames = new Float32Array(d.anim.frames)`, and resets `_animLastSeq = -1`.

## Reading: `drainChart()` vs `readAnim()`

The two channels have opposite drop semantics, matching the writer.

### `drainChart()` — no dropped samples

Returns every chart row appended since the last drain, in order, or `null` if nothing is new. Return shape:

```js
{ version, stride, slots, count, rows /* Float64Array, count*stride values */ }
```

It clears `lastChartGap` at entry, then dispatches by transport:

- **Shared (`_drainChartShared`):** loads `w = WRITE_IDX`; returns `null` if `w === _chartLastRead`. Otherwise `count = w - _chartLastRead`. **If `count > capacity` the reader stalled and the writer lapped it** — it keeps only the freshest `capacity` rows (`from = w - cap`) and sets `lastChartGap = true` as an overrun diagnostic. Rows are copied out of the ring with wrap (`(from + k) % cap`), `_chartLastRead` advances to `w`, and `READ_HINT` is published via `Atomics.store(ctrl, CHART_CTRL.READ_HINT, w)` so the writer can detect a stalled reader.
- **Transferable (`_drainChartTransferable`):** returns `null` if `_chartQueue` is empty; otherwise concatenates all queued batches into one `Float64Array` (`count` = sum of batch counts), clears the queue, and returns it.

### `readAnim()` — latest frame wins

Returns only the newest anim frame, or `null` if unchanged since the last read. Returns `null` immediately if `animStride === 0`. Return shape:

```js
{ version, stride, components, layout, frame /* Float32Array */ }
```

- **Shared (`_readAnimShared`):** a **seqlock torn-read retry** — it loops reading `SEQ`, then `ACTIVE`, copies the active frame (`active * stride`) into `_animScratch`, and repeats while `SEQ` changed mid-copy. Once a clean copy is obtained, returns `null` if `seq === _animLastSeq` (nothing new); otherwise updates `_animLastSeq` and returns the frame backed by `_animScratch`.
- **Transferable (`_readAnimTransferable`):** returns `null` if `_animPending` is null; otherwise returns the pending frame and clears `_animPending`.

In shared mode the returned `frame` is the reusable `_animScratch` buffer — consumers that retain values across frames must copy.

## `onMessage(msg)`

Handles the transferable transport only — **it is a no-op unless `transport === RT_TRANSPORT.TRANSFERABLE`**.

- **`"rt_chart"`:** **drops the message if `msg.version !== chartVersion`** (stale layout), else pushes `{ version, stride, count, data: new Float64Array(msg.buffer) }` onto `_chartQueue` (drained later by `_drainChartTransferable`).
- **`"rt_anim"`:** drops on version mismatch, else **coalesces** — stores `_animPending = { version, frame: new Float32Array(msg.buffer) }`, overwriting any previous pending frame so only the newest survives.

## Shared constants

The reader uses the control-header indices from [RealtimeChannels](./RealtimeChannels.md):

- **`CHART_CTRL`** — `WRITE_IDX` (0): monotonic total rows written (read via `Atomics.load` in `_drainChartShared`); `READ_HINT` (1): written back via `Atomics.store` so the writer can spot a stalled reader. (`VERSION` (2), `CAPACITY` (3), `STRIDE` (4) are written by the writer and carried in the descriptor; the reader takes capacity/stride from the descriptor rather than the header.)
- **`ANIM_CTRL`** — `ACTIVE` (0): which of the two flip-buffer frames holds the newest data; `SEQ` (1): bumped on every publish (odd while a write is in progress) — the basis of the torn-read retry in `_readAnimShared`. (`VERSION` (2), `STRIDE` (3) likewise come from the descriptor.)
- `RT_TRANSPORT.SHARED` / `.TRANSFERABLE` select the read path.

## Notes / caveats

- **Symmetry with the writer.** Every `ChannelReader` path has a [ChannelWriter](./ChannelWriter.md) counterpart: `appendChartRow` ↔ `drainChart`, `writeAnimFrame` ↔ `readAnim`, `flush` ↔ `onMessage`, `descriptor()` ↔ `configure`. The synchronization invariant (writer publishes the cursor/`SEQ` last; reader reads it first) is what makes the lock-free shared paths safe.
- **Begins at "now".** On shared attach, `_chartLastRead` is seeded to the current `WRITE_IDX`, so rows written before the reader attached are intentionally not replayed.
- **Overrun is silent but flagged.** If the main thread stalls long enough for the writer to lap the ring, `drainChart` keeps only the freshest `capacity` rows and sets `lastChartGap = true` for that drain — a gap diagnostic, not an error.
- **Version gating.** Both `onMessage` (transferable) and the registry stored at `configure` reject data from a stale layout. After a reconfigure, queued/pending in-flight data is dropped and shared views are re-attached fresh.
- **Reused scratch buffer.** In shared mode `readAnim` returns `_animScratch`, which is overwritten on the next read; copy out anything you need to keep.
