// AnimationPacker.js  (worker side)
//
// Turns the diagram definition + live model state into the ~per-frame scalar
// stream that drives the sprite diagram. Built once at model build from
// `model.diagram_definition.components`; on every realtime tick it packs each
// animated component's magnitude (volume or flow) and tint source (to2) into a
// fixed-stride Float32 frame and hands it to the ChannelWriter.
//
// Aggregation lives here (in the worker) on purpose: a component may map to
// several engine models (e.g. a lung = ["LL_CAP","LL_ART","LL_VEN"]); summing
// happens against direct model references so the main thread receives ready-to-
// render floats and never needs the model topology — only the AnimRegistry
// (component -> slot) this class emits.

import {
  animStride,
  animMagOffset,
  animTintOffset,
  ANIM_TIME_SLOT,
} from "./RealtimeChannels.js";

export default class AnimationPacker {
  /**
   * @param {Object} model    the engine model object (has .models, .diagram_definition)
   * @param {number} version  registry version (typically the build counter)
   */
  constructor(model, version = 1) {
    this._model = model;
    this.version = version;
    this.enabled = false;
    this._descriptors = []; // precomputed per-component packing descriptors
    this._components = []; // registry entries sent to the main thread
    this.max_to2 = 7.1; // tint normalization hint for the renderer
    this.stride = 0;
    this._frame = null; // reusable Float32 scratch (no per-tick alloc)

    const diagram = model?.diagram_definition;
    if (!diagram || !diagram.components) return;

    if (typeof diagram.settings?.max_to2 === "number") {
      this.max_to2 = diagram.settings.max_to2;
    }

    this._build(diagram.components);
  }

  _build(components) {
    let index = 0;
    for (const [name, comp] of Object.entries(components)) {
      const general = comp?.layout?.general || {};
      const animatedBy = general.animatedBy; // "vol" | "flow" | "none"
      const modelNames = Array.isArray(comp.models) ? comp.models : [];

      // Skip static elements (titles/devices) and anything not data-driven.
      if (animatedBy !== "vol" && animatedBy !== "flow") continue;
      if (modelNames.length === 0) continue;

      const magProp = animatedBy === "vol" ? "vol" : "flow";
      const magRefs = modelNames
        .map((n) => this._model.models[n])
        .filter(Boolean);
      if (magRefs.length === 0) continue;

      const tinting = general.tinting === true;
      const tintRef = tinting ? this._resolveTintRef(comp, magRefs) : null;

      this._descriptors.push({ index, magRefs, magProp, tintRef });
      this._components.push({
        name,
        index,
        kind: magProp,
        models: modelNames,
        tinting,
      });
      index += 1;
    }

    const count = this._descriptors.length;
    this.stride = animStride(count);
    this._frame = new Float32Array(this.stride);
    this.enabled = count > 0;
  }

  /**
   * Pick the model whose `to2` should colour this component. Compartments tint
   * from the first of their own models carrying a `to2`; connectors tint from
   * the upstream blood they draw from.
   */
  _resolveTintRef(comp, magRefs) {
    // Connector: a connector's model is a resistor whose `comp_from` names the
    // true upstream blood compartment model (e.g. LL_VEN_PV draws from LL_VEN).
    // Prefer that — the diagram's `dbcFrom` is a diagram component name (e.g.
    // "LL"), which for grouped multi-model compartments is not itself an engine
    // model and so can't be resolved to a `to2` directly.
    for (const ref of magRefs) {
      const up = ref?.comp_from && this._model.models[ref.comp_from];
      if (up && "to2" in up) return up;
    }
    // Fallback: a connector endpoint that maps straight to a model (single-model
    // compartments whose diagram name equals the model name).
    const up = comp.dbcFrom || comp.dbcTo;
    if (up && this._model.models[up] && "to2" in this._model.models[up]) {
      return this._model.models[up];
    }
    // Compartment (or last-resort connector fallback): first own model with to2.
    for (const ref of magRefs) {
      if (ref && "to2" in ref) return ref;
    }
    return null;
  }

  /**
   * Pack the current frame and publish it via the writer. Cheap: one pass over
   * precomputed descriptors, no allocation.
   * @param {import('./ChannelWriter.js').default} writer
   * @param {number} time  model time (seconds)
   */
  pack_and_write(writer, time) {
    if (!this.enabled) return;
    const frame = this._frame;
    frame[ANIM_TIME_SLOT] = time;

    for (let i = 0; i < this._descriptors.length; i++) {
      const d = this._descriptors[i];

      let mag = 0;
      const refs = d.magRefs;
      for (let r = 0; r < refs.length; r++) {
        const v = refs[r][d.magProp];
        if (typeof v === "number") mag += v;
      }
      frame[animMagOffset(d.index)] = mag;

      let tint = 0;
      if (d.tintRef) {
        const t = d.tintRef.to2;
        if (typeof t === "number") tint = t;
      }
      frame[animTintOffset(d.index)] = tint;
    }

    writer.writeAnimFrame(frame);
  }

  /** AnimRegistry for the one-time rt_channels handshake. */
  registry() {
    return {
      version: this.version,
      components: this._components,
      layout: {
        count: this._descriptors.length,
        stride: this.stride,
        max_to2: this.max_to2,
      },
    };
  }
}
