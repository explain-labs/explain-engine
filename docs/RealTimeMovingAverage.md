# RealTimeMovingAverage

`RealTimeMovingAverage.js` is a small (~54-line) utility that computes a **rolling fixed-window average** over a stream of scalar samples in O(1) per update. It is generic engine infrastructure, not a physiological model. It is used by `device_models/Ecls.js` to smooth noisy realtime ECLS signals (one instance each for flow, venous pressure, internal pressure, and arterial pressure) before they are exposed as `flow_avg` / `p_ven` / `p_int` / `p_art`. Unlike the chart/anim data plane ([ChannelWriter](./ChannelWriter.md), [RealtimeChannels](./RealtimeChannels.md), [AnimationPacker](./AnimationPacker.md)), it crosses no thread boundary — it is just a numeric helper. See [ARCHITECTURE](./ARCHITECTURE.md) for the broader engine layout.

## Role in the engine

A model that produces a noisy per-step signal (e.g. ECLS pump flow) creates one `RealTimeMovingAverage` per signal in `init_model`, calls `addValue(raw)` each step, and assigns the returned smoothed value to the displayed property. When a configurable window changes at runtime, the model replaces the instance with a new one sized to the new window; on disable/reset it calls `reset()`.

## Key state

Constructor: `new RealTimeMovingAverage(windowSize)`

- `windowSize` — clamped to `Math.max(1, Math.trunc(windowSize))` (always a positive integer).

| Field | Description |
|---|---|
| `windowSize` | Number of samples retained in the window |
| `values` | Backing ring array of length `windowSize` |
| `count` | Samples seen so far, capped at `windowSize` |
| `writeIndex` | Next slot to overwrite (wraps modulo `windowSize`) |
| `sum` | Running sum of the windowed values |
| `currentAverage` | Most recently computed average |

## Key methods

### `addValue(newValue) → number`

Adds a sample and returns the updated average.

- **Warm-up** (`count < windowSize`): stores the value, adds it to `sum`, increments `count`.
- **Steady state**: subtracts the value being evicted at `writeIndex`, stores the new value there, and adjusts `sum` by `newValue - oldestValue`.
- Advances `writeIndex = (writeIndex + 1) % windowSize`, recomputes `currentAverage = sum / count`, and returns it.

The average divides by `count` (not `windowSize`), so during warm-up it is the true mean of the samples seen so far rather than being diluted by empty slots.

### `getCurrentAverage() → number`

Returns `currentAverage` without adding a sample.

### `reset()`

Re-initializes the buffer (`values`, `count`, `writeIndex`, `sum`, `currentAverage` all cleared) while keeping `windowSize`.

## Notes / caveats

- **Changing the window means a new instance.** There is no resize method; callers compare `windowSize` and construct a fresh `RealTimeMovingAverage` when it changes (as `Ecls` does).
- **O(1) update via incremental sum.** Float rounding can accumulate over very long runs since `sum` is maintained additively rather than recomputed; for the signal magnitudes and window sizes used here this is negligible.
- **Self-contained.** No imports, no SharedArrayBuffer, no worker messaging — purely a numeric helper that can be used anywhere in the engine.
