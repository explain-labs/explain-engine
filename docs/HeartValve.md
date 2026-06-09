# HeartValve

A `HeartValve` is a `Resistor` with a distinct `model_type` — it adds no code of its own:

```js
export class HeartValve extends Resistor {
  static model_type = "HeartValve";
}
```

All of its behaviour (flow mechanics, the forward/backward resistances, the non-linear term, the
flags) comes from [`Resistor`](./Resistor.md). The separate type exists for clarity in definitions and
so the UI can present valve-relevant fields.

## Valve behaviour

Valve action is configuration, not code: a heart valve sets **`no_back_flow = true`** so blood flows
only in the forward direction (e.g. `LA_LV`, `RV_PA`, `LV_AA`). A valve that is atretic/absent in a
given scenario additionally sets `no_flow = true`.

See [Resistor.md](./Resistor.md) for the flow equations, the `volume_out`/`volume_in` handshake, and
the resistance/factor details.
