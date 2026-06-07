// ChannelWriter.js  (worker side)
//
// Writes the realtime data plane into the chart ring and anim snapshot, hiding
// the choice of transport behind one interface. Lives in the ModelEngine
// worker; the matching ChannelReader lives on the main thread.
//
// Transport is chosen once at construction:
//   - "shared"       SharedArrayBuffer + Atomics (default when cross-origin
//                    isolated). Worker writes, main reads in its rAF loop; no
//                    per-tick postMessage.
//   - "transferable" one ArrayBuffer transferred per flush() (zero-copy). The
//                    fallback when SharedArrayBuffer is unavailable.
//
// See RealtimeChannels.js for the buffer layout contract shared with the reader.

import {
  RT_MSG,
  RT_TRANSPORT,
  CHART_CTRL,
  ANIM_CTRL,
  CHART_RING_ROWS,
  sharedMemoryAvailable,
} from "./RealtimeChannels.js";

export default class ChannelWriter {
  /**
   * @param {(msg, transferList?) => void} post  postMessage shim from the worker.
   * @param {Object} [opts]
   * @param {string} [opts.transport]  Force "shared" | "transferable". Defaults
   *   to "shared" when available, else "transferable".
   */
  constructor(post, opts = {}) {
    this._post = post;
    this.transport =
      opts.transport ||
      (sharedMemoryAvailable() ? RT_TRANSPORT.SHARED : RT_TRANSPORT.TRANSFERABLE);

    // ---- chart channel state ----
    this._chartStride = 0;
    this._chartVersion = 0;
    this._chartCapacity = CHART_RING_ROWS;
    // shared: control + ring; transferable: a per-tick batch we copy out of.
    this._chartCtrl = null; // Int32Array (shared mode)
    this._chartRing = null; // Float64Array (shared mode)
    this._chartBatch = null; // Float64Array (transferable mode)
    this._chartBatchRows = 0; // rows pending in the batch (transferable mode)
    this._chartBatchCap = 0; // batch capacity in rows (transferable mode)

    // ---- anim channel state ----
    this._animStride = 0;
    this._animVersion = 0;
    this._animCtrl = null; // Int32Array (shared mode)
    this._animFrames = null; // Float32Array length 2*stride (shared mode)
    this._animPending = null; // Float32Array (transferable mode, latest frame)
  }

  // -------------------------------------------------------------------------
  // Chart channel
  // -------------------------------------------------------------------------

  /**
   * (Re)allocate the chart ring for a new column layout. Called at build and
   * whenever the watchlist changes the number of signals. Bumps nothing on its
   * own — pass the registry version so reader-side frames can be matched.
   * @param {number} stride   floats per row (col 0 = time, then signals)
   * @param {number} version  registry version these rows belong to
   * @param {number} [capacityRows]
   */
  acquireChartRing(stride, version, capacityRows = CHART_RING_ROWS) {
    this._chartStride = stride;
    this._chartVersion = version;
    this._chartCapacity = capacityRows;

    if (this.transport === RT_TRANSPORT.SHARED) {
      const ctrl = new Int32Array(
        new SharedArrayBuffer(CHART_CTRL.LEN * Int32Array.BYTES_PER_ELEMENT)
      );
      ctrl[CHART_CTRL.WRITE_IDX] = 0;
      ctrl[CHART_CTRL.READ_HINT] = 0;
      ctrl[CHART_CTRL.VERSION] = version;
      ctrl[CHART_CTRL.CAPACITY] = capacityRows;
      ctrl[CHART_CTRL.STRIDE] = stride;
      this._chartCtrl = ctrl;
      this._chartRing = new Float64Array(
        new SharedArrayBuffer(
          capacityRows * stride * Float64Array.BYTES_PER_ELEMENT
        )
      );
    } else {
      // Generous per-tick batch; the writer copies out exactly the used rows.
      this._chartBatchCap = 1024;
      this._chartBatch = new Float64Array(this._chartBatchCap * stride);
      this._chartBatchRows = 0;
    }
  }

  /**
   * Append one chart row. `values` must have length === stride (col 0 = time).
   */
  appendChartRow(values) {
    const stride = this._chartStride;
    if (stride === 0) return;

    if (this.transport === RT_TRANSPORT.SHARED) {
      const w = Atomics.load(this._chartCtrl, CHART_CTRL.WRITE_IDX);
      const base = (w % this._chartCapacity) * stride;
      this._chartRing.set(values, base);
      // publish the new row last, after the data is in place
      Atomics.store(this._chartCtrl, CHART_CTRL.WRITE_IDX, w + 1);
    } else {
      if (this._chartBatchRows >= this._chartBatchCap) {
        // Batch full within a single tick (very unlikely) — grow once.
        const grown = new Float64Array(this._chartBatch.length * 2);
        grown.set(this._chartBatch);
        this._chartBatch = grown;
        this._chartBatchCap *= 2;
      }
      this._chartBatch.set(values, this._chartBatchRows * stride);
      this._chartBatchRows += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Anim channel
  // -------------------------------------------------------------------------

  /**
   * (Re)allocate the anim snapshot for a scenario's component layout.
   * @param {number} stride   floats per frame (slot 0 = time)
   * @param {number} version  registry version
   */
  acquireAnimSnapshot(stride, version) {
    this._animStride = stride;
    this._animVersion = version;

    if (this.transport === RT_TRANSPORT.SHARED) {
      const ctrl = new Int32Array(
        new SharedArrayBuffer(ANIM_CTRL.LEN * Int32Array.BYTES_PER_ELEMENT)
      );
      ctrl[ANIM_CTRL.ACTIVE] = 0;
      ctrl[ANIM_CTRL.SEQ] = 0;
      ctrl[ANIM_CTRL.VERSION] = version;
      ctrl[ANIM_CTRL.STRIDE] = stride;
      this._animCtrl = ctrl;
      // two physical frames back to back
      this._animFrames = new Float32Array(
        new SharedArrayBuffer(2 * stride * Float32Array.BYTES_PER_ELEMENT)
      );
    } else {
      this._animPending = null;
    }
  }

  /**
   * Publish the latest anim frame. `values` must have length === anim stride.
   */
  writeAnimFrame(values) {
    const stride = this._animStride;
    if (stride === 0) return;

    if (this.transport === RT_TRANSPORT.SHARED) {
      // seqlock write into the inactive frame, then flip + publish.
      const active = Atomics.load(this._animCtrl, ANIM_CTRL.ACTIVE);
      const next = active ^ 1;
      this._animFrames.set(values, next * stride);
      Atomics.store(this._animCtrl, ANIM_CTRL.ACTIVE, next);
      Atomics.add(this._animCtrl, ANIM_CTRL.SEQ, 1);
    } else {
      // Coalesce: only the most recent frame survives until flush().
      const frame = new Float32Array(stride);
      frame.set(values);
      this._animPending = frame;
    }
  }

  // -------------------------------------------------------------------------
  // Flush (transferable transport only; no-op in shared mode)
  // -------------------------------------------------------------------------

  flush() {
    if (this.transport !== RT_TRANSPORT.TRANSFERABLE) return;

    if (this._chartBatchRows > 0) {
      const stride = this._chartStride;
      const count = this._chartBatchRows;
      const out = new Float64Array(count * stride);
      out.set(this._chartBatch.subarray(0, count * stride));
      this._post(
        {
          type: RT_MSG.CHART,
          version: this._chartVersion,
          stride,
          count,
          buffer: out.buffer,
        },
        [out.buffer]
      );
      this._chartBatchRows = 0;
    }

    if (this._animPending) {
      const buf = this._animPending.buffer;
      this._post(
        {
          type: RT_MSG.ANIM,
          version: this._animVersion,
          stride: this._animStride,
          buffer: buf,
        },
        [buf]
      );
      this._animPending = null;
    }
  }

  // -------------------------------------------------------------------------
  // Handshake descriptor — merged by ModelEngine into the rt_channels message
  // -------------------------------------------------------------------------

  /**
   * Transport + (shared mode) SAB handles for the reader to attach to. Posted
   * once per (re)allocation alongside the chart/anim registries.
   */
  descriptor() {
    const d = {
      transport: this.transport,
      chart: { stride: this._chartStride, version: this._chartVersion },
      anim: { stride: this._animStride, version: this._animVersion },
    };
    if (this.transport === RT_TRANSPORT.SHARED) {
      // The .buffer of each typed array is the SharedArrayBuffer; structured
      // clone shares (does not copy) SABs across the worker boundary.
      d.chart.ctrl = this._chartCtrl?.buffer || null;
      d.chart.ring = this._chartRing?.buffer || null;
      d.chart.capacity = this._chartCapacity;
      d.anim.ctrl = this._animCtrl?.buffer || null;
      d.anim.frames = this._animFrames?.buffer || null;
    }
    return d;
  }
}
