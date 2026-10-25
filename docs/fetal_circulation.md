# Fetal circulation scenarios

> **Scenarios removed (2026-10-25).** `fetus_25wk`, `fetus_30wk` and `fetus_term` were removed during the re-validation, to be rebuilt from scratch once term_neonate is final. This page is kept as the design record (fetal invariants, operating points, what each lever did); the files and links it names are gone.

**Current scenarios (2026-10-19/20)**, all rebuilt from the literature-validated `term_neonate` by
`node scripts/_make_fetus_validated.mjs --profile 25|30|40` (levers in `scripts/_fetal_profiles.mjs`):
- `fetus_25wk`, 25 wk, 0.7 kg (as preterm_25wk), validated against
  Fetus25wkReference (50 of 51). Size/maturity levers from preterm_25wk corrected by the
  fetus-30 / preterm-30 ratios; the heart needed less diastolic stiffness (`HEART_EL_MIN` 2.5) to keep MAP at the
  baroreflex set-point (systemic resistance was a weak lever: the placenta takes the flow). Operating point: HR 148,
  MAP 34, CVP 2.2, output ~440, RV:LV 58:42, UV 92 > IVC 80 > AA 72 > UA 68 %, umbilical flow 148, core 37.5.
- `fetus_30wk`, 30 wk, 1.5 kg, validated against
  Fetus30wkReference (49 of 51 graded rows in range); see
  [The rebuilt fetus_30wk](#the-rebuilt-fetus_30wk-2026-10-19) below;
- `fetus_term`, 40 wk, 3.545 kg (as term_neonate), validated against
  TermFetusReference (50 of 51). What differs from 30 wk: placental O₂ diffusion 10× lower
  (`dif_o2` 0.003: at term the umbilical vein stays ~30 % short of the maternal side), no RV boost
  (`cont_factor_right` 1.0, `cont_factor_left` 1.15), PVR ×0.8 on the fetal ×9.5, umbilical flow ~142 mL/kg/min.
  Operating point: HR 142, MAP 48, CVP 3.3, output ~430, RV:LV 59:41, UV 80 > IVC 68 > AA 61 > UA 57 %, core 37.5.

The sections after that describe the **earlier pair**, now in `model_definitions/archive/` and replaced by these (built from the old
term base):

| Scenario | GA | Weight | Built by |
|---|---|---|---|
| `archive/term_fetus` | 40 wk | 3.545 kg | `scripts/_make_term_fetus.mjs` (single-point transform of `term_neonate`) |
| `archive/fetus_30wk` | 30 wk | 1.35 kg | `scripts/_make_fetus.mjs 30` (per-GA transform of `term_fetus`) |

In that pipeline `term_fetus` was the anchor: it carried the fetal topology and its own fetal diagram, and
every other gestational age was derived from it by `_make_fetus.mjs`.

## The rebuilt fetus_30wk (2026-10-19)

**Route.** Live `term_neonate` → weight scaling to 1.5 kg (the placenta scaled by hand: it is outside every
scaler group) → the fetal transform of `_make_term_fetus.mjs` re-done on the live model (placenta running,
cord patent, duct and foramen wide open, intrapulmonary shunts closed, fetal PVR, inert lungs, HbF, split
right atrium, amniotic environment) → the 30-week profile (the `preterm_30wk` maturity levers as starting
points) → reseeded with the preterm renal reference (`reseed_preterm.mjs --file`) → the fetal invariants
re-asserted on the baked file. The fetal diagram is taken from the archived `fetus_30wk`.

**Operating point** (`probe_term_reference.mjs`, which reads the fetal variables when the placenta runs):

| | `fetus_30wk` | reference |
|---|---|---|
| HR / MAP / CVP | 148 / 37.6 / 4.5 | 145 / 38 (ovine) / 3 |
| PA − Ao | ~0.8 mmHg | ≈ 0 |
| combined output | ~420 mL/kg/min | 420 |
| RV : LV | 59 : 41 | 59 : 41 |
| lungs / foramen / duct / placenta | ~17 / 24 / 41 / 33 % | 20 / 21 / 39 / 28 (Kiserud ~32) |
| umbilical flow | ~140 mL/kg/min | 120 (MRI 129) |
| O₂ UV / IVC / AA / DAo=UA / SVC | 89 / ~76 / ~70 / ~65 / ~54 % | 85 / 72 / 67 / 64 / 43 |
| UV gas pO₂ / pCO₂ / pH | 41 / 36 / 7.40 | 40 / 36 / 7.40 |
| UA pCO₂ / pH, UA − UV pCO₂ | ~45 / 7.32, ~8 | 41 / 7.37, 5 |
| VO₂ (umbilical Fick) | ~6.0 mL/kg/min | 6.0 (human 5.4–8.1) |
| core temperature | 37.50 °C | 37.5 |

**What the rebuild changed against the archived pipeline:**
- **Preferential streaming.** With the right atrium split, IVC and SVC blood still mixed in the left atrium,
  because the foramen is two resistors (`LA_RAIVCI`, `LA_RASVC`). The new `Shunts.fo_svc_fraction` (0–1,
  default 0.5) sets the share of the foramen's area that opens onto the SVC part; the fetus uses 0, so only IVC
  blood crosses (AA − PA saturation gap 0.9 → ~5–6 points).
- **Ventricular dominance by filling, not by contractility.** After weight scaling the RV was as stiff as the LV;
  `cont_factor_right` 1.2 → 1.8 moved the RV share only 52.5 → 54.8 %. A more compliant RV (`RV_EL_MIN` 0.8 on
  its diastolic elastance) gave 59 : 41 with the foramen and duct shares following.
- **The oxygen balance is an umbilical Fick problem.** The cordocentesis saturations (UV 85 / UA 64) only fit
  VO₂ and umbilical flow together: VO₂ 6.0 with ~130–140 mL/kg/min of umbilical blood (placental resistances
  ×0.75). The maternal pool is set to placental-venous blood at 30 wk (`mat_to2` 5.6, `mat_tco2` 21.5:
  pCO₂ ~35), and the umbilical vein equilibrates with it.
- **The fetal brain uses more than half of the O₂** (`Metabolism` `BR_CAP` share 0.65; Sun 2015: 58 %), so SVC
  blood returns at ~54 % instead of ~57 %.
- **Thermal bookkeeping.** `Blood.get_thermal_state` now leaves out fixed-composition compartments: the
  maternal pool (pinned at 37.0 °C) had acted as a ~4 W phantom heat sink.

**Known limitations:** no ductus venosus / liver route (IVC blood is mixed before the atrium); no placental heat
path (heat leaves through the amniotic "skin" path, `Thermoregulation.h_convective` 240); fetal urine is the
preterm kidney's ~3 mL/kg/h (reference ~13); arterial pressure and RQ are ovine. `scripts/probe_fetus.mjs`
currently fails to start (it imports `BloodComposition.js` before the extensionless-import hook is
registered); `probe_term_reference.mjs` covers its panel.

## What makes a scenario "fetal"

Six properties. They are asserted by `_make_fetus.mjs` and re-asserted by `reseed_fetus.mjs` after
warm-up, because each one silently destroys the fetal circulation while the model still builds and
still prints a plausible-looking panel:

| Invariant | Why |
|---|---|
| `Placenta.placenta_running === true` | the placenta is the gas-exchange organ |
| `Placenta.umb_clamped === false` | the cord is patent |
| `Shunts.ips_res >= 1e7` | intrapulmonary shunts closed — fetal lung flow is all capillary; an open IPS adds a parallel low-resistance path that inflates pulmonary flow |
| `Pda.diameter_relative === 1.0` | the duct is fully relaxed in utero |
| `Breathing.is_enabled === false` | no ventilatory drive |
| `GASEX_LL/RL.dif_o2 === dif_co2 === 0` | the fluid-filled lung exchanges no gas. Zeroing the *constants* is what makes this stick — clearing a `BloodDiffusor`'s `is_enabled` does not survive the build |

`selectProfile`'s `isFetal()` predicate (`scripts/_probe.mjs`) sniffs the first two, which is
unambiguous across the shipped library: every neonatal and adult scenario has
`placenta_running = false, umb_clamped = true`.

## Why gestational age costs a calibration pass

**Nothing in the engine reads `model.gestational_age`.** It is metadata, consumed only by probe
range tables and the chat context string. (`Uterus`/`MaternalPlacenta` have a `preg_ga`, but that is
the *maternal* pregnancy clock and is deliberately distinct.)

**`ModelScaler.scale_to_weight()` scales volumes only** — every elastance and resistance
inverse-allometry line in it is commented out. Worse, it cannot see the placenta at all: no `PL_*`
compartment appears in any scenario's `scaler_config`.

So scaling a fetus to a new gestation is not one call. It is a hand-fitted row of levers that
compensates for what volume scaling leaves behind, which is what
[`scripts/_ga_tables.mjs`](../scripts/_ga_tables.mjs) holds. The table is the documentation for each
column; the values are **starting points refined by probe iteration**, the same status as
`_make_preterm.mjs`'s `PRETERM` table.

The three traps that cost the most time, in order:

1. **The un-scaled placenta.** Forget it and you get a 1.35 kg fetus carrying a term placenta's
   blood: 164 mL/kg fetoplacental volume instead of ~122, with the placenta holding 52% of fetal
   blood instead of 35%. The model builds and runs and looks plausible.
2. **The placenta is a large parallel low-resistance path**, so systemic resistance is a weak MAP
   lever on its own — raising SVR mostly diverts flow into the umbilical circuit (placental share
   climbs past 55%). The umbilical/fetoplacental resistances must rise with it.
3. **Absolute anatomic millimetres.** `Pda.diameter_ao_max`/`diameter_pa_max`/`length` and
   `Shunts.diameter_fo`/`atrial_septal_width` are millimetres no scaler touches.
   `Pda.diameter_relative` is a `[0..1]` *patency fraction*, not a size — conflating the two is the
   easy bug. The duct is anchored to the Szpinda regressions quoted in `Pda.js`.

## Operating points

Measured with `node scripts/probe_fetus.mjs <scenario>`, not copied from a script header.

| | `fetus_term` (40 wk) | `fetus_30wk` | human reference |
|---|---|---|---|
| HR | 146.5 bpm | 147.8 | — |
| ABP sys/dia/**map** | 67.2 / 44.0 / **55.7** | 44.6 / 32.0 / **38.3** | — |
| PAP mean | 56.9 | 39.1 | — |
| **PA − Ao** | **1.2 mmHg** | **0.8** | ≈ 0 (wide-open duct) |
| CVP | 3.8 | 2.5 | — |
| CVO | 1.341 L/min = **378 mL/kg/min** | 0.508 L/min = **376** | ~400–450 |
| **RV : LV** | **55 : 45** | **55 : 45** | ~55 : 45 (MRI) |
| RV / LV ejection fraction | 57% / 55% | ~45% / ~41% | — |
| placental share of CVO | 41% | 41% | ~30 (MRI) / ~45 (ovine) |
| **pulmonary share** | **15%** | **12%** | 11–25% |
| ductus arteriosus | 41% | 44% | 30–46% |
| foramen ovale | 30% | 33% | 27–34% |
| O₂ gradient UV / IVC / AA / AD / UA | 88 / 71 / 66 / 61 / 61 % | 89 / 70 / 65 / 59 / 59 % | — |
| umbilical-artery gas | pH 7.27, pCO₂ 50, BE −5 | pH 7.27, pCO₂ 50, BE −5 | pH ~7.35 |

Pulmonary share is deliberately **lower at 30 wk than at term**: this table follows the human MRI
reading in which pulmonary blood flow rises toward term. The Doppler literature instead has it
peaking near 30 wk, which would invert that ordering — see the `pvr` note in `_ga_tables.mjs`.

**PA ≈ Ao is a fetal invariant, and it is what the ventricular split hangs on.** With a wide-open
duct the pulmonary artery and aorta are one chamber hydraulically, so their mean pressures must
match. They previously did not (PA 62.6 vs Ao 50.1, a 12.5 mmHg gap) — see below.

The **oxygenation ordering UV > IVC > AA > AD** is the primary pass/fail: it is what streaming
through the foramen ovale and ductus venosus produces, and it collapses first when a fetal scenario
is wrong. `AD == UA` is expected — it is the same blood.

Note the shunt flows print **negative** in `probe_fetus.mjs`: `Pda.flow_pa` and `Shunts.flow_fo` are
positive for left→right, so the fetal direction (PA→Ao, R→L) is negative. A negative percentage
there is correct, not an error.

## Ventricular dominance — what actually sets it

The fetus must be RV-dominant. Both scenarios used to come out LV-dominant (48:52 and 46:54); they
now run 55:45. The diagnosis is worth recording because two of the three obvious levers do nothing.

**The split is an identity, not a free parameter:**

```
LV output = foramen flow + pulmonary venous return
```

This holds exactly at every operating point measured. So the whole question is how much crosses the
foramen — and the right atrium divides its blood between the tricuspid valve and the foramen
according to which ventricle ejects better, *not* according to the foramen's size.

**What does not work:**

- **Foramen diameter.** `res_fo` (4.24 mmHg·s/L at 6 mm) is ~13× *lower* than the tricuspid valve's
  55, so the foramen is a hole, not a resistance — the two ventricles effectively draw from a common
  atrial pressure. Measured: 6.0 → 4.4 → 3.0 mm gives 48:52 at every value. It only bites below
  2 mm and then swings violently (1 mm → 73:27). A steep unstable band is a bad calibration knob.
- **`fo_lr_factor`.** No effect on the split.
- **RV unstressed volume, on its own.** Cutting it to the LV's value raises RV ejection fraction
  25 → 34% but leaves the split at 46:54: it makes the RV both stronger *and* more compliant, so the
  right atrium still decompresses across the foramen. It is an EF knob, not a split knob.
- **The foramen's second path (`LA_RASVC`).** Carries ~1%; disabling it changes nothing. (It is still
  anatomically wrong — superior-vena-cava blood does not cross the foramen in life.)

**What does work — and why it was a bug, not a tuning gap:**

1. **The ductus arteriosus was too narrow, and it is an RV-only afterload.** Duct resistance carries
   a Bernoulli orifice term scaling as 1/area² (`Pda.js:200-210`), so a narrow duct is expensive.
   At the previously shipped 3.0 mm it cost a **12.5 mmHg PA-over-Ao gradient that only the right
   ventricle pays** — which is why the RV under-ejected and the atrial blood went left. Three things
   independently said 3.0 mm was wrong: it breaks the PA ≈ Ao invariant the probe itself checks for;
   it contradicts the Szpinda regression quoted in `Pda.js:25` (3.95 mm at 40 wk); and the
   duct-dependent lesions `hlhs` and `pa_vsd` had already overridden it to 4.0 because 3.0 cannot
   carry systemic output. Measured on `term_fetus`: 3.0 mm → 12.5 mmHg / 48:52; 3.95 → 5.0 / 50:50;
   6.0 → 1.0 / 51:49; 8.0 → −0.1 / 52:48.
2. **`Heart.cont_factor_right` supplies the remainder** (1.30 at term, 1.16 at 30 wk). Monotone and
   well-behaved, and it also pulls the foramen share down toward the human 27–34%.
   It is *mostly* independent of PVR but not entirely: at a fixed duct the split held 55:45 across
   PVR ×21 → ×9.5, yet raising the 30 wk `pvr` from 1.35 to 2.30 cost a point (55:45 → 54:46) and
   needed `cont_right` 1.11 → 1.16 to recover. Re-check the split after any PVR change.
3. **`RV.u_vol` restores a physiological ejection fraction** (33 → 57% at term). Independent of the
   split, so it is set once and left alone.

**The residual compensation.** Points 2 and 3 are still compensation for a chamber parameterisation
the fetal transform inherits from `term_neonate` unexamined: the RV ships with an unstressed volume
5.46× the LV's (4.00 vs 0.73 mL) and a *lower* `el_max` (22200 vs 27200) — correct for a neonate,
wrong for a fetus. The real repair is those chamber values, which is out of scope here because it
ripples into ~30 neonatal scenarios. The PDA family already works around the same weakness with
`cont_factor_right` between 1.52 and 5.2.

> Note the shipped `term_fetus` had drifted from its own generator header, which claimed RV:LV
> 51:49. The split appears to have crossed from RV- to LV-dominant across the new-PDA-model /
> bidirectional-shunts / HbF commits, and was never re-measured — commit `1689814` lists five
> quantities as unchanged and omits this one. **Re-measure with `probe_fetus.mjs`; do not trust a
> header.**

## Known limitations

These are inherited by every fetal scenario and are worth stating before the numbers are used for
teaching:

- **The umbilical arteriovenous CO₂ gradient is too wide.** UV pCO₂ 31 vs UA pCO₂ 50 is a 19 mmHg
  gradient where the literature is 8–10, and UA pH 7.27 is a post-labour value rather than an
  undisturbed in-utero one (cordocentesis: UA ≈ 7.35, UV ≈ 7.38). The lever is `Placenta.mat_tco2`.
- **Placental share runs sheep-like** (~41% against human MRI estimates of ~30%; the ovine figure is
  ~45%). Pulmonary, ductal and foramen shares are now all inside their human ranges, so the
  placental share is the remaining outlier. Judge a new gestation by its *delta from term* as well
  as by the absolute number.
- **CVO per kg is still nearly flat across gestation** (376 at 30 wk vs 378 at term) where human MRI
  data have it *falling* with GA, i.e. the 30 wk fetus should run clearly higher per kg. Both rose
  from ~314 once the duct and PVR were corrected, so the gap to the ~400–450 mL/kg/min literature
  figure is now small, but the gestational *trend* is still not reproduced.
- **The umbilical arteriovenous CO₂ gradient is unchanged by this work** and remains the largest
  outstanding discrepancy (see above).
- The **`Brain` compartment is now present** in both fetal scenarios. It had been missing: the
  committed `term_fetus` predated `Brain` being added to `term_neonate`, and regenerating picked it
  up. Cerebral autoregulation is enabled, but its setpoints are the neonatal ones and have not been
  re-fitted for fetal pressures — treat brain-sparing behaviour as unvalidated.

## Workflow

```bash
node scripts/_make_fetus_validated.mjs --profile 30                  # term_neonate -> fetus_30wk (fetal transform, baked)
node scripts/probe_term_reference.mjs fetus_30wk --ref scripts/reference/fetus_30wk.json   # vs Fetus30wkReference
```

Adding a gestation is a profile in `scripts/_fetal_profiles.mjs` plus a reference set
(`docs/Fetus<ga>wkReference.md`, `scripts/reference/fetus_<ga>wk.json`). The older
`_make_fetus.mjs`/`reseed_fetus.mjs` loop (from the archived `term_fetus`) is in `scripts/archive/`.

`scripts/build_patient.mjs` also understands fetal baselines — it auto-detects one, seeds from the
same `FETAL` table, skips the neonatal RDS/PDA levers, and drives pO₂/pCO₂ from
`Placenta.mat_to2`/`mat_tco2` instead of the (inert) alveolar diffusors and ventilatory drive.

> **Probes exit 0 on bad physiology.** Only a build failure exits 1. The fetal-invariant assertions
> in `_make_fetus.mjs` and `reseed_fetus.mjs` are the only real gates; everything else is a table
> you read.
