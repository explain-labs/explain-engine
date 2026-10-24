# Resistor

A `Resistor` moves blood or gas between two compartments, driven by the pressure difference between them. It is the flow element of every circuit in the model (vessels, valves, airways, ventilator and ECLS tubing) and the reference implementation of the additive factor pattern for resistances.

## Physiology

Blood flows from high to low pressure, and how much flows depends on the *resistance* of the path: flow = pressure difference / resistance. Narrow or constricted vessels have a high resistance. Resistance in mmHg·s/L is the same quantity as SVR or PVR, only in absolute units and for one connection.

Some refinements are available:
- **Valves.** A connection can let flow through in one direction only (heart valves, venous valves), or have a higher resistance backwards than forwards.
- **Turbulence.** Through a narrow opening (a stenotic valve, a restrictive duct) the pressure loss grows with the *square* of the flow (Bernoulli). An optional non-linear term models this.
- **Mixing without net flow.** Between two compartments that are really one continuous space (the two halves of the right atrium, the dead space and the alveoli), blood or gas also mixes by eddies or diffusion without any net flow.
- **Occlusion.** A connection can be closed completely (a clamped cord, an obstructed airway, a closed duct).

## Inheritance

```
BaseModelClass
  └── Resistor
        └── HeartValve   (no code of its own: same class under its own model_type)
```

A valve's one-way behaviour comes from `no_back_flow: true` in its definition, not from the class. Several plain Resistors are one-way too (`RAIVCI_RV`, `RASVC_RV`, `VLB_IVCI`, `VUB_SVC`, …).

**Vessel-owned connectors.** A [`BloodVessel`](./BloodVessel.md) creates one Resistor per entry in its `inputs`, named `<input>_<vessel>` (e.g. `PA_PAAL`). Every step the vessel writes its own effective values into that connector:

- `r_for`, `r_back`, `r_k`;
- `no_flow`, `no_back_flow`;
- `p1_ext`, `p2_ext`;
- `is_enabled`.

So set those on the vessel, not on the connector: a value written on the connector is overwritten. `implicit`, `mix_flow`, `no_flow_ext` and the connector's own factor layers are **not** overwritten. In term_neonate 42 of the 75 resistors are vessel-owned and 33 stand alone (valves, shunts, airways, devices).

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `comp_from` | – | `""` | Upstream compartment (name). Positive flow goes from here to `comp_to`. |
| `comp_to` | – | `""` | Downstream compartment (name). |
| `r_for` | mmHg·s/L | 1.0 | Forward resistance (flow from `comp_from` to `comp_to`). |
| `r_back` | mmHg·s/L | 1.0 | Backward resistance. |
| `r_k` | mmHg·s²/L² | 0.0 | Turbulent (quadratic) coefficient: an extra pressure loss `r_k·flow²`. 0 in every shipped scenario. |
| `no_flow` | boolean | `false` | Closes the connection. |
| `no_flow_ext` | boolean | `false` | A second, independent closing gate for a model that does not own the resistor (an owning BloodVessel rewrites `no_flow` every step). Used by `MaternalPlacenta`. |
| `no_back_flow` | boolean | `false` | One-way connection (valve). |
| `implicit` | boolean | `false` | Numerical scheme for stiff pairs; see [Implicit flow](#implicit-flow-implicit). |
| `mix_flow` | L/s | 0.0 | Exchange without net flow; see [Mixing without net flow](#mixing-without-net-flow-mix_flow). |
| `r_factor`, `r_k_factor` | – | 1.0 | Non-persistent factors, reset to 1 every step. `r_factor` scales both `r_for` and `r_back`. |
| `r_factor_ps`, `r_k_factor_ps` | – | 1.0 | Persistent factors. |
| `r_factor_scaling_ps`, `r_k_factor_scaling_ps` | – | 1.0 | Persistent scaling factors. |

### Outputs

| Property | Unit | Default | Description |
|---|---|---|---|
| `flow` | L/s | 0.0 | Flow this step: positive forward, negative backward, 0 when closed. |
| `r_for_eff`, `r_back_eff` | mmHg·s/L | 1000 | Effective resistances after the factor layers (and the implicit correction). |
| `r_k_eff` | mmHg·s²/L² | 0 | Effective turbulent coefficient. |

### Set by other models

| Property | Unit | Default | Description |
|---|---|---|---|
| `p1_ext`, `p2_ext` | mmHg | 0.0 | Extra pressure on the inlet / outlet for this step, reset to 0 after use. On a vessel-owned connector the vessel copies its own `p1_ext`/`p2_ext` every step, so a value written on the vessel acts until it is set back to 0. |

### Internal

| Property | Description |
|---|---|
| `_comp_from`, `_comp_to` | Cached references to the two compartments. Re-resolved when `comp_from`/`comp_to` change (e.g. ECLS re-cannulation) or when the engine's `_models_version` changes (bumped at every `calculate()` call and realtime tick). |

## Calculation

`calc_model()` resolves the compartment references, then runs `calc_resistance()` → `calc_flow()` → the mixing exchange.

1. **`calc_resistance`**
   ```
   r_for_eff  = r_for  · (1 + (r_factor − 1) + (r_factor_ps − 1) + (r_factor_scaling_ps − 1))
   r_back_eff = r_back · (same three layers)
   r_k_eff    = r_k    · (1 + (r_k_factor − 1) + (r_k_factor_ps − 1) + (r_k_factor_scaling_ps − 1))
   ```
   `r_factor` and `r_k_factor` are reset to 1. With `implicit`, `dt·(E_from + E_to)` is added to both effective resistances.
2. **`calc_flow`**, with `p1 = comp_from.pres + p1_ext` and `p2 = comp_to.pres + p2_ext` (then `p1_ext`/`p2_ext` are reset):
   - closed (`no_flow` or `no_flow_ext`): `flow = 0`;
   - `p1 ≥ p2`: forward, `flow = f(p1 − p2, r_for_eff)`;
   - `p1 < p2` and not `no_back_flow`: backward, `flow = −f(p2 − p1, r_back_eff)`;
   - `p1 < p2` with `no_back_flow`: `flow = 0`;
   - a non-positive effective resistance gives `flow = 0` (guard against Infinity/NaN).

   `f(Δp, R)` solves `Δp = R·f + r_k·f²` exactly for this step:

   ```
   f = 2·Δp / (R + √(R² + 4·r_k·Δp))        (= Δp / R when r_k = 0)
   ```

   This form has no cancellation for small `r_k`. Because the loss is solved in the same step, the flow can't lag, oscillate or reverse direction.
3. **Volume transfer** (forward; mirrored for backward flow):
   ```
   not_removed = comp_from.volume_out(flow·dt)
   comp_to.volume_in(flow·dt − not_removed, comp_from)
   ```
   The upstream compartment returns what it could not supply, so a resistor never creates volume out of an empty compartment. `volume_in` also mixes the incoming blood or gas composition.
4. **Mixing**: if `mix_flow > 0` and the connection is open, an equal volume is swapped both ways (see below).

## Factor system

`r_for`/`r_back` (one shared family) and `r_k` carry the three layers, composed **additively** (see [ARCHITECTURE §7a](./ARCHITECTURE.md#7a-the-factor--effective-value-pattern)). Writers in the current code:

| Layer | Writers |
|---|---|
| `r_factor` (reset every step) | `Respiration` (airways), `Uterus`, `Heart` (`AA_COR`, systolic coronary resistance) |
| `r_factor_ps` | `Circulation`, `Brain`, `Kidneys`, `Hormones`, `Respiration`, `Surfactant`, the `Calibrator`; the user and scenarios via `setPropValue` |
| `r_factor_scaling_ps` | `ModelScaler`; the `Calibrator` (PAP lever on `IPSL`/`IPSR`); `Uterus`, `MaternalPlacenta` |

The factors of a vessel-owned connector multiply on top of the vessel's own effective resistance, which the vessel already composes from its own layers.

## Inputs and outputs

- **Reads:** `pres` of `comp_from` and `comp_to`; their elastances (`el_eff`, or `el_min_eff`/`el_max_eff`/`act_factor`) when `implicit`.
- **Writes:** the volume of both compartments (`volume_out`/`volume_in`); their composition through `volume_in` and the mixing exchange.
- **Written by:** an owning `BloodVessel` (see [Inheritance](#inheritance)); `Shunts`, `Pda`, `Placenta`, `MaternalPlacenta`, `Respiration`, `Apnea` and the devices (`no_flow`, resistances); the factor writers above.
- **Read by:** `Heart` (the mitral and aortic flows mark end-diastole and end-systole), `Mob` (`AA_COR` coronary flow), `Monitor` (its `flow_targets` read-outs), `DataCollector` watchers (the UI's flow charts).

## Assumptions and limitations

- **Resistive, not inertial.** There is no inertance: flow responds instantly to the pressure difference. Flow waveforms are shaped only by the compartments' elastances and the resistances.
- **Laminar unless `r_k` is set.** Every shipped resistor is linear (`r_k = 0`). The duct and septal shunts compute their orifice losses separately (see [Pda](./Pda.md), [Shunts](./Shunts.md), `helpers/Orifice.js`).
- **Valves are ideal switches.** A `no_back_flow` connection closes instantly at zero pressure difference. There is no valve leaflet dynamics and no regurgitation unless `no_back_flow` is false with a finite `r_back`.
- **Explicit volume update.** See [Implicit flow](#implicit-flow-implicit) for when that matters.

## Implicit flow (`implicit`)

`implicit` switches one resistor from the explicit `Δp / R` to the backward-Euler solution for the two compartments it joins, `Δp / (R + dt·(E_from + E_to))`. It does this by adding `dt·(E_from + E_to)` to `r_for_eff`/`r_back_eff` each step (`E` = the compartment's current `el_eff`, or a time-varying elastance's instantaneous value). It is a numerical scheme, not a change of the resistor law. Both forms are first-order accurate and agree when `R >> dt·ΣE`.

Explicit integration of two capacitances joined by a small resistance is stable only while `dt·(E_from + E_to)/R < 2`. For three equal capacitances in a row, as in the aorta (AA → AAR → AD, joined by `AA_AAR` and `AAR_AD`, R ≈ 70 mmHg·s/L), the limit is 4/3. Stiffening the large arteries, which a small infant's pulse pressure needs, crosses that limit at about ×2–3. Measured on the 0.72 kg Bischoff infant (AA pressure range, mmHg):

| Arterial stiffness | Explicit | Implicit `AA_AAR`, `AAR_AD` | Explicit, half time step |
|---|---|---|---|
| ×1.8 | 23.6–35.7 | 23.6–35.8 | 23.7–35.7 |
| ×3 | unstable | 21.4–39.8 | 21.5–39.6 |
| ×5 | unstable | 18.4–44.7 | 18.2–44.4 |

All 10 shipped scenarios set it on 13 resistors: the outflow valves (`LV_AA`, `RV_AA`), the aortic chain (`AA_AAR`, `AAR_AD`) and the aortic branches (`AA_COR`, `AA_BR_ART`, `AA_RUB`, `AAR_DA`, `AD_LS_ART`, `AD_KID_ART`, `AD_INT_ART`, `AD_RLB`, `AD_PL_UMB_ART`). The patient builder and the live tuner set it the same way.

## Mixing without net flow (`mix_flow`)

Flow carries upstream blood downstream (advection). Between two compartments that are really one continuous pool, blood also mixes by eddies and vortex flow, even when the net flow between them is close to zero. Molecular diffusion can't stand in for that: O2 needs minutes to diffuse a millimetre.

`mix_flow` (L/s) adds that exchange. Each step an equal volume `dv = mix_flow·dt` is swapped both ways, with no net volume change, using the pre-exchange concentrations:

```
c_a += (c_b − c_a)·dv / V_a        c_b += (c_a − c_b)·dv / V_b
```

So `c_a·V_a + c_b·V_b` is conserved:
- **Blood:** for `to2`, `tco2`, every solute and drug, and temperature ([`helpers/BloodMixing.js`](../helpers/BloodMixing.js) `exchange_blood`). Viscosity follows the haemoglobin.
- **Gas:** for the five species O2, CO2, N2, H2O and other ([`helpers/GasMixing.js`](../helpers/GasMixing.js) `exchange_gas`). This stands for molecular diffusion and cardiogenic mixing at the airway–alveolus junction, which go on without flow (in apnoea). It uses the composition at the connecting ends, so a series dead space exchanges through its distal sub-tank.

Further rules:
- `dv` is clamped to half the smaller volume.
- A `fixed_composition` end keeps its composition.
- A closed connection doesn't exchange.
- The equilibration time constant is about `V_a·V_b / ((V_a + V_b)·mix_flow)`.

Shipped values (all 10 scenarios): `RAIVCI_RASVC` 0.01 L/s (right-atrial halves), `DS_ALL` and `DS_ALR` 0.001 L/s (dead space to alveoli).

## Example definition (JSON)

From `term_neonate.json`, `models.Circulation.components.PV_LA` (trimmed). The pulmonary venous inflow to the left atrium has a backward resistance 10× the forward one:

```json
{
  "name": "PV_LA",
  "model_type": "Resistor",
  "is_enabled": true,
  "comp_from": "PV",
  "comp_to": "LA",
  "r_for": 204.8,
  "r_back": 2048.4,
  "r_k": 0,
  "no_flow": false,
  "no_back_flow": false,
  "implicit": false,
  "mix_flow": 0
}
```

## Usage in the scenarios

Term_neonate has 75: 70 `Resistor` and 5 `HeartValve` (`LA_LV`, `RV_PA`, `RV_AA`, `LV_AA`, `LV_PA`; each `r_for` 55, one-way).

- **Vessel-owned (42):** the connector into every `BloodVessel`.
- **Stand-alone (33):**
  - heart inflow (`RAIVCI_RV`, `RASVC_RV`, `PV_LA`, `IVCI_RAIVCI`, `SVC_RASVC`) and the valves;
  - shunts (`AAR_DA`, `LA_RAIVCI`, `LA_RASVC`, `VSD`, `IPSL`, `IPSR`, `RAIVCI_RASVC`);
  - coronaries (`AA_COR`, `COR_RAIVCI`, `COR_RASVC`);
  - airways (`MOUTH_DS`, `DS_ALL`, `DS_ALR`);
  - ventilator and ECLS circuit connections;
  - the umbilical vein (`PL_UMB_VEN_IVCI`).

## References

No literature-derived values in this class. The resistances are scenario parameters (see the `*Reference.md` pages). The quadratic loss is the standard Bernoulli form (Δp ∝ Q²); the shipped orifice coefficients live in `helpers/Orifice.js`.
