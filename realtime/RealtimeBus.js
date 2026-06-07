// RealtimeBus.js  (main thread)
//
// Owns the realtime DATA PLANE on the main thread: a single requestAnimationFrame
// loop that drains the chart ring and the latest anim frame from the
// ChannelReader and pushes them to registered renderer adapters (uPlot,
// PixiJS, ...).
//
// This module is deliberately plain — it holds its state in ordinary fields,
// NOT in any framework's reactive system. Per-frame telemetry must never flow
// through Vue refs / React state / Svelte stores; doing so would diff/re-render
// 60×/second. Frameworks own the *shell* (which signals to watch, start/stop,
// layout) and talk to this bus through its imperative API. The control plane
// (status/state/model_ready/errors) stays on Model.js + ModelEmitter.
//
// A renderer adapter is any object with:
//   onRegistry(payload)         // optional: called when channels (re)configure
//   onFrame(chart, anim)        // called each rAF tick with the latest data
// where `chart` is null | {version, stride, slots, count, rows:Float64Array}
// and `anim` is null | {version, stride, components, layout, frame:Float32Array}.

import { RT_MSG } from "../helpers/RealtimeChannels.js";
import ChannelReader from "./ChannelReader.js";

export default class RealtimeBus {
  /**
   * @param {Worker|Object} workerOrModel  the ModelEngine Worker, or a Model
   *   instance exposing `.modelEngine`.
   */
  constructor(workerOrModel) {
    this.worker = workerOrModel?.modelEngine || workerOrModel;
    this.reader = new ChannelReader();
    this.renderers = [];
    this._running = false;
    this._rafId = null;
    this._lastRegistry = null;

    // The bus listens alongside Model's own onmessage handler (both receive
    // every message; each ignores what it doesn't handle). This keeps the data
    // plane self-contained without touching Model.receive().
    this._onMessage = (e) => this._handleMessage(e);
    this.worker.addEventListener("message", this._onMessage);
  }

  /** Register a renderer adapter; replays the current registry if present. */
  addRenderer(renderer) {
    this.renderers.push(renderer);
    if (this._lastRegistry && renderer.onRegistry) {
      renderer.onRegistry(this._lastRegistry);
    }
    return renderer;
  }

  removeRenderer(renderer) {
    const i = this.renderers.indexOf(renderer);
    if (i >= 0) this.renderers.splice(i, 1);
  }

  _handleMessage(e) {
    const d = e.data;
    if (!d || !d.type) return;
    if (d.type === RT_MSG.CHANNELS) {
      this.reader.configure(d.payload);
      this._lastRegistry = d.payload;
      // guard each renderer so one bad adapter can't block the others
      for (const r of this.renderers) {
        if (!r.onRegistry) continue;
        try {
          r.onRegistry(d.payload);
        } catch (err) {
          console.error("RealtimeBus: renderer onRegistry failed", err);
        }
      }
    } else if (d.type === RT_MSG.CHART || d.type === RT_MSG.ANIM) {
      // transferable transport: hand the message to the reader
      this.reader.onMessage(d);
    }
  }

  /** Start the rAF loop. Idempotent. */
  start() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      // never let a tick error kill the loop — always reschedule
      try {
        this._tick();
      } catch (err) {
        console.error("RealtimeBus: tick failed", err);
      }
      this._rafId = globalThis.requestAnimationFrame(loop);
    };
    this._rafId = globalThis.requestAnimationFrame(loop);
  }

  /** Stop the rAF loop. Safe to call when not running. */
  stop() {
    this._running = false;
    if (this._rafId != null) {
      globalThis.cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _tick() {
    const chart = this.reader.drainChart(); // every new row, in order, or null
    const anim = this.reader.readAnim(); // newest frame only, or null
    if (chart == null && anim == null) return;
    // guard each renderer so one throwing adapter can't starve the others
    for (const r of this.renderers) {
      if (!r.onFrame) continue;
      try {
        r.onFrame(chart, anim);
      } catch (err) {
        console.error("RealtimeBus: renderer onFrame failed", err);
      }
    }
  }

  /** Tear down: stop the loop and detach the message listener. */
  dispose() {
    this.stop();
    if (this.worker) this.worker.removeEventListener("message", this._onMessage);
    this.renderers = [];
  }
}
