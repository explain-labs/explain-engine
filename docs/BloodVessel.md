# BloodVessel

A `BloodVessel` is a segment of the circulation: an elastic blood compartment ([`BloodCapacitance`](./BloodCapacitance.md)) with its own inflow resistance and autonomic (ANS) control. When the ANS constricts a vessel, its resistance **and** its stiffness change together. That coupling is a defining feature of Explain. Almost the whole circulation is built from BloodVessels.

## Physiology

Each vessel segment does two things at once:

- **It holds blood** at a pressure set by its wall stiffness, like any elastic compartment.
- **It resists flow** into it. Most of the circulation's resistance sits in the small arteries and arterioles, so those segments set systemic and pulmonary vascular resistance.

The autonomic nervous system adjusts vessel tone through three effects:

- **Resistance.** Sympathetic activity constricts arterioles and raises resistance (and blood pressure); withdrawal dilates them.
- **Stiffness follows resistance.** A constricted vessel has a narrower, thicker-walled lumen, so it is also stiffer. Explain couples the two with one exponent per vessel type (*α*), so vasoconstriction raises resistance and elastance together.
- **Venous reservoir.** Sympathetic venoconstriction mainly shrinks the *unstressed volume* of the large capacitance veins, not their stiffness. That shifts blood from the venous reservoir into the circulating (stressed) volume and raises venous return. It is the body's quick "autotransfusion".

Blood viscosity also sets resistance (Poiseuille). Polycythaemia raises resistance in every vessel, and haemodilution lowers it.

## Inheritance

```
BaseModelClass
  └── Capacitance
        └── BloodCapacitance      (blood composition mixing)
              └── BloodVessel     (inflow resistors, ANS, α-coupling, viscosity)
```

`BloodVessel` overrides `calc_resistances` and `calc_elastances`, and composes its factor layers **multiplicatively** (unlike the additive base classes). It extends `calc_volumes` with the ANS unstressed-volume effect. Pressure and composition mixing are inherited.

## Properties

Inherited props: [Capacitance](./Capacitance.md#properties) (`vol`, `u_vol`, `el_base`, `el_k`, their factor layers, `pres`, …) and [BloodCapacitance](./BloodCapacitance.md#properties) (`temp`, `viscosity`, `solutes`, `drugs`, blood gases, `blood_pool`, and the props `Blood` writes, including `viscosity_ref`).

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `inputs` | – | `[]` | Upstream compartments. One inflow `Resistor` is created per input, named `<input>_<vessel>`. |
| `r_for` | mmHg·s/L | 1.0 | Forward resistance of each inflow connector. |
| `r_back` | mmHg·s/L | 1.0 | Backward resistance. |
| `r_k` | mmHg·s²/L² | 0.0 | Turbulent coefficient (0 in every shipped vessel). |
| `no_flow` | boolean | `false` | Closes all inflow connectors. |
| `no_back_flow` | boolean | `false` | Makes the inflow connectors one-way. |
| `alpha` | – | 0.0 | Resistance→elastance coupling exponent: `el ∝ (R multiplier)^α`. 0 = no coupling. |
| `ans_sens` | – | 0.0 | Sensitivity of the resistance to `ans_activity`, 0 (none) to 1 (full). |
| `u_vol_ans_sens` | – | 0.0 | Sensitivity of the unstressed volume to `ans_activity` (venoconstriction). |
| `r_factor`, `r_k_factor` | – | 1.0 | Non-persistent factors, reset to 1 every step. |
| `r_factor_ps`, `r_k_factor_ps` | – | 1.0 | Persistent factors. |
| `r_factor_scaling_ps`, `r_k_factor_scaling_ps` | – | 1.0 | Persistent scaling factors. |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `flow` | L/s | 0.0 | Net **inflow** through the input connectors (forward − backward). Not the outflow. |
| `flow_forward` | L/s | 0.0 | Sum of the forward flows of the enabled input connectors. |
| `flow_backward` | L/s | 0.0 | Sum of the backward flows (positive number). |
| `r_for_eff`, `r_back_eff` | mmHg·s/L | 1000 | Effective resistances, written into the input connectors. |
| `r_k_eff` | mmHg·s²/L² | 0 | Effective turbulent coefficient. |

### Set by other models

| Property | Unit | Default | Description |
|---|---|---|---|
| `ans_activity` | – | 1.0 | Autonomic tone, > 1 constriction, < 1 dilation. `Circulation` writes its own `ans_activity` (from the `EF_SVR` efferent) into **every** circulation vessel. Placenta and ECLS vessels keep 1. |
| `viscosity_ref` | cP | 0.0 | Viscosity at which `r_for`/`r_back` are calibrated, written by `Blood` at build; 0 switches the viscosity effect off. |
| `p1_ext`, `p2_ext` | mmHg | 0.0 | Extra pressure on the inlet/outlet of the input connectors. Copied to them every step and **not** reset on the vessel, so a value written here acts until the writer sets it back to 0 (e.g. `Ecls` on `ECLS_PUMP`/`ECLS_OXY`). |

## Calculation

Each step `step_model()` first copies the vessel's `is_enabled` onto its input connectors, so a disabled vessel's connectors stop conducting. Then, when enabled and initialized, `calc_model()` runs:

1. **`calc_resistances()`**
   ```
   ans_mult       = 1 + (ans_activity − 1) · ans_sens
   r_total_factor = r_factor · r_factor_ps · r_factor_scaling_ps · ans_mult
   visc_mult      = viscosity / viscosity_ref          (1 if viscosity_ref = 0)
   r_for_eff  = r_for  · r_total_factor · visc_mult
   r_back_eff = r_back · r_total_factor · visc_mult
   r_k_eff    = r_k · r_k_factor · r_k_factor_ps · r_k_factor_scaling_ps · ans_mult
   ```
   `r_total_factor` is cached for the elastance step; viscosity is deliberately left out of it (thicker blood isn't vasoconstriction, so it doesn't stiffen the wall). The non-persistent factors are reset.
2. **`calc_elastances()`**
   ```
   el_eff   = el_base · el_base_factor · el_base_factor_ps · el_base_factor_scaling_ps · r_total_factor^α
   el_k_eff = el_k · el_k_factor · el_k_factor_ps · el_k_factor_scaling_ps        (not α-coupled)
   ```
   The power is recomputed only when `r_total_factor` or `α` change.
3. **Update the input connectors**: `r_for`/`r_back`/`r_k` ← the effective values; `no_flow`, `no_back_flow`, `p1_ext`, `p2_ext`, `is_enabled` ← the vessel's.
4. **`calc_volumes()`**: the inherited additive `u_vol` layers (floored at 0), then the ANS venoconstriction:
   ```
   u_vol_eff = u_vol_eff · max(0, 1 − (ans_activity − 1) · u_vol_ans_sens)
   ```
5. **`calc_pressure()`** (inherited from [Capacitance](./Capacitance.md#calculation)): with `S = vol − u_vol_eff`, `pres = (S > 0 ? el_k_eff·S² : 0) + el_eff·S + pres_ext`.
6. **`get_flows()`**: sums the flows of the enabled input connectors into `flow_forward`, `flow_backward` and `flow`.

**Inflow connectors.** `init_model` creates one `Resistor` per name in `inputs`, unless a model with that name already exists (a saved state lists them as top-level entries, so they are reused). The flow itself, the volume transfer and the composition mixing all happen in those connectors; see [Resistor](./Resistor.md#inheritance) for which props the vessel overwrites and which stay the connector's own.

**Step lag.** In a loaded scenario the connectors are top-level entries and step **before** their vessel (the vessels are sub-models of `Circulation`, `Placenta` or `Ecls`). So a connector uses the resistance the vessel wrote one step earlier (0.5 ms).

### Where α comes from

For a thin-walled tube, Poiseuille gives `R ∝ r⁻⁴`, and the volume elastance of the tube scales as `E ∝ r⁻³`. A pure change of radius therefore moves them as `E ∝ R^(3/4)`, so α = 0.75. That is the value used for veins and venules. The scenarios use 0.63 for arterioles and 0.5 for large arteries and central veins, where the thicker or more structural wall stiffens less than the pure-geometry estimate. The lumped "rest of upper/lower body" beds (`RUB`, `RLB`) use 1.

## Factor system

The resistance and elastance layers compose **multiplicatively**:

```
value_eff = base · factor · factor_ps · factor_scaling_ps        (r_for, r_back, r_k, el_base, el_k)
```

So `r_factor = 2` with `r_factor_ps = 2` gives a true ×4, not the ×3 of the additive rule. `u_vol` keeps the inherited **additive** layers (then the ANS multiplier). See [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern).

**α applies to every resistance layer, not only the ANS.** `r_total_factor` includes `r_factor_ps` and `r_factor_scaling_ps`, so these also stiffen the vessel by `factor^α`:
- the user's or a drug's SVR change (`Circulation.set_svr_factor_*` on the systemic arterioles);
- renal autoregulation (`Kidneys` on `KID_ART`);
- the Calibrator;
- ModelScaler resistance scaling.

Writers in the current code:

| Layer | Writers |
|---|---|
| `r_factor_ps` | `Circulation` (`set_svr_factor_art`/`_drug`/`_ven`, `set_pvr_factor_art`/`_ven`: deltas added to the shared accumulator), `Kidneys` (`KID_ART`, afferent autoregulation), the `Calibrator`, the user |
| `r_factor_scaling_ps`, `el_base_factor_scaling_ps`, `u_vol_factor_scaling_ps` | `ModelScaler`; `Uterus`, `MaternalPlacenta` (their own vessels) |
| `u_vol_factor_ps`, `el_base_factor_ps` | the user and scenarios |

Models that need to change **one** inflow without touching the vessel write the input connector's own factors instead, which multiply on top of the vessel's value:
- `Hormones`: `KID_CAP_KID_VEN.r_factor_ps`, the efferent arteriole;
- `Brain`: `AA_BR_ART.r_factor_ps` (cerebral autoregulation) and `BR_VEN_VUB.r_factor_ps` (ICP on the outflow).

The vessel's `r_for_eff` doesn't show these.

## Inputs and outputs

- **Reads:** its own props; `viscosity` and `viscosity_ref` (written by `Blood`); `ans_activity` (written by `Circulation`); the flows of its input connectors.
- **Writes:** the resistance and gates of its input connectors, every step.
- **Written by:** `Circulation` (`ans_activity`, SVR/PVR factors), `Blood` (viscosity, temperature, seed composition), `Kidneys`, the `Calibrator`, `ModelScaler`, `Uterus`/`MaternalPlacenta`, `Ecls` (`p1_ext`/`p2_ext`, volumes), `Placenta` (`no_flow` at cord clamping), `THORAX` (`pres_ext` on the intrathoracic vessels), the connected resistors (volume).
- **Read by:** `Monitor` (pressures, flows), `Brain` and `Kidneys` (their bed's pressures and flows), `Blood` (blood-gas sites `AA`, `AD`, `IVCI`, `SVC`, `PA`), `DataCollector` watchers.

## Assumptions and limitations

- **Inflow resistance only.** A vessel's resistance sits on its inflow connectors; its outflow is the next vessel's inflow. A bed with several outlets has no resistance of its own on each outlet.
- **One ANS signal for the whole circulation.** Every circulation vessel gets the same `ans_activity`. Regional differences come only from `ans_sens` (e.g. 1 on the systemic and pulmonary arterioles, 0.5 on the aorta and central veins, 0.05 on the pulmonary trunk and veins, 0 on capillaries). There is no separate cerebral, renal or splanchnic sympathetic output.
- **α-coupling is geometric and instantaneous.** Any resistance change stiffens the vessel by `factor^α`. That fits vasoconstriction, but it also applies to scaling and calibration changes of resistance.
- **`ans_mult` must stay positive.** `r_total_factor^α` is `NaN` for a negative base. Today's efferent ranges keep `ans_activity` in 0.5–2, but `AnsEfferent` doesn't clamp its firing rate (to be checked with the control loops).
- **No vessel collapse, inertance or wave propagation** (see [Capacitance](./Capacitance.md#assumptions-and-limitations) and [Resistor](./Resistor.md#assumptions-and-limitations)).

## Example definition (JSON)

From `term_neonate.json`, `models.Circulation.components.KID_ART` (trimmed to the config props):

```json
{
  "name": "KID_ART",
  "model_type": "BloodVessel",
  "is_enabled": true,
  "inputs": ["AD"],
  "vol": 0.00056,
  "u_vol": 0.00011,
  "el_base": 94524.9,
  "el_k": 0,
  "r_for": 10777.7,
  "r_back": 10539.3,
  "r_k": 0,
  "alpha": 0.63,
  "ans_sens": 1,
  "u_vol_ans_sens": 0
}
```

## Usage in the scenarios

Term_neonate has 39 vessels (the same layout in all 10 scenarios):

| Bed | Vessels | α | `ans_sens` | `u_vol_ans_sens` |
|---|---|---|---|---|
| Pulmonary trunk, branches, veins | `PA`, `PAAL`, `PAAR`, `PV` | 0.5 | 0.05 | 0 |
| Lung arterioles / capillaries / venules | `LL_ART`, `RL_ART` / `LL_CAP`, `RL_CAP` / `LL_VEN`, `RL_VEN` | 0.63 / 0 / 0.75 | 1 / 0 / 0.75 | 0 |
| Aorta | `AA`, `AAR`, `AD` | 0.5 | 0.5 | 0 |
| Systemic beds: liver/spleen, kidney, intestine, brain (arteriole / capillary / venule) | `LS_*`, `KID_*`, `INT_*`, `BR_*` | 0.63 / 0 / 0.75 | 1 / 0 / 0.75 | 0.2 on `LS_VEN`, `KID_VEN`, `INT_VEN` |
| Rest of lower / upper body | `RLB`, `RUB` | 1 | 1 | 0 |
| Capacitance veins | `VLB`, `VUB`, `IVCI`, `SVC` | 0.5 | 0.5 | 0.2 |
| Placenta (fetal side) | `PL_UMB_ART`, `PL_FETAL_ART`/`_CAP`/`_VEN`, `PL_UMB_VEN` | 1, 0.63, 0, 0.75, 1 | 0, 1, 0, 0.75, 0 | 0 |
| ECLS circuit | `ECLS_PUMP`, `ECLS_OXY`, `ECLS_TUBING_OUT` | 0 | 0 | 0 |

The circulation vessels are owned by `Circulation`, the placental ones by `Placenta` (disabled after birth), and the ECLS ones by `Ecls` (disabled unless ECLS runs).

## References

- Shoukas AA, Sagawa K. Control of total systemic vascular capacity by the carotid sinus baroreceptor reflex. *Circ Res* 1973;33(1):22–33. [doi:10.1161/01.res.33.1.22](https://doi.org/10.1161/01.res.33.1.22) (sympathetic control acts mainly on unstressed volume, with little change in compliance).

The resistance, elastance and α values are scenario calibrations (see the `*Reference.md` pages). The α = 0.75 value follows from tube geometry (above).
