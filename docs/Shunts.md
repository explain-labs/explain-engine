# Shunts

`Shunts` sets the resistances of the cardiac and pulmonary shunt pathways other than the duct:
- the **foramen ovale** (FO), from its diameter: viscous Poiseuille loss plus a Bernoulli orifice loss, with an optional flap-valve asymmetry;
- the **ventricular septal defect** (VSD), the same way;
- the base resistance of the **intrapulmonary shunts** (IPSL, IPSR).

It also reports the shunt flows and velocities. The ductus arteriosus is [Pda](./Pda.md).

## Physiology

- **Foramen ovale.** In the fetus it carries oxygenated IVC blood from the right atrium into the left heart. After birth left-atrial pressure rises, and the flap closes against the septum, functionally at first. Most term newborns still have a small, mostly left-to-right patent foramen ovale (PFO) in the first days. When right-sided pressures rise (pulmonary hypertension), it can shunt right-to-left and cause desaturation.
- **VSD.** A hole in the ventricular septum. Flow through it is set by its size and by the pressure difference between the ventricles. A restrictive VSD keeps a high-velocity jet; a large one lets the ventricles equalise.
- **Intrapulmonary shunt.** Blood that crosses the lungs without meeting ventilated alveoli. Mostly it is venous admixture from perfused but unventilated lung (atelectasis, RDS, meconium, pneumonia); true anatomical channels are small in a normal lung, but can open in BPD, alveolar capillary dysplasia, CDH or meconium aspiration (Galambos). It is a major cause of hypoxaemia in lung disease.

## Inheritance

```
BaseModelClass
  └── Shunts
```

## Properties

### Config (set in the definition JSON)

| Property | Unit | Default | Description |
|---|---|---|---|
| `diameter_fo` | mm | 2.0 | Foramen ovale diameter; 0 = closed. term_neonate 1.5, term fetus 6.0, 25 wk 0.75. |
| `diameter_fo_max` | mm | 10.0 | Upper clamp. |
| `atrial_septal_width` | mm | 3.0 | Length of the FO channel in the Poiseuille law. |
| `fo_lr_factor` | – | 10.0 | Left-to-right resistance multiplier (flap valve). **1 in every shipped scenario.** |
| `fo_svc_fraction` | – | 0.5 | Share of the FO area opening onto the SVC half of the right atrium (`RASVC`); the rest opens onto `RAIVCI`. 0 in the fetal scenarios (crista dividens). |
| `discharge_coeff_fo` | – | 0.7 | Discharge coefficient of the FO orifice (between funnel and sharp edge). |
| `diameter_vsd` | mm | 2.0 | VSD diameter; 0 = closed (0 in every shipped scenario). |
| `diameter_vsd_max` | mm | 10.0 | Upper clamp. |
| `ventricular_septal_width` | mm | 5.0 | Length of the VSD channel. |
| `discharge_coeff_vsd` | – | 0.64 | Discharge coefficient of the VSD (sharp-edged hole). |
| `ips_res` | mmHg·s/L | 5000 | Base resistance of each intrapulmonary shunt resistor. term_neonate 20 400, 25 wk 10 500, fetal 10⁸ (closed). |

### Outputs

| Property | Unit | Description |
|---|---|---|
| `flow_fo` | L/s | FO flow, both paths together; positive = left-to-right. |
| `flow_vsd` | L/s | VSD flow; positive = LV to RV. |
| `res_fo`, `res_vsd` | mmHg·s/L | Viscous (Poiseuille) resistance of the whole orifice. |
| `bernoulli_b_fo`, `bernoulli_b_vsd` | mmHg·s²/L² | Orifice coefficient `B` (see [Orifice](./Orifice.md)). |
| `velocity_fo`, `velocity_vsd` | m/s | Mean velocity through the anatomic area (continuity). |
| `velocity_fo_doppler`, `velocity_vsd_doppler` | m/s | Jet velocity through the vena contracta, what Doppler measures. |

### Set by other models

| Property | Unit | Description |
|---|---|---|
| `viscosity` | cP | Read from the left atrium every step (it follows the haematocrit); 6.0 if no LA. |

## Calculation

Each step, after resolving its five resistors once (`LA_RAIVCI`, `LA_RASVC`, `VSD`, `IPSL`, `IPSR`; a missing one gives a single warning and the model skips):

1. **Gates.** A diameter of 0 sets the resistor's `no_flow`. An FO path whose area share is 0 is closed too.
2. **Resistances.** For each orifice of diameter `d` and length `L`:
   ```
   res = 8·η·L / (π·r⁴)                      Poiseuille, converted to mmHg·s/L
   B   = K_BERNOULLI / (Cd·π·r²)²            orifice loss, see Orifice
   ```
3. **Foramen ovale, split over two resistors.** The FO opens onto both halves of the right atrium, with area shares `a` (`fo_svc_fraction` and its complement). Each path gets
   ```
   r_back = res_fo / a + (B_fo / a²) · |Q_path,prev|        right → left
   r_for  = r_back · fo_lr_factor                           left → right
   ```
   so the two paths together behave exactly as one orifice of `diameter_fo`.
4. **VSD:** `r = res_vsd + B_vsd·|Q_prev|`, both directions.
5. **Intrapulmonary shunts:** `r_for = r_back = ips_res` on `IPSL` and `IPSR`.
6. **Outputs:** flows from the resistors, `velocity = Q / area`, `velocity_doppler = jet_velocity(B, Q)`.

**The Bernoulli term is linearised with the previous step's flow** (`B·|Q_prev|` added to the resistance), as in Pda. This is semi-implicit and stable for restrictive defects. It differs from the exact quadratic only by the flow's change in one 0.5 ms step (~1 % of the Bernoulli term in a pulsatile shunt). `Resistor.r_k` could solve the quadratic exactly, but it has a single coefficient for both directions, so it couldn't carry the flap's left-to-right factor.

## Factor system

None of its own. It writes the **base** `r_for`/`r_back` of its resistors every step. Other models modulate them through the resistors' layers:
- `Surfactant`: `IPSL`/`IPSR.r_factor_ps` (derecruitment);
- `Respiration`: `IPSL`/`IPSR.r_factor` (atelectasis and hypoxic vasoconstriction, non-persistent);
- the `Calibrator`: `IPSL`/`IPSR.r_factor_scaling_ps` and `ips_res`.

## Inputs and outputs

- **Reads:** `LA.viscosity`; the flows of its five resistors.
- **Writes:** `r_for`, `r_back`, `no_flow` of `LA_RAIVCI`, `LA_RASVC`, `VSD`; `r_for`, `r_back` of `IPSL`, `IPSR`.
- **Written by:** the user and scenario generators (diameters, `ips_res`); the `Calibrator` (`ips_res`).
- **Read by:** `Monitor` (`fo_flow`), `DataCollector` watchers, `scripts/probe_*` (Qp:Qs, Doppler).

## Assumptions and limitations

- **Echo-measured diameter, no flap.** All scenarios use `fo_lr_factor` 1: a diameter from an echo colour jet already reflects the flap's restriction. With 25, an FO was almost one-way (5 mm: Qp:Qs 0.99, Doppler 0.2 m/s). With 1, a 3 mm FO carries ~18 mL/kg/min (Qp:Qs 1.04, Doppler 0.66 m/s) and 5 mm ~32 mL/kg/min (Qp:Qs 1.14). Hiraishi 1991 finds a predominantly left-to-right PFO in most term newborns; Evans & Iyer 1994 a measurable Qp:Qs above ~3 mm.
- **The foramen is not the lever for the fetal ventricular split.** At fetal sizes `res_fo` is ~13× below the tricuspid valve's resistance, so the two ventricles draw on a common atrial pressure. 6 → 3 mm moves RV:LV by 0 points; only below 2 mm does it bite, and then violently (1 mm: 73:27). See [fetal_circulation](./fetal_circulation.md).
- **Absolute millimetres, not scaled.** `diameter_*` and the septal widths are set per scenario; no scaler touches them. Leaving `atrial_septal_width` at term thickness in a small body makes the foramen restrictive.
- **Intrapulmonary shunt behaviour.**
  - Pulmonary hypertension on its own shouldn't raise it: the hypoxaemia of PPHN comes from right-to-left flow across the duct and foramen, and in pulmonary vascular disease inert-gas studies find little shunt (Dantzker & Bower 1979).
  - Its vessels belong to the same bed, so a general change in pulmonary tone should move IPSL/IPSR with it; the builder's PVR lever does this.
  - The blunting of hypoxic vasoconstriction at very high pulmonary pressure (Benumof & Wahrenbrock 1975) isn't modelled.
- **References resolve once.** A resistor added or removed at runtime is not picked up.

## Example definition (JSON)

From `term_neonate.json`, `models.Shunts` (trimmed to the config props; `components` holds the five resistors):

```json
{
  "name": "Shunts",
  "model_type": "Shunts",
  "is_enabled": true,
  "diameter_fo": 1.5,
  "atrial_septal_width": 3,
  "fo_lr_factor": 1,
  "fo_svc_fraction": 0.5,
  "discharge_coeff_fo": 0.7,
  "diameter_vsd": 0,
  "ventricular_septal_width": 5,
  "discharge_coeff_vsd": 0.64,
  "ips_res": 20402.6
}
```

## Usage in the scenarios

One instance in every scenario. It owns `LA_RAIVCI`, `LA_RASVC` (LA → right-atrial halves), `VSD` (LV → RV), `IPSL` (`LL_ART` → `LL_VEN`) and `IPSR` (`RL_ART` → `RL_VEN`).

**term_neonate calibration (2026-10):**
- **Foramen:** `diameter_fo` 1.5 mm, a small left-to-right PFO of ~6 mL/kg/min (Qp:Qs ~1.03). Basis: no PFO has closed by day 3 (He 2011), and neonatal CMR finds RV output a few mL/kg/min above LV output with the duct closed (Jhaveri 2023, Groves 2011). It also lets the scenario shunt right-to-left at atrial level when right-sided pressures rise. See `scripts/_fix_term_fo.mjs` and [TermNeonateReference](./TermNeonateReference.md).
- **Fetal scenarios:** `fo_svc_fraction` 0, the crista dividens. Before that, a third of the foramen flow came from the SVC half, and the aorta was only 0.9 saturation points above the pulmonary artery; with it the gap is 6.0 points (reference ~8). They also close the intrapulmonary shunts (`ips_res` 10⁸).

## References

- Hiraishi S, et al. *Heart* 1991. doi:10.1136/hrt.65.1.41 (PFO flow in term newborns).
- Evans N, Iyer P. *J Pediatr* 1994. doi:10.1016/s0022-3476(94)70079-6 (atrial shunting and Qp:Qs).
- Dantzker DR, Bower JS. *J Clin Invest* 1979, [jci.org/articles/view/109542](https://www.jci.org/articles/view/109542) (gas exchange in pulmonary vascular disease).
- Benumof JL, Wahrenbrock EA. *J Appl Physiol* 1975 (pulmonary vascular pressure and hypoxic vasoconstriction).
- Galambos C, et al. [PMC3960909](https://pmc.ncbi.nlm.nih.gov/articles/PMC3960909) (intrapulmonary arteriovenous anastomoses).
