"""Builds scripts/reference/adult_female_pregnant_<ga>wk.json (docs/PregnancyReference.md) for 24, 30 or 36 weeks.
Usage: python3 scripts/reference/_build_adult_female_pregnant_reference.py --ga 24|30|36 scripts/reference/adult_female_pregnant_<ga>wk.json

Rule (user, 2026-11-27): target = the calibrated non-pregnant adult_female reference (or model value where noted) x the change
measured within one longitudinal study, pre-pregnancy/early -> ~36 wk; absolute values only where she has no counterpart
(uteroplacental flow, fetal + placental O2 use). Position left lateral. User decisions 2026-11-27: haemodynamics option B
(recent non-invasive: CO x1.31 Meah 2016, HR +13 Mahendru 2014; Clark 1989 kept for the invasive pressures), weight 71 kg,
Hb with iron, GFR x1.28 (inulin), PaCO2 ~32, uterine flow ~700 mL/min.
"""
import json, sys
# 2026-11-28 (user): the non-pregnant model is calibrated 5 mmHg above the NHANES-derived MAP 82 (true mean 87, DBP +5), so
# the derived pregnancy pressures move +5 with it (pregnant = non-pregnant base x the within-study change).
# Per gestational age. 36 wk: the released set (2026-11-27). 30 wk (user 2026-11-27): the same studies at ~28-32 wk;
# interpolated rows marked in the notes; plasma volume scaled from de Haas 2017 (x1.40, the 36-wk source) not Aguree 2019.
PROFILES = {
 36: dict(W=71.0, bv=3.768 * 1.37, rbf=1.35, rbf_lo=1.25, rbf_hi=1.45, rbf_note="~x1.25-1.45",
          pv=1.456, rcm=0.349, bv_method="plasma x1.456 (meta-analysis) + red cells +349 mL (36 wk, iron)",
          hb=12.2, hct=36, hb_ratio="x0.90 (with iron; x0.85 without)", gfr=1.28, gfr_method="inulin clearance, 34 wk vs postpartum (n=12)",
          ut=700, ut_lo=500, ut_hi=970, ut_method="Doppler volume flow near term", ut_note="User decision 700. Flo 673 near term (11-12 % of CO), Metcalfe 492, Konje 970.",
          pl=600, pi=0.69, utvo2=22, utvo2_lo=18, utvo2_hi=26,
          utvo2_method="fetus 2.8 kg x 6.6 mL/kg/min + placenta ~5 (in vitro ~10 mL/min/kg); Metcalfe 24.5 at term",
          vo2=1.26, vo2_note="BMR x1.26 (Forsum x1.30)", mv=1.34, vt=1.27, frc=0.825, frc_note="x0.80-0.85", crs=0.9, rrs=0.5),
 24: dict(W=65.9, rbf=1.6, rbf_lo=1.45, rbf_hi=1.75, rbf_note="~x1.6 (Dunlop 1981: renal plasma flow +80 % plateau at 16-26 wk, haematocrit-corrected)",
          pv=1 + 0.40 * (0.29 / 0.42), rcm=0.125, bv_method="plasma x1.28 (Aguree 2019 24/30-wk step on the 30-wk x1.40) + red cells +125 mL (Taylor & Lind 1979, iron, interpolated)",
          hb=12.1, hct=36, hb_ratio="x0.90 (with iron)", gfr=1.25, gfr_method="inulin clearance, 22.3 wk vs postpartum (n=12)",
          ut=440, ut_lo=310, ut_hi=610, ut_method="Doppler volume flow, longitudinal (Flo 2010 299 at 22 wk, Konje 2001 513 at 20 wk): ratio 0.63 to 36 wk applied to 700",
          ut_note="Absolute values differ ~2x between the studies; only their ratio is used.",
          pl=375, pi=0.94, utvo2=7.4, utvo2_lo=6, utvo2_hi=9, utvo2_method="fetus 0.67 kg (Hadlock 1991) x 6.6 mL/kg/min + placenta ~3",
          vo2=1.18, vo2_note="BMR x1.18 (Butte 2004, 22-wk visit, interpolated)", mv=1.24, vt=1.24, frc=0.95, frc_note="~x0.95 (interpolated)", crs=0.96, rrs=0.60,
          co=round(5.4 * 1.31 * 1.27 / 1.29, 2), hr=74, map=83, dbp=66, pvr=0.68, alb=38.3,
          hr_row=("Mulder 2021 meta-analysis bins: +10.7 bpm (22-28 wk) vs +14.6 (29-35 wk); the 24/30 step applied to the 30-wk 78",
                  "-4 bpm vs 30 wk (Mulder 2021 within-series)", ["mulder2021","adult_female"], "B", "Monitor.heart_rate", "User decision 2026-11-28: within-series step from the calibrated 30-wk values."),
          co_row=("meta-analysis, studies with a non-pregnant reference (105 studies)", "x1.27 vs x1.29 at 29-35 wk (Mulder 2021); the 24/30 step applied to the 30-wk 7.07 L/min",
                  ["mulder2021","meah2016"], "B", "LV_AA flow", "~6.96 L/min. SVR lowest at 22-28 wk (-25 %, Mulder; Clapp 1997 at 24 wk)."),
          map_row=("arm cuff, mixed posture (BP meta-analysis), mid-pregnancy low point", "-4", ["dehaas2022","adult_female"], "B", "mean of AA pressure",
                   "User decision 78, +5 with the non-pregnant base (83; 2026-11-28). Clapp 1997 places the low point at 16 wk (-6); by 24 wk pressure may be recovering.")),
 30: dict(W=68.4, rbf=1.45, rbf_lo=1.3, rbf_hi=1.6, rbf_note="~x1.45 (interpolated; falls in the 3rd trimester, Dunlop 1981)",
          pv=1.40, rcm=0.237, bv_method="plasma x1.40 (de Haas 2017 scaled to ~30 wk) + red cells +237 mL (Taylor & Lind 1979, interpolated)",
          hb=12.0, hct=35.5, hb_ratio="x0.89 (with iron)", gfr=1.27, gfr_method="inulin clearance, 22 and 34 wk vs postpartum (n=12), interpolated",
          ut=570, ut_lo=400, ut_hi=790, ut_method="Doppler volume flow, longitudinal (Flo 2010, Konje 2001): 30/36-wk ratio 0.81 applied to 700",
          ut_note="Absolute values at 30 wk differ between the studies (Flo ~475, Konje ~767); only their ratio is used.",
          pl=485, pi=0.77, utvo2=14, utvo2_lo=11, utvo2_hi=17,
          utvo2_method="fetus 1.56 kg (Hadlock 1991) x 6.6 mL/kg/min + placenta ~4",
          vo2=1.22, vo2_note="BMR x1.22 (Butte 2004, interpolated: +10.7 kcal/wk)", mv=1.28, vt=1.23, frc=0.89, frc_note="~x0.89 (interpolated)", crs=0.93, rrs=0.55),
}
GA = int(sys.argv[sys.argv.index("--ga") + 1]) if "--ga" in sys.argv else 36
P = PROFILES[GA]
W = P["W"]
BV = P.get("bv") or 2.26 * P["pv"] + 1.51 + P["rcm"]  # L (36 wk keeps its released x1.37)
S = {
 "meah2016": ("Meah VL et al. Cardiac output and related haemodynamics during pregnancy: a series of meta-analyses. Heart 2016;102:518-26", "10.1136/heartjnl-2015-308476", "26794234"),
 "mahendru2014": ("Mahendru AA et al. A longitudinal study of maternal cardiovascular function from preconception to the postpartum period. J Hypertens 2014;32:849-56", "10.1097/HJH.0000000000000090", "24406777"),
 "perry2019": ("Perry H et al. NICOM device-specific reference ranges in pregnancy. Ultrasound Obstet Gynecol 2019;54:670-5", "10.1002/uog.20179", "30548496"),
 "clark1989": ("Clark SL et al. Central hemodynamic assessment of normal term pregnancy. Am J Obstet Gynecol 1989;161:1439-42 (values via a GLOWM table reproduction)", "10.1016/0002-9378(89)90900-9", None),
 "wang2013": ("Wang et al. Blood pressure from pre-pregnancy through pregnancy (n=570, seated cuff). 2013", None, None),
 "ducas2014": ("Ducas RA et al. Cardiovascular magnetic resonance in pregnancy: insights from the cardiac hemodynamic imaging and remodeling in pregnancy (CHIRP) study. J Cardiovasc Magn Reson 2014;16:1", "10.1186/1532-429X-16-1", None),
 "dehaas2017": ("de Haas S et al. Physiological adaptation of maternal plasma volume during pregnancy: a systematic review and meta-analysis. Ultrasound Obstet Gynecol 2017;49:177-87", "10.1002/uog.17360", None),
 "taylor1979": ("Taylor DJ, Lind T. Red cell mass during and after normal pregnancy. Br J Obstet Gynaecol 1979;86:364-70", "10.1111/j.1471-0528.1979.tb10611.x", None),
 "murphy2002": ("Murphy MM et al. Plasma albumin and haematocrit from pre-pregnancy to 32 wk. Am J Clin Nutr 2002;76:614-9", "10.1093/ajcn/76.3.614", None),
 "davison1981": ("Davison JM et al. Serial changes in plasma osmolality during pregnancy. Br J Obstet Gynaecol 1981", "10.1111/j.1471-0528.1981.tb01019.x", None),
 "saxena2012": ("Saxena AR et al. Inulin GFR in normal pregnancy (34 wk vs postpartum). Hypertens Pregnancy 2012", "10.3109/10641955.2010.507845", None),
 "dunlop1981": ("Dunlop W. Serial changes in renal haemodynamics during normal human pregnancy. Br J Obstet Gynaecol 1981;88:1-9", "10.1111/j.1471-0528.1981.tb00929.x", None),
 "iom2009": ("Institute of Medicine. Weight Gain During Pregnancy: Reexamining the Guidelines. 2009", None, None),
 "flo2010": ("Flo K et al. A longitudinal study of the relationship between maternal cardiac output and uterine artery blood flow. BJOG 2010;117:837-44", "10.1111/j.1471-0528.2010.02548.x", None),
 "konje2001": ("Konje JC et al. Longitudinal quantification of uterine artery blood volume flow changes during gestation. 2001", None, None),
 "metcalfe1955": ("Metcalfe J et al. Estimation of uterine blood flow in normal human pregnancy at term. J Clin Invest 1955", None, None),
 "gomez2008": ("Gomez O et al. Reference ranges for uterine artery mean pulsatility index at 11-41 weeks. Ultrasound Obstet Gynecol 2008;32:128-32", "10.1002/uog.5315", None),
 "butte2004": ("Butte NF et al. Energy requirements during pregnancy based on total energy expenditure and energy deposition (calorimetry, n=34). Am J Clin Nutr 2004", None, "15159239"),
 "forsum1992": ("Forsum E et al. Energy metabolism in pregnancy (longitudinal). 1992", None, None),
 "acharya2009": ("Acharya G, Sitras V. Oxygen uptake of the human fetus at term. Acta Obstet Gynecol Scand 2009", None, None),
 "challier1976": ("Challier JC et al. Placental oxygen consumption in vitro. 1976", None, None),
 "spatling1992": ("Spatling L et al. The variability of cardiopulmonary adaptation to pregnancy at rest and during exercise (n=20). Br J Obstet Gynaecol 1992", None, "1515406"),
 "templeton1976": ("Templeton A, Kelman GR. Maternal blood-gases, PAO2-PaO2, physiological shunt and VD/VT in normal pregnancy. Br J Anaesth 1976", None, "10937"),
 "jensen2005": ("Jensen D et al. Mechanisms of ventilatory response to CO2 in pregnancy. 2005", None, "15677521"),
 "craig1975": ("Craig DB, Toole MA. Airway closure in pregnancy (FRC, n=24). Can Anaesth Soc J 1975;22:665", None, "1201469"),
 "mulder2021": ("Mulder E et al. Haemodynamic adaptation to pregnancy: a meta-analysis of studies with a non-pregnant reference. BJOG 2021", None, "33630403"),
 "dehaas2022": ("de Haas S et al. Blood pressure adjustments throughout healthy and hypertensive pregnancy: a systematic review and meta-analysis. 2022", None, "34929556"),
 "hadlock1991": ("Hadlock FP et al. In utero analysis of fetal growth: a sonographic weight standard. Radiology 1991;181:129-33", "10.1148/radiology.181.1.1887021", "1887021"),
 "gee1967": ("Gee JB et al. Pulmonary mechanics during pregnancy (n=10). J Clin Invest 1967", None, None),
 "mills1998": ("Mills JL et al. Physiological reduction in fasting plasma glucose concentration in the first trimester (n=361). 1998", None, "9751245"),
 "hartgill2011": ("Hartgill TW et al. Core body temperature and the thermoneutral zone in pregnancy. 2011", None, None),
 "adult_female": ("Calibrated non-pregnant adult_female reference (scripts/reference/adult_female.json, docs/AdultFemaleReference.md)", None, None),
 "textbook": ("Textbook / review; not checked against a retrieved source", None, None),
}
V = []
def row(key, group, label, unit, mean=None, sd=None, low=None, high=None, range_type=None, method="", ratio="", sources=(), grade="C", readout="", notes=""):
    V.append(dict(key=key, group=group, label=label, unit=unit, mean=mean, sd=sd, low=low, high=high, range_type=range_type,
                  method=method, age=f"{GA} wk gestation, left lateral", n=None, sources=list(sources), grade=grade, model_readout=readout,
                  notes=(f"Change: {ratio}. " if ratio else "") + notes))
r1 = lambda x, d=1: round(x, d)
H, B, R, Bl, M_, U = "hemodynamics", "breathing", "gases", "blood", "metabolism", "uterus"
CO = P.get("co", 5.4 * 1.31)  # L/min
HR = P.get("hr", 65 + 13)
if "hr_row" in P: row("hr",H,"Heart rate","bpm",HR,None,65,95,"base range shifted",*P["hr_row"])
else: row("hr",H,"Heart rate","bpm",HR,None,65,95,"base range shifted","non-invasive, pre-conception -> 33 wk","+13 +/- 11 bpm (Mahendru 2014, n=54)",["mahendru2014","adult_female"],"B","Monitor.heart_rate","Base 65 (user decision). Clark 1989 invasive x1.17 (76) as a cross-check; other studies x1.26-1.29.")
if "co_row" in P: row("lvo",H,"Cardiac output","mL/kg/min",r1(CO*1000/W),None,r1(CO*0.8*1000/W),r1(CO*1.2*1000/W),"target +/- 20 %",*P["co_row"])
else: row("lvo",H,"Cardiac output","mL/kg/min",r1(CO*1000/W),None,r1(CO*0.8*1000/W),r1(CO*1.2*1000/W),"target +/- 20 %","meta-analysis of echo / impedance / rebreathing","x1.31 at the early 3rd-trimester peak (Meah 2016, 39 studies)",["meah2016","mahendru2014","perry2019","clark1989"],"A/B","LV_AA flow",f"{CO:.2f} L/min (base 5.4, user decision). Plateau/slight fall after ~35 wk (Perry 2019 NICOM). Clark invasive x1.43 (7.7 L/min) cross-check.")
row("rvo",H,"Right ventricular output","mL/kg/min",r1(CO*1000/W),None,r1(CO*0.8*1000/W),r1(CO*1.2*1000/W),"as lvo","","",["meah2016"],"A/B","RV_PA flow","")
row("lv_sv",H,"LV stroke volume","mL/kg",r1(CO*1000/HR/W,2),None,None,None,None,"derived CO / HR","x1.09 (derived)",["meah2016","mahendru2014"],"B (derived)","Heart.lv_sv",f"{CO*1000/HR:.0f} mL.")
row("lv_edv",H,"LV end-diastolic volume","mL/kg",r1(127*1.29/W,2),None,None,None,None,"CMR ~34 wk vs postpartum","x1.29 (Ducas 2014)",["ducas2014"],"B","Heart.lv_edv","Reference only in spirit: Ducas's CO rise (+85 %) is an outlier against option B; expect the model's EDV lower.")
if "map_row" in P: row("map_mean",H,"Mean arterial pressure (true mean)","mmHg",P["map"],None,71,95,"base range shifted",*P["map_row"])
else: row("map_mean",H,"Mean arterial pressure (true mean)","mmHg",87,None,75,99,"base range narrowed","intra-arterial (Clark); pre-conception cohort recovering by the 3rd trimester","x1.00",["clark1989","mahendru2014","adult_female"],"B","mean of AA pressure","")
if "dbp" in P: row("dbp",H,"Diastolic BP","mmHg",P["dbp"],None,53,81,"base range shifted","arm cuff, mixed posture (BP meta-analysis)","-4 (mid-pregnancy)",["dehaas2022"],"B","Monitor abp_pre diastolic","")
else: row("dbp",H,"Diastolic BP","mmHg",67,None,55,83,"base range shifted","seated cuff, pre-pregnancy cohort (n=570)","x0.96",["wang2013"],"B","Monitor abp_pre diastolic","")
row("svr",H,"Systemic vascular resistance","WU",r1((P.get("map", 87)-4)/CO),None,None,None,None,"derived (MAP - CVP)/CO","~x0.76 (Clark reports x0.79)",["clark1989","meah2016"],"C (derived)","(map_mean - cvp)/LVO","")
row("cvp",H,"Central venous pressure","mmHg",4,None,2,7,"base range","PA catheter, left lateral (n=10)","x1.00",["clark1989","adult_female"],"B","Monitor CVP","")
row("pawp",H,"Pulmonary artery wedge pressure","mmHg",10.1,None,None,13,"base","PA catheter","x1.00",["clark1989","adult_female"],"B","mean LA pressure","")
if "pvr" in P: row("pvr",H,"Pulmonary vascular resistance","WU",r1(0.86*P["pvr"],2),None,None,None,None,"scaled from the 30-wk decision (no mid-pregnancy invasive data)",f"x{P['pvr']}",["clark1989","adult_female"],"C","(pap_m - LA)/Qp","")
else: row("pvr",H,"Pulmonary vascular resistance","WU",r1(0.86*0.66,2),None,None,None,None,"PA catheter","x0.66",["clark1989","adult_female"],"B","(pap_m - LA)/Qp","")
row("pap_m",H,"Mean PAP","mmHg",12.8,None,None,20,"base","PA catheter (derived unchanged)","~x1.0",["clark1989","adult_female"],"C","Monitor PAP","")
row("renal",H,"Renal blood flow","mL/kg/min",r1(850*P["rbf"]/W),None,r1(850*P["rbf_lo"]/W),r1(850*P["rbf_hi"]/W),"derived range","effective renal plasma flow, 3rd trimester",P["rbf_note"],["dunlop1981"],"C","AD_KID_ART flow",f"~{850*P['rbf']:.0f} mL/min.")
row("blood_volume",Bl,"Blood volume","mL/kg",r1(BV*1000/W),None,None,None,None,P["bv_method"],f"x{BV/3.768:.2f} (derived)",["dehaas2017","taylor1979","adult_female"],"B","sum of blood compartments",f"{BV:.2f} L. Two studies combined (breaks the one-study rule).")
row("hb",Bl,"Haemoglobin","g/dL",P["hb"],None,11.0,13.5,"derived","red cell mass / blood volume",P["hb_ratio"],["taylor1979","dehaas2017","murphy2002"],"B/C","Blood composition","User decision: with iron. Murphy 2002 Hct only -4 % (conflict noted).")
row("hct",Bl,"Haematocrit","%",P["hct"],None,33,40,"derived","",P["hb_ratio"].split(" ")[0],["taylor1979","dehaas2017"],"B/C","hb / MCHC","")
if "alb" in P: row("albumin",Bl,"Albumin","g/L",P["alb"],None,33,43,"derived","pre-pregnancy -> 20 / 32 wk (n=93), interpolated",f"x{P['alb']/43:.2f}",["murphy2002","adult_female"],"A/B","AA solutes.albumin","")
else: row("albumin",Bl,"Albumin","g/L",37.2,None,32,42,"derived","pre-pregnancy -> 32 wk (n=93)","x0.866",["murphy2002","adult_female"],"B","AA solutes.albumin","Colloid osmotic pressure x0.86 (Clark): ~21.5 mmHg.")
row("na",Bl,"Sodium","mmol/L",136,None,132,140,"derived","plasma osmolality -10 mOsm/kg","-4",["davison1981"],"C","AA solutes.na","")
row("gfr_abs",Bl,"GFR (absolute, not indexed)","mL/min",round(105*P["gfr"]),None,round(105*1.15),round(105*1.5),"inulin to Dunlop",P["gfr_method"],f"x{P['gfr']} (Dunlop x1.5)",["saxena2012","dunlop1981","adult_female"],"B","Kidneys.gfr","User decision: inulin (Saxena). Pregnancy GFR is not indexed to 1.73 m2.")
row("ut_flow",U,"Uterine blood flow","mL/min",P["ut"],None,P["ut_lo"],P["ut_hi"],"absolute range across methods",P["ut_method"],"~9-10 % of CO",["flo2010","konje2001","metcalfe1955"],"B/C","Uterus.ut_blood_flow",P["ut_note"])
row("pl_flow",U,"Placental (intervillous) flow","mL/min",P["pl"],None,None,None,None,"textbook ~80-90 % of uterine flow","",["textbook"],"C","MaternalPlacenta.mp_blood_flow","")
row("ut_pi",U,"Uterine artery pulsatility index","-",P["pi"],None,None,None,None,f"Doppler reference curve at {GA} wk","",["gomez2008"],"A/B","AD_UT_ART flow per beat","Non-pregnant model 2.66.")
row("uteroplacental_vo2",U,"Uterus + placenta + fetus O2 consumption","mL O2/min",P["utvo2"],None,P["utvo2_lo"],P["utvo2_hi"],"budget",P["utvo2_method"],"absolute",["acharya2009","challier1976","metcalfe1955","hadlock1991"],"B","Uterus.ut_vo2_ml + MaternalPlacenta.mp_vo2_ml","The fetus is an O2 sink (user decision).")
row("vo2",M_,"Whole-body O2 consumption (maternal + uteroplacental)","mL/kg/min",r1(192*P["vo2"]/W,2),None,None,None,None,"calorimetry, pre-pregnancy -> 3rd trimester (n=34)",P["vo2_note"],["butte2004","forsum1992","adult_female"],"A","gas exchanger O2 uptake",f"{192*P['vo2']:.0f} mL/min at {W:.1f} kg.")
row("rq",M_,"Respiratory quotient","-",0.82,None,None,None,None,"","unchanged",["spatling1992"],"B","CO2 out / O2 uptake","")
row("temp",M_,"Core temperature","degC",36.8,None,36.3,37.5,"","","falls slightly",["hartgill2011"],"C","Monitor.temp","")
row("glucose",M_,"Fasting glucose","mmol/L",4.7,None,3.9,5.1,"","from 6 wk (n=361)","-0.2",["mills1998","adult_female"],"B","AA glucose","")
row("lactate",M_,"Arterial lactate","mmol/L",1.0,None,0.5,2.2,"base","","unchanged (non-fasting x1.26 weak)",["adult_female"],"C","Lactate.arterial_lactate","")
row("mv",B,"Minute ventilation","mL/kg/min",r1(5.7*P["mv"]*1000/W),None,None,None,None,"(model base 5.7 L/min)",f"x{P['mv']}",["spatling1992"],"B","Breathing.minute_volume",f"{5.7*P['mv']:.1f} L/min.")
row("vt",B,"Tidal volume","mL/kg",r1(380*P["vt"]/W,2),None,None,None,None,"(model base 380 mL)",f"x{P['vt']}",["spatling1992"],"B","Breathing.exp_tidal_volume",f"{380*P['vt']:.0f} mL.")
row("rr",B,"Respiratory rate","/min",15,None,12,20,"","","unchanged",["spatling1992"],"B","Breathing.resp_rate","")
row("frc",B,"FRC","mL/kg",r1(2300*P["frc"]/W),None,None,None,None,"(model base 2.3 L)",P["frc_note"],["craig1975","gee1967"],"B/C","min(ALL + ALR + DS) gas volume",f"~{2.3*P['frc']:.2f} L.")
row("crs",B,"Respiratory system compliance","mL/cmH2O",round(90*P["crs"]),None,None,None,None,"lung unchanged, chest wall lower",f"~x{P['crs']}",["gee1967"],"C","lung + chest wall in series","")
row("rrs",B,"Respiratory resistance","cmH2O/L/s",round(3.2*P["rrs"],2),None,None,None,None,"total pulmonary resistance",f"x{P['rrs']}",["gee1967"],"B","MOUTH_DS + DS_ALL//DS_ALR","")
row("pco2",R,"PaCO2","mmHg",32,None,30,34,"review range","","-5.5 (Spatling alveolar -4)",["spatling1992","textbook"],"B/C","arterial gas","User decision ~32.")
row("ph",R,"Arterial pH","-",7.44,None,7.40,7.47,"","","compensated respiratory alkalosis",["textbook"],"C","arterial gas","")
row("hco3",R,"Bicarbonate","mmol/L",21,None,19,23,"","","-3",["textbook"],"C","arterial gas","")
row("po2",R,"PaO2","mmHg",100,None,85,110,"","semi-recumbent, left lateral tilt","A-a unchanged",["templeton1976"],"B","arterial gas","")
row("spo2",R,"SpO2","%",98,None,96,100,"","","",["textbook"],"C","Monitor.spo2_pre","")
out = dict(name=f"adult_female_pregnant_{GA}wk",
  description=f"Reference values for adult_female at {GA} weeks of a healthy singleton pregnancy, left lateral, derived as the non-pregnant calibrated values x within-study longitudinal changes. Fetus represented as an O2 sink.",
  state=f"awake, left lateral, rest, {GA} wk gestation", compiled="2026-11-27", doc="docs/PregnancyReference.md",
  sources=[[k, dict(cite=c, doi=d, pmid=p)] for k,(c,d,p) in S.items()], variables=V)
used = {s for v in V for s in v["sources"]}; assert used <= set(S), used - set(S)
json.dump(out, open([a for a in sys.argv[1:] if a.endswith(".json")][0],"w"), indent=1, ensure_ascii=False)
print(len(V), "variables,", len(S), "sources")
