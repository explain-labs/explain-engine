# Monitor

The `Monitor` device model is a **read-only patient monitor**. It does not change the physiology — it
samples other models each step and derives the bedside-monitor numbers and waveforms: heart rate,
blood pressures, saturations, cardiac output, regional flows, blood gases and the ECG/ABP/PAP/CVP/
SpO₂/CO₂ traces.

All its model references are resolved by name in `init_model` (each with a `?? null` fallback), and
the read-outs are computed from whichever of those are present — a missing model just leaves the
corresponding number at its previous value rather than crashing.

## What it measures

| Group | Outputs |
|---|---|
| Rate | `heart_rate` (averaged), `heart_rate_btb` (beat-to-beat), `resp_rate` |
| Pressures | pre/post-ductal ABP (syst/diast/mean), PAP, CVP (IVC + SVC) |
| Ventricular | EDV/ESV/EDP/ESP and stroke volume (LV, RV) |
| Saturations | pre/post-ductal SaO₂, venous SvO₂ (IVC + SVC) |
| Output & flows | LVO, RVO, coronary, brain, kidney, LS, intestinal, RLB, DA, FO, VSD, IPS, umbilical |
| Gases | arterial pH/pO₂/pCO₂/HCO₃/BE, etCO₂, O₂ delivery (`do2_br`, `do2_lb`) |
| Waveforms | ECG, ABP, PAP, CVP, SpO₂ (pre/post), respiration, CO₂ |

## How it samples

Per step (`calc_model`):

1. **`collect_pressures`** — track running min/max of each compartment's `pres_in` over the beat.
2. **`collect_blood_flows`** — integrate each connector's `flow · Δt` into per-region counters.
3. **`collect_signals`** — snapshot the instantaneous waveform values.
4. **Beat detection** (`Heart.ncc_ventricular === 1`) latches the per-beat values: systolic/diastolic
   from the tracked min/max (mean ≈ `(2·diast + syst)/3`), end-diastolic/-systolic volumes &
   pressures, and resets the trackers.
5. **Rate** — the R-R interval gives `heart_rate_btb`; `calc_avg_heartrate` keeps a rolling average
   (`heart_rate`) over a beat window that adapts to rate (4 beats < 80 bpm, 12 beats ≥ 80, per the
   Philips IntelliVue convention).
6. **Outputs** — once every `flow_avg_beats` beats, convert the integrated flow counters to L/min
   (`counter / beats_time · 60`) and reset them.

## Configuration (model-definition fields)

The `*` name fields map the monitor onto the circulation/airway topology (`heart`, `lv`, `rv`,
`ascending_aorta`, `descending_aorta`, `pulm_artery`, the venous and shunt connectors, `breathing`,
`ventilator`, …). Averaging windows: `hr_avg_beats`, `flow_avg_beats`, `rr_avg_time`, `sat_avg_time`.

## Notes & caveats

- **`heart_rate` is the rolling average; `heart_rate_btb` is instantaneous.** A previous line
  overwrote `heart_rate` with the beat-to-beat value right after the averager set it, discarding the
  average — that overwrite was removed so `heart_rate` now reflects the adaptive moving average.
- **Missing references are tolerated.** The few read-outs that previously dereferenced `AA`, `AD`,
  `Heart`, `Ventilator` or `Breathing` without a guard now fall back to the last value, matching the
  defensive style of the rest of the model.
- **`right_atrium` is undefined** (only `right_atrium_ivci` / `right_atrium_svc` exist), so `_ra`
  resolves to null — it is unused, so this is harmless.
- **Pure observer.** The Monitor never writes to the models it samples, so it can be added or removed
  without affecting the simulation.
