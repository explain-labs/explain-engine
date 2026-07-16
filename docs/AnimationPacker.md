# AnimationPacker

`AnimationPacker.js` turns the **diagram definition + live model state** into the per-frame scalar stream that drives the PixiJS sprite diagram. It is worker-side infrastructure, not a physiological model. Built once at model build from `model.diagram_definition.components` (and rebuilt by `ModelEngine.update_diagram()` when the diagram is edited live), it packs each animated component's **magnitude** (volume or flow) and **tint source** (`to2`) into a fixed-stride `Float32` frame and hands it to [ChannelWriter](./ChannelWriter.md) every realtime tick. See [RealtimeChannels](./RealtimeChannels.md) for the anim frame layout and [ARCHITECTURE](./ARCHITECTURE.md) for the full pipeline.

## Role in the engine

Aggregation deliberately lives **in the worker**. A single diagram component may map to several engine models (e.g. a lung = `["LL_CAP","LL_ART","LL_VEN"]`); summing happens here against **direct model references** so the main thread receives ready-to-render floats and never needs the model topology — only the *AnimRegistry* (component → slot) this class emits in the handshake.

Flow per realtime tick (in `ModelEngine._model_step_rt`): after the model steps, `animation_packer.pack_and_write(channel_writer, model.model_time_total)` packs the latest frame; `channel_writer.flush()` then ships it (no-op in shared mode). The registry is sent once via `ModelEngine._post_rt_channels()` → `AnimationPacker.registry()`.

## Key state

Constructor: `new AnimationPacker(model, version = 1)`

- `model` — the engine model object (has `.models` and `.diagram_definition`).
- `version` — registry version, typically the build counter.

| Field | Description |
|---|---|
| `_model` | Reference to the engine model object |
| `version` | Registry version sent in the handshake |
| `enabled` | `true` only if ≥1 animated component was found |
| `_descriptors` | Precomputed per-component packing descriptors `{ index, magRefs, magProp, tintRef }` |
| `_components` | Registry entries for the main thread `{ name, index, kind, models, tinting }` |
| `max_to2` | Tint normalization hint for the renderer (default `7.1`, overridable from `diagram.settings.max_to2`) |
| `stride` | Floats per frame = `animStride(componentCount)` |
| `_frame` | Reusable `Float32Array` scratch (no per-tick allocation) |

If the model has no `diagram_definition` or no `.components`, the constructor returns early and `enabled` stays `false`.

## Key methods

### `_build(components)` (constructor-time)

Iterates `Object.entries(components)` assigning a dense `index` to each **animated** component. For each:

- Reads `comp.layout.general.animatedBy` (`"vol"` | `"flow"` | `"none"`). **Skips** anything not `"vol"`/`"flow"` (static titles/devices) and anything with no `models`.
- Picks `magProp = "vol"` or `"flow"`; resolves `magRefs` = the live model objects named in `comp.models` (filtering out missing ones). Skips the component if none resolve.
- If `general.tinting === true`, resolves a `tintRef` via `_resolveTintRef`.
- Pushes a descriptor and a registry entry, then increments `index`.

Finally sets `stride = animStride(count)`, allocates `_frame`, and sets `enabled = count > 0`.

### `_resolveTintRef(comp, magRefs)`

Picks the model whose `to2` colours this component:

1. **Connector:** if any `magRef` is a resistor whose `comp_from` names an upstream blood model that carries `to2`, use that upstream compartment. (The diagram's `dbcFrom` is a diagram *component* name, which for grouped multi-model compartments is not itself an engine model.)
2. **Fallback:** if `comp.dbcFrom`/`comp.dbcTo` maps straight to a model with `to2`, use it.
3. **Compartment / last resort:** the first of the component's own `magRefs` carrying `to2`.
4. Returns `null` if none found.

### `pack_and_write(writer, time)`

The per-tick hot path. No-op if `!enabled`. Cheap: one pass over precomputed descriptors, no allocation.

- Writes `time` into `frame[ANIM_TIME_SLOT]`.
- For each descriptor: sums `magProp` across all `magRefs` (skipping non-numbers) into `frame[animMagOffset(index)]`; reads `tintRef.to2` (or `0`) into `frame[animTintOffset(index)]`.
- Calls `writer.writeAnimFrame(frame)`.

### `registry()`

Returns the AnimRegistry for the one-time `RT_MSG.CHANNELS` handshake:

```js
{
  version,
  components: [{ name, index, kind, models, tinting }, …],
  layout: { count, stride, max_to2 },
}
```

The main thread uses `components[i].index` to know which `(mag, tint)` slot pair belongs to which sprite.

## Protocol / layout

Frames follow the anim layout from [RealtimeChannels](./RealtimeChannels.md): `[time, mag_0, tint_0, mag_1, tint_1, …]`. Slot 0 is model time (`ANIM_TIME_SLOT`); thereafter `ANIM_FLOATS_PER_COMPONENT` (= 2) floats per component, addressed by `animMagOffset(index)` / `animTintOffset(index)`. Stride = `animStride(count) = 1 + 2*count`. The renderer maps a component's raw `to2` against `max_to2` for its tint.

## Notes / caveats

- **Magnitude is a raw sum, not a normalized value.** `pack_and_write` sums `vol`/`flow` across mapped models; any normalization/scaling for sprite sizing happens in the renderer, not here.
- **Tint is `to2` only.** Components without `tinting: true`, or with no resolvable `to2` source, emit `0` in their tint slot.
- **Live diagram edits rebuild the packer.** `update_diagram()` constructs a fresh `AnimationPacker` (bumping `build_counter` → new `version`), re-acquires the anim snapshot at the new stride via [ChannelWriter](./ChannelWriter.md), and re-posts the handshake — without rebuilding the running model. The version bump is what lets the reader discard frames packed against the old layout.
- **Descriptors hold direct model references.** They are captured at build; if a model object is replaced (rather than mutated), the packer must be rebuilt or it will keep summing the stale reference.
