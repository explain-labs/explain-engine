// ChannelReader.js  (main thread)
//
// The read side of the realtime data plane. Configured once from the worker's
// rt_channels handshake, then read every animation frame by the RealtimeBus:
//   - drainChart(): returns EVERY chart row written since the last drain, in
//     order (no dropped samples). Handles ring wrap and reader-stall overrun.
//   - readAnim(): returns only the NEWEST anim frame (older frames discarded).
//
// Works with both transports. In "shared" mode it attaches typed-array views
// over the worker's SharedArrayBuffers and reads them with Atomics. In
// "transferable" mode the bus feeds it rt_chart / rt_anim messages and it
// queues chart rows / coalesces the latest anim frame.

import {
  RT_TRANSPORT,
  CHART_CTRL,
  ANIM_CTRL,
} from "../helpers/RealtimeChannels.js";

export default class ChannelReader {
  constructor() {
    this.transport = null;

    // chart registry
    this.chartVersion = 0;
    this.chartStride = 0;
    this.chartSlots = [];

    // anim registry
    this.animVersion = 0;
    this.animStride = 0;
    this.animComponents = [];
    this.animLayout = null;

    // shared-mode views
    this._chartCtrl = null;
    this._chartRing = null;
    this._chartCapacity = 0;
    this._chartLastRead = 0;
    this._animCtrl = null;
    this._animFrames = null;
    this._animScratch = null;
    this._animLastSeq = -1;

    // transferable-mode state
    this._chartQueue = []; // [{version, stride, count, data:Float64Array}]
    this._animPending = null; // {version, frame:Float32Array}

    // diagnostics
    this.lastChartGap = false; // set true on a drain that overran the ring
  }

  /**
   * (Re)configure from an rt_channels payload:
   *   { descriptor, chart:{version, slots}, anim:{version, components, layout} }
   * Discards any in-flight data from a previous layout/version.
   */
  configure(payload) {
    const d = payload.descriptor || {};
    this.transport = d.transport;

    this.chartVersion = payload.chart?.version || 0;
    this.chartSlots = payload.chart?.slots || [];
    this.chartStride = d.chart?.stride || this.chartSlots.length;

    if (payload.anim) {
      this.animVersion = payload.anim.version || 0;
      this.animComponents = payload.anim.components || [];
      this.animLayout = payload.anim.layout || null;
      this.animStride = d.anim?.stride || payload.anim.layout?.stride || 0;
    }

    // drop stale in-flight data
    this._chartQueue = [];
    this._animPending = null;

    if (this.transport === RT_TRANSPORT.SHARED) {
      this._attachShared(d);
    }
    if (this.animStride > 0) {
      this._animScratch = new Float32Array(this.animStride);
    }
  }

  _attachShared(d) {
    // reset any previously attached views (a reconfigure may drop a channel)
    this._chartCtrl = null;
    this._chartRing = null;
    this._animCtrl = null;
    this._animFrames = null;

    // chart
    if (d.chart?.ctrl && d.chart?.ring) {
      this._chartCtrl = new Int32Array(d.chart.ctrl);
      this._chartRing = new Float64Array(d.chart.ring);
      this._chartCapacity = d.chart.capacity;
      // begin reading from "now" — don't replay pre-attach history
      this._chartLastRead = Atomics.load(this._chartCtrl, CHART_CTRL.WRITE_IDX);
    }

    // anim
    if (d.anim?.ctrl && d.anim?.frames) {
      this._animCtrl = new Int32Array(d.anim.ctrl);
      this._animFrames = new Float32Array(d.anim.frames);
      this._animLastSeq = -1;
    }
  }

  /** Feed transferable-transport messages (no-op in shared mode). */
  onMessage(msg) {
    if (this.transport !== RT_TRANSPORT.TRANSFERABLE) return;
    if (msg.type === "rt_chart") {
      if (msg.version !== this.chartVersion) return; // stale layout
      this._chartQueue.push({
        version: msg.version,
        stride: msg.stride,
        count: msg.count,
        data: new Float64Array(msg.buffer),
      });
    } else if (msg.type === "rt_anim") {
      if (msg.version !== this.animVersion) return;
      // coalesce: only the newest frame matters
      this._animPending = { version: msg.version, frame: new Float32Array(msg.buffer) };
    }
  }

  /**
   * @returns {null | {version, stride, slots, count, rows:Float64Array}}
   *   `rows` is count*stride Float64 values; null if nothing new.
   */
  drainChart() {
    this.lastChartGap = false;
    if (this.transport === RT_TRANSPORT.SHARED) return this._drainChartShared();
    return this._drainChartTransferable();
  }

  _drainChartShared() {
    const ctrl = this._chartCtrl;
    if (!ctrl) return null;
    const stride = this.chartStride;
    const cap = this._chartCapacity;
    const w = Atomics.load(ctrl, CHART_CTRL.WRITE_IDX);
    let from = this._chartLastRead;
    if (w === from) return null;

    let count = w - from;
    if (count > cap) {
      // reader stalled and the writer lapped us — keep the freshest `cap` rows
      from = w - cap;
      count = cap;
      this.lastChartGap = true;
    }

    const rows = new Float64Array(count * stride);
    for (let k = 0; k < count; k++) {
      const srcRow = (from + k) % cap;
      const srcBase = srcRow * stride;
      rows.set(this._chartRing.subarray(srcBase, srcBase + stride), k * stride);
    }

    this._chartLastRead = w;
    Atomics.store(ctrl, CHART_CTRL.READ_HINT, w);
    return { version: this.chartVersion, stride, slots: this.chartSlots, count, rows };
  }

  _drainChartTransferable() {
    if (this._chartQueue.length === 0) return null;
    const stride = this.chartStride;
    let total = 0;
    for (const b of this._chartQueue) total += b.count;
    const rows = new Float64Array(total * stride);
    let offset = 0;
    for (const b of this._chartQueue) {
      rows.set(b.data.subarray(0, b.count * stride), offset);
      offset += b.count * stride;
    }
    this._chartQueue = [];
    return { version: this.chartVersion, stride, slots: this.chartSlots, count: total, rows };
  }

  /**
   * @returns {null | {version, stride, components, layout, frame:Float32Array}}
   *   `frame` is the newest anim snapshot; null if unchanged since last read.
   */
  readAnim() {
    if (this.animStride === 0) return null;
    if (this.transport === RT_TRANSPORT.SHARED) return this._readAnimShared();
    return this._readAnimTransferable();
  }

  _readAnimShared() {
    const ctrl = this._animCtrl;
    if (!ctrl) return null;
    const stride = this.animStride;
    const scratch = this._animScratch;

    let seq, active;
    do {
      seq = Atomics.load(ctrl, ANIM_CTRL.SEQ);
      active = Atomics.load(ctrl, ANIM_CTRL.ACTIVE);
      const base = active * stride;
      scratch.set(this._animFrames.subarray(base, base + stride));
    } while (seq !== Atomics.load(ctrl, ANIM_CTRL.SEQ));

    if (seq === this._animLastSeq) return null; // nothing new
    this._animLastSeq = seq;
    return {
      version: this.animVersion,
      stride,
      components: this.animComponents,
      layout: this.animLayout,
      frame: scratch,
    };
  }

  _readAnimTransferable() {
    if (!this._animPending) return null;
    const frame = this._animPending.frame;
    this._animPending = null;
    return {
      version: this.animVersion,
      stride: this.animStride,
      components: this.animComponents,
      layout: this.animLayout,
      frame,
    };
  }
}
