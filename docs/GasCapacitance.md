# GasCapacitance

A `GasCapacitance` is a compliant gas compartment: the mouth, the airway dead space, the alveoli, and the gas lines of the ventilator and the ECLS oxygenator. On top of [Capacitance](./Capacitance.md)'s pressure–volume behaviour it carries a gas composition (O2, CO2, N2, water vapour, other), absolute pressure, temperature and humidity. Gas mixes in with every inflow, is warmed and humidified by the wall, and expands and contracts with temperature (ideal gas law). The airway dead space can carry its gas as a plug through a chain of sub-tanks instead of one well-mixed volume.

## Physiology

Air moves into the lungs because the alveolar pressure falls below the pressure at the mouth. On the way it is warmed and saturated with water by the airway lining; the heat and water come from the body. The first gas to reach the alveoli is the gas left in the **dead space** (the conducting airways) from the last expiration, rich in CO2. Only the part of each breath beyond the dead-space volume brings fresh gas, so alveolar ventilation = (tidal volume − dead space) × rate. With very small breaths, as in high-frequency oscillation, gas transport depends on dispersion along the airways rather than bulk flow.

Partial pressures follow Dalton's law: each gas's share of the molecules times the total pressure. The capnograph at the airway opening sees the gas at the mouth end of the dead space.

## Inheritance

```
BaseModelClass
  └── Capacitance
        └── GasCapacitance
```

## Properties

Volume, unstressed volume, elastances and their factor layers, `pres_ext` and `fixed_composition` come from [Capacitance](./Capacitance.md#properties). `fixed_composition: true` makes an **infinite reservoir**: volume, composition, temperature and water all stay constant (MOUTH, `VENT_GASIN`, `ECLS_GAS_SOURCE`).

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `pres_atm` | mmHg | 760 | Atmospheric pressure; set by [Gas](./Gas.md). |
| `target_temp` | °C | 0 | Temperature the wall warms the gas toward; set by Gas (and, for the body-warmed compartments, from core temperature). |
| `humidity` | fraction | 1.0 | How wet the wall is: the relative humidity evaporation can reach (airway mucosa 1, dry gas line 0, MOUTH 0.5). |
| `temp_tc` | s | 1.0 | Thermal equilibration time constant. |
| `h2o_tc` | s | 0.2 | Water vapour equilibration time constant. |

### Config: series dead space (set by Respiration and the Ventilator)

| Property | Unit | Default | Description |
|---|---|---|---|
| `series_segments` | – | 1 | Number of composition sub-tanks; 1 = well mixed. DS: 32 in every scenario. |
| `distal_models` | list | `[]` | Neighbours at the distal end (DS: `ALL`, `ALR`). |
| `dispersion_coeff` | – | 0 | Flow-driven (Taylor-type) axial dispersion strength. DS: 0.015. |
| `dispersion_tau_max` | s | 0.1 | Cap on the one-way flow time in the dispersion term. |
| `diffusion_rate` | L/s per interface | 0 | Flow-independent (molecular) exchange. DS: 1e-5. |
| `tube_port_model` | – | `""` | Neighbour reached through the ET-tube lumen (the ventilator circuit); set by the Ventilator. |
| `tube_volume` | L | 0 | Rigid ET-tube lumen ahead of the tube port: π r² L while intubated, 0 otherwise (4 mm × 110 mm = 1.4 mL). |
| `tube_segments` | – | 3 | Sub-tanks of the tube lumen. |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `pres` | mmHg | Absolute pressure: recoil + `pres_ext` + `pres_atm`. |
| `pres_rel` | mmHg | Pressure relative to atmospheric (airway / alveolar pressure as a clinician reads it). |
| `temp` | °C | Gas temperature. |
| `ctotal` | mmol/L | Total gas concentration. |
| `co2`, `cco2`, `cn2`, `ch2o`, `cother` | mmol/L | Concentrations per species. |
| `po2`, `pco2`, `pn2`, `ph2o`, `pother` | mmHg | Partial pressures. |
| `fo2`, `fco2`, `fn2`, `fh2o`, `fother` | – | Fractions of the (wet) gas. |

With series dead space on, the partial pressures and fractions are those of the **airway-opening** sub-tank (what a capnograph samples); the concentrations are the bulk mean.

## Calculation

Each step (`calc_model`):

1. **`add_heat`** (not for fixed compartments). Relax `temp` toward `target_temp`: `dT = (target − temp) · min(1, dt/temp_tc)`. The gas expands by `dV = n·R·dT / p` and every concentration dilutes by `V₀/V₁` (heating moves no molecules). The sensible heat drawn from the wall, `n · 29.1 J/(mol·K) · dT`, is metered.
2. **`add_watervapour`** (not for fixed compartments). Asymmetric target:
   - **evaporate** up to `humidity × SVP(temp)` (see [Units](./Units.md));
   - **condense** only out of supersaturation, down to `SVP(temp)`;
   - in between, the wall is neither source nor sink (a dry gas line doesn't dehumidify wet gas).

   The water concentration for the target is solved directly and approached with `min(1, dt/h2o_tc)`. Dry species dilute (or concentrate) by `V₀/V₁`. The latent heat, 43.4 kJ/mol, is metered; condensing returns it.
3. With series dead space: the same change is replayed on every sub-tank, then dispersion and diffusion between sub-tanks.
4. **Elastances, volumes, pressure** (Capacitance): `pres = recoil + pres_ext + pres_atm`; `pres_ext` is reset.
5. **`calc_gas_composition`:** `ctotal` = sum of the species; partial pressure = (c / ctotal) × `pres`; fractions likewise.

**Mixing (`volume_in`).** An inflow of `dvol` from a neighbour mixes in by volume: `c = (c·V + (c_in − c)·dvol) / V`, and the same for temperature. Before that:
- A **fixed-composition receiver** stays unchanged.
- **Gas from a pressurised fixed source** (e.g. the 1160 mmHg ventilator supply) is rescaled by `P_here / P_source`, so it arrives at the receiver's molar density; fractions are unchanged.
- **Between two ordinary compartments there is no rescaling,** so every molecule the donor loses arrives (rescaling there lost ~1 % of VO2 per transfer).

The incoming parcel keeps its temperature; `add_heat` handles the thermal expansion.

**Respiratory heat.** The metered heat (`_q_wall_sensible`, `_q_wall_latent`, signed: cooling and condensation credit the wall) is collected by `Gas.drain_respiratory_heat()` for Thermoregulation.

## Series dead space

A single well-mixed compartment is a poor dead space: mixing makes part of it "ventilated", so its effective dead space barely grows with its volume, and oscillatory flow (HFOV) is perfectly mixed every cycle. With `series_segments > 1` the compartment keeps **one pressure/volume node** (the network is unchanged) but carries its composition through a chain of sub-tanks, proximal → distal:

```
[ tube lumen sub-tanks (rigid, only while intubated) ] [ DS sub-tanks (share vol equally) ]
  ^ tube port (VENT_GASCIRCUIT)                        ^ airway port (MOUTH, leak)   distal port ^ (ALL, ALR)
```

- **Ports.** A neighbour in `distal_models` connects at the distal end; `tube_port_model` through the rigid tube sub-tanks; anything else (mouth, tube leak) at the proximal DS end.
- **Advection.** An inflow enters its end and every DS sub-tank grows by dvol/n, pushing gas along. An outflow leaves from the receiver's end. The donor side runs through `_seg_take`, called by the receiver's `volume_in`, so resistors need no changes.
- **Dispersion.** Neighbouring sub-tanks exchange `e = dispersion_coeff · q² · τ · dt / V_seg`: Taylor-type `u²·τ` dispersion written per segment (no airway geometry needed). τ is the time flow has run one way, capped at `dispersion_tau_max`, so fast oscillation disperses in proportion to f·Vt². Mass-conserving between unequal sub-tanks.
- **Molecular diffusion** (`diffusion_rate`) acts also without flow, so the dead space keeps mixing during apnoea.
- **Ends.** `_end_conc(neighbour)` / `_end_add(neighbour, dn)` read and change the sub-tank facing a neighbour; the gas `mix_flow` of a [Resistor](./Resistor.md#mixing-without-net-flow-mix_flow) uses them.
- **Bulk.** The bulk concentrations equal the mean of the DS sub-tanks, so heat, water and the gas law work unchanged.

The sub-tank count is fixed at 32: 8 → 16 → 32 still changed HFOV PaCO2 (numerical dispersion), so the dispersion term carries the transport. Runtime cost +7–9 %. `scripts/probe_dead_space.mjs` checks it.

## Factor system

[Capacitance](./Capacitance.md#factor-system)'s additive layers on `el_base`, `el_k` and `u_vol`. Surfactant, atelectasis and the Calibrator act on the alveoli through them.

## Inputs and outputs

- **Reads:** neighbours' composition and temperature (through `volume_in`); `pres_ext` written by others.
- **Written by:**
  - [Gas](./Gas.md) (`pres_atm`, `temp`, `target_temp`, `humidity`, composition);
  - [Respiration](./Respiration.md) (series dead space on DS);
  - the Ventilator (`tube_volume`, `tube_port_model`);
  - Breathing and the thorax coupling (`pres_ext`);
  - GasExchanger (`co2`, `cco2`);
  - the devices (their own gas lines).
- **Read by:** GasExchanger (alveolar pO2/pCO2), Monitor (etCO2, airway pressure), the Ventilator, `DataCollector` watchers.

## Assumptions and limitations

- **The airway wall is an unlimited water source.** Water loss isn't tracked; the heat is (metered for Thermoregulation). Condensate leaves the system.
- **Brief supersaturation on expiration is real.** Condensation lags (`h2o_tc`), so the dead space can sit slightly above 100 % RH while warm alveolar gas flows into it. In term_neonate_72h it swings between ~68 % and 102 % RH over a breath (22–35 °C). Sample a full cycle.
- **Humidifying inspired gas barely changes alveolar gas,** correctly: MOUTH 50 → 100 % RH moves alveolar pH2O ~0.2 mmHg, because the airway saturates the gas anyway. The clinical benefit of a humidifier (sparing the mucosa) has nothing to attach to, since the wall has no water debt.
- **Fixed-composition compartments don't self-correct.** Their temperature and humidity change only through `Gas.set_temperature` / `set_humidity`, which rebuild the composition.
- **No water or heat crosses the blood–gas barrier.**
- **Ideal gas, single heat capacity** (air's 29.1 J/(mol·K), also for water vapour).
- **Pressures are absolute.** Compare against `pres_atm`, or use `pres_rel`.

## Example definition (JSON)

From `term_neonate_72h.json`, `models.Respiration.components.ALL` (trimmed to the config props; `target_temp` rounded):

```json
{
  "name": "ALL",
  "model_type": "GasCapacitance",
  "is_enabled": true,
  "fixed_composition": false,
  "u_vol": 0.04,
  "el_base": 331.94,
  "el_k": 0,
  "pres_atm": 760,
  "target_temp": 36.99,
  "humidity": 1,
  "temp_tc": 1,
  "h2o_tc": 0.2,
  "series_segments": 1
}
```

## Usage in the scenarios

Ten instances in every scenario:

| Compartment | Role | Notes |
|---|---|---|
| `MOUTH` | Room air | fixed, 20 °C, 50 % RH |
| `DS` | Airway dead space | 32 series sub-tanks, 32 °C, 100 % RH |
| `ALL`, `ALR` | Left and right alveoli | 37 °C, 100 % RH |
| `VENT_GASIN`, `VENT_GASCIRCUIT`, `VENT_GASOUT` | Ventilator supply, circuit, exhaust | `VENT_GASIN` fixed (pressurised source) |
| `ECLS_GAS_SOURCE`, `ECLS_GAS_OXY`, `ECLS_GAS_OUT` | Oxygenator sweep gas | source fixed |

## References

- Taylor GI. Dispersion of soluble matter in solvent flowing slowly through a tube. *Proc R Soc Lond A* 1953;219:186–203 (the `u²·τ` dispersion form).
