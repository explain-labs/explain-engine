# AnsAfferent

An `AnsAfferent` is an autonomic **receptor**: it reads one input quantity (e.g. arterial pressure or
a blood gas), maps it through a baro-/chemoreceptor curve to a normalized firing rate (0–1, setpoint
0.5), low-passes it with a time constant, and broadcasts it to the connected efferents.

It is one of the three classes that make up the autonomic feedback loop — **see
[Ans.md](./Ans.md)** for the full description of the receptor curve (input → activation → gain →
firing rate), the data flow, the configuration fields (`input_model`, `input_prop`, `min/set/max`,
`tc`, `efferents`, `effect_weight`), and the reference-guarding behaviour.
