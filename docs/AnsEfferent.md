# AnsEfferent

An `AnsEfferent` is an autonomic **effector**: it averages the firing rates pushed to it by the
afferents, translates that average into an effect factor, smooths it with a time constant, and writes
it onto a target model property (e.g. `Heart.ans_activity_hr`).

It is one of the three classes that make up the autonomic feedback loop — **see
[Ans.md](./Ans.md)** for the full description of the firing-rate averaging (setpoint added after
averaging, so the resting rate stays 0.5 regardless of how many afferents feed it), the effect
translation, the configuration fields (`target_model`, `target_prop`, `effect_at_min/max_firing_rate`,
`tc`), and the reference-guarding behaviour.
