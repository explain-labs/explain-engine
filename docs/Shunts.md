# Shunts

The `Shunts` model is a thin coordinator (like [Pda](./Pda.md)) that drives the resistances of the
**non-ductal shunts** from a small set of geometric inputs. It does not hold volume or pressure
itself — it owns no sub-models of its own but writes each step onto five pre-existing `Resistor`s.

It covers three shunt families:

| Shunt | Resistors driven | Path |
|---|---|---|
| **Foramen ovale (FO)** | `LA_RAIVCI`, `LA_RASVC` | LA ↔ the two right-atrial streams (RAIVCI, RASVC) |
| **Ventricular septal defect (VSD)** | `VSD` | LV ↔ RV |
| **Intrapulmonary shunts (IPS)** | `IPSL`, `IPSR` | arterial → venous within each lung (LL_ART→LL_VEN, RL_ART→RL_VEN) |

(The ductus arteriosus is handled separately by the [Pda](./Pda.md) model.)

## Inheritance

```
BaseModelClass
  └── Shunts   (group coordinator — no compartment of its own)
```

Extends `BaseModelClass` directly. `calc_model()` computes Hagen-Poiseuille resistances and writes
them onto the referenced `Resistor`s; it has no `el_base`/`vol`/`r_for` of its own.

## What it models

The FO and VSD are openings whose resistance follows the **Hagen-Poiseuille** law from their diameter,
the septal thickness (length), and blood viscosity. Closure is expressed directly via `diameter_fo` /
`diameter_vsd` (0 mm = closed → `no_flow`). The intrapulmonary shunts are a resistance, not
diameter-driven, carrying pulmonary arterial blood to the pulmonary veins without passing ventilated
alveoli (see "What the intrapulmonary shunt stands for" below).

## Properties

### Configuration (set in the model definition)

| Property | Default | Unit | Description |
|---|---|---|---|
| `diameter_fo` | `2.0` | mm | foramen ovale diameter (0 = closed) |
| `diameter_fo_max` | `10.0` | mm | FO diameter ceiling (clamp) |
| `diameter_vsd` | `2.0` | mm | ventricular septal defect diameter (0 = closed) |
| `diameter_vsd_max` | `10.0` | mm | VSD diameter ceiling (clamp) |
| `atrial_septal_width` | `3.0` | mm | FO channel length |
| `ventricular_septal_width` | `5.0` | mm | VSD channel length |
| `fo_lr_factor` | `10.0` | — | left-to-right resistance multiplier on the FO (flap valve) |
| `fo_svc_fraction` | `0.5` | 0–1 | share of the FO's area that opens onto the SVC part of the right atrium (`LA_RASVC`); the rest opens onto the IVC part (`LA_RAIVCI`). 0.5 = two equal halves; 0 = only IVC blood crosses the foramen (fetal crista dividens) |
| `discharge_coeff_fo` | `0.7` | — | FO discharge coefficient for the Bernoulli term, `A_eff = Cd · A` (flap valve, between funnel and sharp edge) |
| `discharge_coeff_vsd` | `0.64` | — | VSD discharge coefficient for the Bernoulli term, `A_eff = Cd · A` (sharp-edged hole) |
| `ips_res` | `5000` | mmHg·s/L | intrapulmonary shunt resistance (before the resistors' own factor layers) |
| `viscosity` | `6.0` | cP | blood viscosity used in the resistance formula; read each step from `LA.viscosity` (fallback 6.0), so it follows the blood like `Pda` |

### Computed / reported (outputs)

| Property | Unit | Description |
|---|---|---|
| `res_fo` | mmHg·s/L | computed FO resistance (the whole orifice, before `fo_lr_factor`; a resistor with area share `a` gets `res_fo / a`, i.e. `2·res_fo` each at the default `fo_svc_fraction` 0.5) |
| `res_vsd` | mmHg·s/L | computed VSD resistance |
| `flow_fo` | L/s | combined FO flow (`LA_RAIVCI.flow + LA_RASVC.flow`) |
| `bernoulli_b_fo`, `bernoulli_b_vsd` | mmHg·s²/L² | orifice coefficient B of the whole FO / the VSD |
| `velocity_fo_doppler`, `velocity_vsd_doppler` | m/s | modified-Bernoulli jet velocity (signed with the flow) |
| `flow_vsd` | L/s | VSD flow |
| `velocity_fo` | m/s | FO orifice velocity from combined flow |
| `velocity_vsd` | m/s | VSD orifice velocity |

### Local (internal)

`_fo_ivci`, `_fo_svc`, `_vsd`, `_ipsl`, `_ipsr` cache the five resistor references;
`_refs_resolved`/`_refs_warned` gate the one-time resolution and the single missing-wiring warning.

## Calculation cycle (`calc_model`)

1. **Resolve references once.** `_resolve_refs()` caches `LA_RAIVCI`, `LA_RASVC`, `VSD`, `IPSL`,
   `IPSR`. If any is missing it logs a single warning and `calc_model` returns early every step (so a
   partial wiring degrades gracefully instead of throwing).
2. **Clamp diameters** to their `*_max`.
3. **Flow gating** — set `no_flow = (diameter === 0)` on the FO (`LA_RAIVCI`, `LA_RASVC`) and VSD
   resistors; an FO path whose area share is 0 (`fo_svc_fraction` 0 or 1) is closed as well.
4. **Resistances** — `res_fo`, `res_vsd` from `calc_resistance(diameter, septal_width, viscosity)`.
5. **Push resistances** to the resistors (see FO asymmetry below); IPS resistors get the constant
   `ips_res`.
6. **Read back flows** and compute orifice velocities (`Q/A`).

## Foramen ovale: flap-valve asymmetry and the split path

The FO is driven through **two** resistors (`LA_RAIVCI`, `LA_RASVC`) because the model splits the
right atrium into an IVC-stream and an SVC-stream. The two resistors share the orifice's area:
`a_svc = fo_svc_fraction` for `LA_RASVC` and `a_ivci = 1 − fo_svc_fraction` for `LA_RAIVCI`. A share `a`
carries the viscous resistance `res_fo / a` and the Bernoulli coefficient `B / a²` (B scales with
1/area²), so the pair together always equals one FO of `diameter_fo`:

```
r_back = res_fo / a + (B / a²) · |Q|    (RA → LA, easy)
r_for  = r_back · fo_lr_factor          (LA → RA, restricted)
```

At the default 0.5 each resistor gets `2·res_fo` and `4·B`, the original two equal halves (bit-identical).

**Preferential streaming (`fo_svc_fraction` 0).** With the split atrium closed (`RAIVCI_RASVC`
`no_flow`), the two right-atrial streams can still mix *in the left atrium*: SVC blood crossing
`LA_RASVC` meets IVC blood from `LA_RAIVCI` there. In the first `fetus_30wk` build a third of the foramen
flow came from the SVC part and the ascending aorta was only 0.9 saturation points above the pulmonary
artery (54.3 vs 53.4 %). In the fetus the crista dividens lets almost no SVC blood cross the foramen.
`fo_svc_fraction` 0 opens the whole foramen onto the IVC part: the AA − PA gap rose to 6.0 points
(57.6 vs 51.6 %; reference ~8, 67 vs 59) with the pressures, the output and its distribution unchanged.

`fo_lr_factor` (default 10, often higher in scenarios — e.g. 25) makes left-to-right flow much harder
than right-to-left, reproducing the **flap-valve** behaviour: in fetal/transitional physiology the FO
shunts right-to-left, and reverses only under raised left-atrial pressure.

**Echo-measured diameters.** When `diameter_fo` comes from an echo, it is the colour-jet diameter of
the opening that actually conducts. The flap's restriction is then already in the measured diameter,
so the postnatal `term_neonate` (and patients built from it) use `fo_lr_factor` 1. With 25 an FO was
almost a one-way valve: 5 mm gave Qp:Qs 0.99 and a Doppler peak of 0.2 m/s. Neonatal echo shows a
predominantly left-to-right shunt in most term newborns (Hiraishi 1991, doi 10.1136/hrt.65.1.41) and a
measurable Qp:Qs above ~3 mm (Evans & Iyer 1994, doi 10.1016/s0022-3476(94)70079-6). With 1, a 3 mm FO
carries ~18 mL/kg/min (Qp:Qs 1.04, Doppler peak 0.66 m/s) and 5 mm ~32 mL/kg/min (Qp:Qs 1.14). Fetal
and transitional scenarios keep a high factor.

**term_neonate (calibrated assumption, 2026-10):**
- `diameter_fo` 1.5 mm (was 0, closed): a small left-to-right PFO carrying ~6 mL/kg/min (Qp:Qs ~1.03)
- the basis:
  - a PFO is the rule in the first days (none closed by day 3 in He 2011)
  - neonatal CMR measures RV output a few mL/kg/min above LV output with the duct closed (Jhaveri
    2023, Groves 2011)
- the open PFO lets the scenario shunt right-to-left at atrial level when right pressures rise
- see `scripts/_fix_term_fo.mjs` and [TermNeonateReference](./TermNeonateReference.md)

> **Modelling note.** Until the engine review, each of the two parallel resistors carried the full
> `res_fo`, so the FO's effective resistance was `res_fo / 2`: twice the conductance its diameter
> implies. Scenarios fitted before the fix were compensated by scaling `diameter_fo` by 2^(1/4) ≈ 1.19
> (Poiseuille R ∝ d⁻⁴). `velocity_fo` is computed from the **combined** flow
> (`LA_RAIVCI.flow + LA_RASVC.flow`) over the single-orifice area from `diameter_fo`.

## Velocity outputs

```
area     = π · (diameter_mm · 1e-3 / 2)²          [m²]
velocity = (flow_L/s · 1e-3) / area               [m/s]   (0 when area = 0)
```

`velocity_fo` uses the summed FO flow; `velocity_vsd` uses the VSD flow.

## Resistance formula — `calc_resistance(diameter, length, viscosity)`

Standard Hagen-Poiseuille for a uniform cylinder:

```
R = (8 · μ · L) / (π · r⁴)        in Pa·s/m³   →  × 0.00000750062  →  mmHg·s/L
```

with diameter/length in mm and viscosity in cP. Returns the sentinel `1e8` (no flow) when
`diameter ≤ 0` or `length ≤ 0`. (This is a private copy of the same formula [Pda](./Pda.md) uses.)

## Orifice (Bernoulli) loss

A restrictive FO or VSD is limited by its orifice, not only by viscous friction: Doppler measures the
gradient as ΔP = 4v². On top of the Poiseuille resistance each defect carries the same quadratic
orifice term as [Pda](./Pda.md), from the shared [`helpers/Orifice.js`](../helpers/Orifice.js):

```
ΔP = R·Q + B·Q²,    B = K_BERNOULLI / A_eff²,   A_eff = Cd · π(d/2)²  (Cd: FO 0.7, VSD 0.64)
```

The quadratic term is linearised semi-implicitly as a flow-dependent resistance `B·|Q_prev|`
(unconditionally stable). For the FO each of the two parallel resistors carries half the area, so
it gets `2·res_fo + 4·B_fo·|q_i|`; the VSD gets `res_vsd + B_vsd·|q|`. `velocity_fo_doppler` /
`velocity_vsd_doppler` give the jet velocity `√(B·Q²/4)` with the sign of the flow.

Effect on `term_neonate` with a VSD opened (60 s):

| VSD | Qp:Qs | peak LV−RV | peak jet (4v²) | before the orifice term |
|---|---|---|---|---|
| 3 mm | 1.34 | 26 mmHg | 2.5 m/s (25 mmHg) | Qp:Qs 1.98, peak gradient 14 mmHg |
| 5 mm | 1.59 | 31 mmHg | 2.8 m/s (32 mmHg) | Qp:Qs 1.97, peak gradient 2 mmHg |

Before, every VSD from 3 mm up behaved as unrestrictive; now the shunt depends on the defect size.

## Example definition (JSON)

From `term_neonate.json` (a healthy term neonate: small PFO, VSD closed):

```json
{
  "name": "Shunts",
  "description": "shunts (FO, ASD, VSD) model",
  "model_type": "Shunts",
  "is_enabled": true,
  "diameter_fo": 1.5,
  "diameter_fo_max": 10,
  "diameter_vsd": 0,
  "diameter_vsd_max": 10,
  "atrial_septal_width": 3,
  "ventricular_septal_width": 5,
  "fo_lr_factor": 1,
  "viscosity": 6,
  "ips_res": 25000
}
```

## Usage in the model

- A healthy term neonate runs with `diameter_fo = 0` and `diameter_vsd = 0` (closed); transitional and
  congenital scenarios open them (e.g. patent foramen ovale, muscular/perimembranous VSD).
- The fetal scenario keeps the FO open with a high `fo_lr_factor` so it shunts right-to-left, matching
  fetal circulation (see [Placenta](./Placenta.md) and the term-fetus scenario).
- `IPSL`/`IPSR` carry the intrapulmonary shunt independent of the septal defects; raising/lowering
  `ips_res` tunes the shunt fraction. The gestational-age seed and RDS bundles of the patient builder
  set it (lower in sicker lungs), [Surfactant](./Surfactant.md) modulates it through the resistors'
  `r_factor_ps`, and the builder's oxygen and pulmonary-resistance levers move it (see
  [Calibrator](./Calibrator.md)).

## What the intrapulmonary shunt stands for

Mostly **venous admixture from perfused but unventilated lung**: atelectatic, fluid- or
meconium-filled units in RDS, meconium aspiration or pneumonia. Truly anatomic channels are small
in a normal lung, but intrapulmonary arteriovenous anastomoses bypassing the capillaries can be
open in BPD, alveolar capillary dysplasia, CDH and meconium aspiration
([Galambos et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC3960909)).

Consequences for how it should behave:

- **Pulmonary hypertension on its own does not raise it.** The hypoxaemia of PPHN comes from
  right-to-left flow across the duct and foramen ovale. In pulmonary vascular disease, inert-gas
  measurements find little shunt despite very high resistance; hypoxaemia there comes mainly from low
  mixed-venous oxygen ([Dantzker & Bower, JCI 1979](https://www.jci.org/articles/view/109542)).
- **Its vessels belong to the same vascular bed and are, if anything, more constricted** (hypoxic
  vasoconstriction, narrowed extra-alveolar vessels at low lung volume). That is why intravenous
  vasodilators increase intrapulmonary shunt, while inhaled NO, which reaches only ventilated
  units, lowers it. So a general change in pulmonary vascular tone should move `IPSL`/`IPSR` along
  with the bed. The builder's pulmonary-resistance lever does this.
- **A modest rise at very high pressure is plausible:** raised pulmonary vascular pressure blunts
  hypoxic vasoconstriction (Benumof & Wahrenbrock, J Appl Physiol 1975). The model does not
  represent that.

## Notes & caveats

- **`diameter_fo` is NOT the lever for the atrial split.** At fetal sizes `res_fo` is ~13x lower
  than the tricuspid valve's resistance, so the foramen is a hole rather than a restriction and the
  two ventricles draw from a common atrial pressure. Measured on the fetal scenarios, 6.0 -> 3.0 mm
  moves RV:LV by 0 points; it only bites below 2 mm, where it swings violently (1 mm -> 73:27).
  `fo_lr_factor` likewise has no effect on the split. What sets it is which ventricle ejects better
  — see [fetal_circulation.md](./fetal_circulation.md).
- **`diameter_fo` and `atrial_septal_width` are absolute millimetres that no scaler touches.**
  `atrial_septal_width` is the length term in the foramen's resistance law, so leaving it at term
  thickness in a scaled-down body makes the foramen artificially restrictive; see
  [fetal_circulation.md](./fetal_circulation.md).
- **References resolve only once.** After the five resistors are cached, they are never re-resolved; a
  model added/removed at runtime would not be picked up. Missing wiring at first call is reported with
  a single console warning.
- **`viscosity` is a static input here** — unlike [Pda](./Pda.md) (which pulls it from its capacitance
  each step), `Shunts.viscosity` is whatever the definition sets and does not track hematocrit.
- **IPS resistance is fixed.** `IPSL`/`IPSR` always receive `ips_res`; there is no diameter or
  flow-gating on them.
