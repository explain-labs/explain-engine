Build a virtual patient that reproduces the baseline validation case of the paper "An integrated model for simulation of neonatal physiology — the cardiovascular system" (Antonius et al., Pediatric Research), section 3.1.1, Table 2.

Start from the bundled baseline scenario `term_neonate`.

From the paper: "To validate the hemodynamic baseline state of the model, published hemodynamic data of Jhaveri et al., Groves et al., Kluckow and Evans, and van Zadelhoff et al. is used. These papers provide relevant hemodynamic data for normal full-term neonates." Table 2 reports target data and simulation results "for a normal term-born neonate of 3.3 kg at an age of 24 h". The reported simulation results are end-expiratory.

Table 2 (literature targets | the paper's simulation result). Volumes in mL per kg, flow rates in mL·min⁻¹·kg⁻¹, pressures in mmHg:

| Quantity | Jhaveri | Groves | Kluckow | van Zadelhoff | EXPLAIN (paper) |
|---|---|---|---|---|---|
| HR (min⁻¹) | 100.3 ± 9.8 | 142 ± 17.1 | – | – | 118 |
| LVEDV | 2.5 ± 0.3 | 2.51 ± 0.40 | – | – | 2.6 |
| LVESV | 0.9 ± 0.2 | 0.78 ± 0.21 | – | – | 1.0 |
| LVSV | 1.6 ± 0.1 | 1.73 ± 0.28 | – | – | 1.6 |
| LVO | 177 ± 25 | 245 ± 47.1 | – | – | 181 |
| RVEDV | 3.1 ± 0.3 | – | – | – | 3.2 |
| RVESV | 1.5 ± 0.2 | – | – | – | 1.6 |
| RVSV | 1.6 ± 0.2 | – | – | – | 1.6 |
| RVO | 181 ± 30 | – | – | – | 181 |
| fSVC | – | 95 ± 27.0 | 76 (34–143) | – | 76 |
| ABP systolic | – | – | – | 67 | 70 |
| ABP diastolic | – | – | – | 42 | 45 |

Please build the patient so that it matches the paper's simulation column (the EXPLAIN column) as closely as the builder's targets allow, using every reported value you can express as a build target. The patient breathes room air spontaneously and has closed shunts. Say which reported values you could not use as targets and why.
