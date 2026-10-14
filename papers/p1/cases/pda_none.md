Build a virtual patient that reproduces the "no PDA" column of the patent-ductus-arteriosus validation of the paper "An integrated model for simulation of neonatal physiology — the cardiovascular system" (Antonius et al., Pediatric Research), section 3.1.2, Table 3.

Start from the bundled baseline scenario `bischoff_cohort` (the Bischoff et al. 2021 cohort infant: about 25 weeks, 720 g, day 1, spontaneously breathing on CPAP with FiO2 0.26). Do not add a gestational age to this baseline; it already carries the prematurity adjustments.

From the paper: "Bischoff et al. provide detailed neonatal hemodynamic data, making PDA a suitable validation case. Table 3 summarizes the effects of absent, bidirectional, and significant left-to-right shunting on left ventricular output (LVO), right ventricular output (RVO), superior vena cava flow (SVCF), and the LVO/RVO ratio. EXPLAIN's model parameters were rescaled to match the baseline premature infant physiology reported by Bischoff et al. by adjusting blood volume, unstressed volumes, elastances, and resistances proportional to weight, with minor additional tuning of arterial resistances. Simulations used active circulatory control, a small foramen ovale, and end-expiratory conditions."

This case is the column without a ductal shunt: the ductus arteriosus is closed. Table 3, "no PDA" column (flow rates in mL·min⁻¹·kg⁻¹):

| Quantity | Target (Bischoff et al.) | EXPLAIN (paper) |
|---|---|---|
| LVO | 169.7 ± 43.7 | 179 |
| RVO | 170.3 ± 39.1 | 179 |
| LVO/RVO | 0.996 | 1.0 |
| SVCF | 73.4 ± 29.4 | 74 |

Please build the patient so that it matches the paper's simulation column as closely as the builder's targets allow, using every reported value you can express as a build target, with the duct closed and a small foramen ovale. Say which reported values you could not use as targets and why.
