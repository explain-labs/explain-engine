# RealtimeBus

`RealtimeBus.js` is the **main-thread consumer** of the realtime data plane. It runs a single `requestAnimationFrame` loop that drains a [ChannelReader](./ChannelReader.md) — every new chart row plus the newest anim frame — and pushes them to registered renderer adapters (uPlot charts, the PixiJS diagram). It is deliberately framework-agnostic: it holds all state in ordinary fields and is **never placed inside Vue reactivity**, so 60 Hz telemetry can never trigger a re-render. It is the mirror of the worker-side [ChannelWriter](./ChannelWriter.md), and is separate from the control plane (status/state/`model_ready`/errors) that lives on `Model.js` + `ModelEmitter`. See [RealtimeChannels](./RealtimeChannels.md) for the buffer contract and [ARCHITECTURE](./ARCHITECTURE.md) for the full pipeline.

## Role in the engine

The worker emits two kinds of traffic on its single `postMessage` channel: the **control plane** (`state`, `data`, `model_ready`, `status`, `error`, …) and the **realtime data plane** (`RT_MSG.*`). Two listeners are attached to the same worker, and each ignores what it does not own:

- **`Model.onmessage` / `Model.receive()`** handles the control plane and ignores `RT_MSG.*`.
- **`RealtimeBus`** attaches its own `worker.addEventListener("message", …)` and handles **only** `RT_MSG.*` (see `_handleMessage`); it does not touch `Model.receive()`.

This keeps the data plane self-contained — per-frame telemetry flows worker → bus → adapter without passing through `Model`/`ModelEmitter` or any reactive store. The framework owns the *shell* (which signals to watch, layout, start/stop) and talks to the bus through its imperative API.

## Construction

```js
new RealtimeBus(workerOrModel)
```

`workerOrModel` may be either a `Model` instance (the bus reads `workerOrModel.modelEngine`) or a raw `Worker`. The constructor:

- resolves `this.worker = workerOrModel?.modelEngine || workerOrModel`,
- creates its own `this.reader = new ChannelReader()`,
- attaches `_onMessage` (a bound `_handleMessage`) as a `"message"` listener on the worker.

| Field | Description |
|---|---|
| `worker` | The resolved `Worker` the bus listens to |
| `reader` | The owned `ChannelReader` instance |
| `renderers` | Array of registered renderer adapters |
| `_running` | Whether the rAF loop is active |
| `_rafId` | Handle from `requestAnimationFrame`, or `null` |
| `_lastRegistry` | The most recent `RT_MSG.CHANNELS` payload, replayed to late-added renderers |
| `_onMessage` | The bound message listener (kept so `dispose()` can detach it) |

## Renderer-adapter contract

A renderer adapter is any object with these two callbacks (both optional in the sense that the bus null-checks each before calling):

```js
onRegistry(payload)        // optional: called when channels (re)configure
onFrame(chart, anim)       // called each rAF tick with the latest data
```

- **`onRegistry(payload)`** — receives the raw `RT_MSG.CHANNELS` payload (the same object passed to `reader.configure`). Called once when the registry arrives, and **replayed** to any renderer added afterward (`addRenderer` invokes it immediately if `_lastRegistry` is set), so adapters that register late still see the layout.
- **`onFrame(chart, anim)`** — called once per tick that produced new data. Either argument may be `null`.

`chart` is `null` or:

```js
{ version, stride, slots, count, rows /* Float64Array, count*stride values */ }
```

`anim` is `null` or:

```js
{ version, stride, components, layout, frame /* Float32Array, one frame */ }
```

These are exactly the return shapes of `ChannelReader.drainChart()` and `ChannelReader.readAnim()`.

## API

| Method | Behavior |
|---|---|
| `addRenderer(renderer)` | Pushes the adapter onto `renderers`; if `_lastRegistry` is set and the adapter has `onRegistry`, replays it immediately. Returns the renderer. |
| `removeRenderer(renderer)` | Removes the adapter from `renderers` (no-op if not present). |
| `start()` | Starts the rAF loop. Idempotent — returns immediately if already running. |
| `stop()` | Stops the loop and cancels the pending frame. Safe to call when not running. |
| `dispose()` | Calls `stop()`, detaches the worker message listener, and clears `renderers`. |

## Message handling

`_handleMessage(e)` reads `e.data`, ignores anything without a `type`, then switches:

- **`RT_MSG.CHANNELS`** (`"rt_channels"`) — the one-time registry handshake. Calls `reader.configure(payload)`, stores `_lastRegistry = payload`, then calls `onRegistry(payload)` on every renderer that has one. **Each `onRegistry` call is wrapped in `try/catch`** so one bad adapter cannot block the others (errors are logged via `console.error`).
- **`RT_MSG.CHART`** (`"rt_chart"`) or **`RT_MSG.ANIM`** (`"rt_anim"`) — transferable-transport data messages. Forwarded verbatim to `reader.onMessage(d)`. (In shared-memory mode these messages are never sent; the reader pulls directly from the SABs.)

All other message types are ignored — they belong to the control plane.

## The rAF drain loop

`start()` schedules a `loop` closure on `requestAnimationFrame`. Each iteration:

1. bails if `_running` went false,
2. calls `_tick()` inside `try/catch` — **a tick error is logged but never kills the loop**,
3. always reschedules itself via `requestAnimationFrame(loop)` and stores the handle in `_rafId`.

`_tick()` does the actual draining:

```js
const chart = this.reader.drainChart(); // every new row, in order, or null
const anim  = this.reader.readAnim();   // newest frame only, or null
if (chart == null && anim == null) return;   // nothing this frame
for (const r of this.renderers) {
  if (!r.onFrame) continue;
  try { r.onFrame(chart, anim); }
  catch (err) { console.error("RealtimeBus: renderer onFrame failed", err); }
}
```

So **chart never drops samples** (drained in order with ring-wrap handling) while **anim is latest-frame-wins**. Each renderer's `onFrame` is guarded individually so one throwing adapter cannot starve the rest. `stop()` flips `_running` and calls `cancelAnimationFrame(_rafId)`.

## Notes / caveats

- **Who instantiates it.** `src/composables/useRealtimeBus.ts` constructs a **singleton** `RealtimeBus(model)` and gates the loop on engine streaming: `model.on("rt_start", () => bus.start())` and `model.on("rt_stop", () => bus.stop())`. The loop therefore runs only while the engine is actively streaming. `disposeRealtimeBus()` calls `bus.dispose()` and clears the singleton.
- **Not reactive by design.** Adapters receive typed arrays directly. Do not stash `chart.rows` / `anim.frame` into Vue refs or React state — that defeats the entire reason this bus exists outside the reactive system.
- **Two listeners, one worker.** Both `Model` and the bus receive every worker message. The split is purely by `type`; do not route `RT_MSG.*` through `Model.receive()` or control-plane events through the bus.
- **Late-registered renderers are safe.** Because `_lastRegistry` is replayed on `addRenderer`, an adapter mounted after the handshake still gets its `onRegistry` before any `onFrame`.
- **`frame` is reused in shared mode.** The `anim.frame` typed array handed to `onFrame` may be the reader's reusable scratch buffer (see [ChannelReader](./ChannelReader.md)); adapters that need to retain values across frames must copy them.
