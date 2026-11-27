"""Builds scripts/reference/adult_female.json (docs/AdultFemaleReference.md).
Usage: python3 scripts/reference/_build_adult_female_reference.py scripts/reference/adult_female.json"""
import json, sys
W, BSA = 60.0, 1.65
def pk(v): return None if v is None else round(v * BSA / W, 3)   # per m2 -> per kg
S = {
 "kb2020": ("Kawel-Boehm N et al. Reference ranges (normal values) for CMR in adults and children: 2020 update. J Cardiovasc Magn Reson 2020;22:87", "10.1186/s12968-020-00683-3", "33308262"),
 "nhsr35": ("Wright JD et al. Mean systolic and diastolic BP in adults aged 18 and over, NHANES 2001-2008. Natl Health Stat Report 2011;35", None, None),
 "nhsr41": ("Ostchega Y et al. Resting pulse rate reference data, NHANES 1999-2008. Natl Health Stat Report 2011;41", None, None),
 "mceniery2008": ("McEniery CM et al. Central pressure: variability and impact of cardiovascular risk factors: the Anglo-Cardiff Collaborative Trial II. Hypertension 2008;51:1476-82", "10.1161/HYPERTENSIONAHA.107.105445", "18426997"),
 "herbert2014": ("Herbert A et al. Establishing reference values for central blood pressure and its amplification in a general healthy population. Eur Heart J 2014;35:3122-33", "10.1093/eurheartj/ehu293", "25112663"),
 "kovacs2009": ("Kovacs G et al. Pulmonary arterial pressure during rest and exercise in healthy subjects: a systematic review. Eur Respir J 2009;34:888-94", "10.1183/09031936.00145608", "19324955"),
 "kovacs2012": ("Kovacs G et al. Pulmonary vascular resistances during exercise in normal subjects: a systematic review. Eur Respir J 2012;39:319-28", "10.1183/09031936.00008611", "21885394"),
 "zeder2024": ("Zeder K et al. Pulmonary arterial wedge pressure in healthy subjects: a meta-analysis. Eur Respir J 2024;64:2400967", "10.1183/13993003.00967-2024", "38964777"),
 "escers2022": ("Humbert M et al. 2022 ESC/ERS Guidelines for pulmonary hypertension. Eur Heart J 2022;43:3618 (Table 11)", "10.1093/eurheartj/ehac237", "36017548"),
 "czernin1993": ("Czernin J et al. Influence of age and hemodynamics on myocardial blood flow and flow reserve. Circulation 1993;88:62-9", "10.1161/01.cir.88.1.62", "8319357"),
 "brown2018": ("Brown LAE et al. CMR quantitative perfusion mapping, healthy volunteers (median age 23). 2018", None, None),
 "peterson2007": ("Peterson LR et al. Sex differences in myocardial oxygen and glucose metabolism. J Nucl Cardiol 2007;14:573-81", "10.1016/j.nuclcard.2007.03.001", "17679067"),
 "zarrinkoob2015": ("Zarrinkoob L et al. Blood flow distribution in cerebral arteries. J Cereb Blood Flow Metab 2015;35:648-54", "10.1038/jcbfm.2014.241", "25564234"),
 "ito2004": ("Ito H et al. Database of normal human cerebral blood flow, volume, O2 extraction and metabolic rate (PET). Eur J Nucl Med Mol Imaging 2004;31:635-43", "10.1007/s00259-003-1430-8", "14730405"),
 "leelueck2014": ("Lee SC, Lueck CJ. Cerebrospinal fluid pressure in adults. J Neuroophthalmol 2014;34:278-83", "10.1097/WNO.0000000000000155", "25133881"),
 "andresen2014": ("Andresen M, Juhler M. Intracranial pressure following complete removal of a small demarcated brain tumor (telemetric ICP). J Neurosurg 2014", "10.3171/2014.2.JNS132209", "24702326"),
 "villa2020": ("Villa G et al. Renal blood flow by phase-contrast MRI: review (Eckerbom data, Table 2). MAGMA 2020;33:3-21", "10.1007/s10334-019-00772-0", "31422518"),
 "toering2015": ("Toering TJ et al. Sex differences in renal hemodynamics and RAAS activity in healthy young adults. Physiol Rep 2015;3:e12434", "10.14814/phy2.12434", "26149279"),
 "yzet2010": ("Yzet T et al. Hepatic vascular flow measurements by phase-contrast MRI in healthy volunteers. Eur J Radiol 2010;73:119-24", "10.1016/j.ejrad.2008.09.032", "19008062"),
 "szinnai2001": ("Szinnai G et al. Sex-related differences in portal vein blood flow (Doppler). Scand J Gastroenterol 2001;36:1167", "10.1080/003655201750153458", "11346210"),
 "mohiaddin1990": ("Mohiaddin RH et al. Superior vena cava flow by velocity-encoded MRI. Radiology 1990;177:537-41", "10.1148/radiology.177.2.2217797", "2217797"),
 "nadler1962": ("Nadler SB et al. Prediction of blood volume in normal human adults. Surgery 1962;51:224-32", None, "21936146"),
 "icsh1995": ("Pearson TC et al. ICSH: interpretation of measured red cell mass and plasma volume in adults. Br J Haematol 1995;89:748-56", "10.1111/j.1365-2141.1995.tb08411.x", "7772511"),
 "braat2024": ("Braat S et al. Haemoglobin thresholds to define anaemia in non-pregnant women. Lancet Haematol 2024", "10.1016/S2352-3026(24)00030-9", "38432242"),
 "severinghaus1979": ("Severinghaus JW. Simple, accurate equations for human blood O2 dissociation computations. J Appl Physiol 1979;46:599-602", "10.1152/jappl.1979.46.3.599", "35496"),
 "pottel2017": ("Pottel H et al. Age-dependent reference intervals for measured GFR. Clin Kidney J 2017;10:545-51", "10.1093/ckj/sfx026", "28852494"),
 "parreira2010": ("Parreira VF et al. Breathing pattern and thoracoabdominal motion in healthy subjects (RIP), supine. Rev Bras Fisioter 2010;14:411-6", "10.1590/S1413-35552010000500010", "21180867"),
 "hall2021": ("Hall GL et al. GLI reference equations for static lung volumes. Eur Respir J 2021;57:2000289", "10.1183/13993003.00289-2020", "33707167"),
 "drummond1996": ("Drummond GB et al. Supine vs upright FRC. Br J Anaesth 1996;76:560", None, "8652330"),
 "gertler2021": ("Gertler R. Respiratory mechanics. Anesthesiol Clin 2021;39:415-40", "10.1016/j.anclin.2021.04.003", "34392877"),
 "valach2026": ("Valach C et al. Oscillometry reference values (LEAD cohort). ERJ Open Res 2026;12:00159-2025", "10.1183/23120541.00159-2025", "41497331"),
 "hart1963": ("Hart MC et al. Relation between anatomic respiratory dead space and body size. J Appl Physiol 1963;18:519-22", "10.1152/jappl.1963.18.3.519", "31094493"),
 "lindner2024": ("Lindner M et al. Oesophageal pressure swings in healthy volunteers. BMC Pulm Med 2024;24:289", "10.1186/s12890-024-03096-5", "38902702"),
 "goldberg2017": ("Goldberg S et al. Chemosensitivity in young women (n~240). PLoS One 2017;12:e0168930", "10.1371/journal.pone.0168930", "28045995"),
 "bushfield2026": ("Bushfield et al. Arterial blood gases in healthy women at 1100 m (Table 2). Compr Physiol 2026;16:e70279", "10.1002/cph4.70279", "42926907"),
 "crapo1999": ("Crapo RO et al. Arterial blood gas reference values for sea level and 1400 m. Am J Respir Crit Care Med 1999;160:1525-31", "10.1164/ajrccm.160.5.9806006", "10556115"),
 "barrattboyes1957": ("Barratt-Boyes BG, Wood EH. The oxygen saturation of blood in the venae cavae, right heart chambers and pulmonary vessels of healthy subjects. J Lab Clin Med 1957;50:93-106", None, "13439270"),
 "byrne2005": ("Byrne NM et al. Metabolic equivalent: one size does not fit all. J Appl Physiol 2005;99:1112-9", "10.1152/japplphysiol.00023.2004", "15831804"),
 "mifflin1990": ("Mifflin MD et al. A new predictive equation for resting energy expenditure. Am J Clin Nutr 1990;51:241-7", "10.1093/ajcn/51.2.241", "2305711"),
 "geneva2019": ("Geneva II et al. Normal body temperature: a systematic review. Open Forum Infect Dis 2019;6:ofz032", "10.1093/ofid/ofz032", "30976605"),
 "klaestrup2011": ("Klaestrup E et al. Reference intervals and age/gender dependency for arterial blood gases and electrolytes. Clin Chem Lab Med 2011;49:1495", "10.1515/CCLM.2011.603", "21619466"),
 "textbook": ("Textbook / laboratory reference interval (Guyton & Hall; local lab RIs); not checked against a retrieved source", None, None),
}
V = []
def row(key, group, label, unit, mean=None, sd=None, low=None, high=None, range_type=None, method="", n=None, sources=(), grade="C", readout="", notes="", age="20-39 y, female"):
    V.append(dict(key=key, group=group, label=label, unit=unit, mean=mean, sd=sd, low=low, high=high, range_type=range_type,
                  method=method, age=age, n=n, sources=list(sources), grade=grade, model_readout=readout, notes=notes))
NONE = "none (reference only)"
H="hemodynamics"
row("hr",H,"Heart rate","bpm",65,None,55,99,"chosen mean; NHANES 2.5th-97.5th","NHANES seated 5 min, 30 s radial count; target chosen for supine rest",3061,["nhsr41","kb2020"],"A (range) / decision (mean)","Monitor.heart_rate",
    "NHANES seated women 20-39: 76 (55-99). CMR CO/SV implies ~58 supine in the scanner. User decision 2026-11-27: HR 65 with CMR SV 83 mL -> CO ~5.4 L/min (CI 3.3, inside 1.9-3.9).")
row("sbp",H,"Systolic BP (central, ascending aorta)","mmHg",100,None,84,118,"brachial P5-P95 minus ~10","NHANES brachial 110 (94-128) minus the aorta-to-arm systolic amplification (~10 mmHg in young adults)",3655,["nhsr35","mceniery2008","herbert2014"],"C (derived)","Monitor abp_pre (AA) systolic",
    "User decision 2026-11-27 (option A): the model reads the ascending aorta, so compare as central pressure. McEniery 2008: brachial-aortic SBP gap still 8 +/- 3 mmHg in women >80 y, larger in the young; Herbert 2014 tabulates it by age/sex (young-female values not verified, full text not retrieved). Brachial NHANES 110 +/- 10.")
row("dbp",H,"Diastolic BP","mmHg",68,9,52,83,"P5-P95","NHANES seated office auscultation (diastolic ~equal in aorta and arm)",3655,["nhsr35"],"A (seated)","Monitor abp_pre (AA) diastolic","SD derived from the P5-P95 spread / 3.29.")
row("map_mean",H,"Mean arterial pressure (true time-averaged mean)","mmHg",82,None,66,98,"derived","NHANES DBP + PP/3 (the brachial formula approximates the true mean, which is ~equal in aorta and arm)",None,["nhsr35"],"B (derived)","mean of AA pressure",
    "User decision 2026-11-27 (option A). DBP + PP/3 on the model's aortic waveform reads ~6 mmHg below its true mean, so the clinical-formula row is reference-only.")
row("map",H,"MAP by the clinical formula (DBP + PP/3) on the aortic waveform","mmHg",None,None,None,None,None,"Monitor.abp_pre_pres_mean",None,["nhsr35"],"-","Monitor.abp_pre_pres_mean","Reference only (option A): the formula is fitted to brachial waveforms.")
row("pp",H,"Pulse pressure (central)","mmHg",32,None,None,None,None,"central SBP 100 - DBP 68",None,["nhsr35","mceniery2008"],"C (derived)","sbp - dbp","Brachial 42; central narrower by the systolic amplification.")
row("cvp",H,"Central venous / right atrial pressure","mmHg",4,None,2,6,"guideline range","right-heart catheter",None,["escers2022"],"C","Monitor CVP","")
row("pap_s",H,"Systolic PAP","mmHg",None,None,15,30,"guideline range","RHC",None,["escers2022"],"C","Monitor PAP","")
row("pap_d",H,"Diastolic PAP","mmHg",None,None,4,12,"guideline range","RHC",None,["escers2022"],"C","Monitor PAP","")
row("pap_m",H,"Mean PAP","mmHg",12.8,3.1,None,None,"mean_sd","RHC systematic review, age <30 subgroup",None,["kovacs2009"],"A","Monitor PAP","All ages 14.0 +/- 3.3 (n=1187), sex-independent.",age="<30 y, both sexes")
row("pawp",H,"Pulmonary artery wedge pressure","mmHg",10.1,1.8,None,13.0,"mean_sd; ULN","supine RHC meta-analysis",960,["zeder2024"],"A (all) / B (women)","mean LA pressure","Women 10.05 vs men 8.38. Model: mean left atrial pressure.",age="median 26 y, both sexes")
row("pvr",H,"Pulmonary vascular resistance","WU",0.86,0.35,None,None,"mean_sd","RHC systematic review",None,["kovacs2012"],"A","(pap_m - LA)/Qp","Model uses mean LA pressure as the wedge.",age="24-50 y")
row("svr",H,"Systemic vascular resistance","WU",14.4,None,None,None,None,"(true mean MAP - CVP)/CO with the chosen targets (82 - 4)/5.4",None,["nhsr35","kb2020"],"C (derived)","(map - cvp)/LVO","No measured young-female SVR retrieved.")
row("lv_edv",H,"LV end-diastolic volume","mL/kg",pk(77),pk(12),None,None,"mean_sd","1.5 T SAX bSSFP, papillary muscles in mass",43,["kb2020"],"A","Heart.lv_edv","77 +/- 12 mL/m2 = 127 mL.",age="women 20-29 y")
row("lv_esv",H,"LV end-systolic volume","mL/kg",pk(29),pk(7),None,None,"mean_sd","as lv_edv",43,["kb2020"],"A","Heart.lv_esv","29 +/- 7 mL/m2 = 48 mL.",age="women 20-29 y")
row("lv_sv",H,"LV stroke volume","mL/kg",pk(50),pk(6),None,None,"mean_sd","as lv_edv",33,["kb2020"],"A","Heart.lv_sv","50 +/- 6 mL/m2 = 83 mL.",age="women 20-29 y")
row("lv_ef",H,"LV ejection fraction","%",62,6,None,None,"mean_sd","as lv_edv",43,["kb2020"],"A","Heart.lv_ef","Women all ages 66 +/- 7.",age="women 20-29 y")
row("lv_mass",H,"LV mass","g",84,18,None,None,"mean_sd","as lv_edv",43,["kb2020"],"A",NONE,"51 +/- 11 g/m2. Mob/HeartFunction use whole-heart weight (linear in body weight, ~266 g at 60 kg).",age="women 20-29 y")
row("rv_edv",H,"RV end-diastolic volume","mL/kg",pk(78),pk(12),None,None,"mean_sd","1.5 T SAX bSSFP, papillary muscles in volume",47,["kb2020"],"A","Heart.rv_edv","78 +/- 12 mL/m2 = 129 mL.",age="women 20-29 y")
row("rv_esv",H,"RV end-systolic volume","mL/kg",pk(33),None,pk(10),pk(56),"mean +/- 2SD","as rv_edv",47,["kb2020"],"A","Heart.rv_esv","33 +/- 12 mL/m2.",age="women 20-29 y")
row("rv_sv",H,"RV stroke volume","mL/kg",pk(46),pk(9),None,None,"mean_sd","as rv_edv",37,["kb2020"],"A","Heart.rv_sv","In the model RV SV ~ LV SV; the CMR difference (46 vs 50) is cohort/convention.",age="women 20-29 y")
row("rv_ef",H,"RV ejection fraction","%",None,None,56,66,"band between the two tracing conventions","papillary muscles in volume (56 +/- 11) vs in mass (Maceira 66 +/- 7)",47,["kb2020"],"A","Heart.rv_ef","User decision 2026-11-27: accept 56-66.",age="women 20-29 y")
row("lvo",H,"Left ventricular output (cardiac output)","mL/kg/min",90,None,52,107,"chosen; CI 1.9-3.9 range","3 T CMR (Le 2016) CI 2.9 +/- 0.5",89,["kb2020"],"A (range) / decision (mean)","LV_AA flow",
    "CMR CI 2.9 -> 4.8 L/min (80 mL/kg/min); user decision: HR 65 x SV 83 -> ~5.4 L/min (90 mL/kg/min, CI 3.3).",age="women 20-69 y")
row("rvo",H,"Right ventricular output","mL/kg/min",90,None,52,107,"as lvo","",None,["kb2020"],"A","RV_PA flow","No shunts: equals LVO.")
row("svc",H,"Superior vena cava flow","mL/kg/min",31.5,None,None,None,None,"velocity-encoded MRI, SVC = 35 % of CO",13,["mohiaddin1990"],"B","SVC_RASVC flow","35 % of the chosen CO 90. Mixed sex, n=13.",age="adults, mixed sex")
row("dao",H,"Descending aorta flow","mL/kg/min",54,None,None,None,None,"derived: ~60 % of CO",None,["mohiaddin1990"],"C","AAR_AD flow","No verified volume flow retrieved.")
row("cbf",H,"Total cerebral blood flow","mL/kg/min",12.0,2.05,None,None,"mean_sd","PC-MRI sum of ICA + VA",None,["zarrinkoob2015","ito2004"],"B","AA_BR_ART flow","717 +/- 123 mL/min; may include older subjects; women ~10 % higher perfusion; young female likely 700-750 mL/min.",age="adults")
row("renal",H,"Renal blood flow (both kidneys)","mL/kg/min",14.0,None,10.2,15.3,"between methods","PC-MRI ~920 mL/min (Eckerbom) vs hippuran ERPF -> ~610 mL/min blood",None,["villa2020","toering2015"],"B","AD_KID_ART flow","~850 mL/min chosen (~18 % of CO).",age="young women")
row("hepatic_total",H,"Total liver inflow (hepatic artery + portal)","mL/kg/min",19.7,4.6,None,None,"mean_sd","PC-MRI",20,["yzet2010"],"B","AD_LS_ART + AD_INT_ART flow","1.18-1.35 L/min. Model: LS bed = liver + spleen; portal ~ gut (INT) bed.",age="mean 26 y, mixed")
row("hepatic_art",H,"Hepatic arterial flow","mL/kg/min",3.7,None,None,None,None,"PC-MRI: 19 % of total liver flow",20,["yzet2010"],"B","AD_LS_ART flow","")
row("sma",H,"Gut (portal) inflow","mL/kg/min",16.0,None,10.9,None,"derived; Doppler lower bound","PC-MRI portal = 81 % of liver flow; fasting Doppler portal 656 mL/min",20,["yzet2010","szinnai2001"],"B/C","AD_INT_ART flow","No verified fasting SMA volume flow; portal flow used as the gut-bed target.")
row("cor_flow",H,"Coronary blood flow (whole heart)","mL/min",None,None,160,250,"derived range","resting MBF 0.65-0.76 mL/min/g (CMR median age 23; PET) x whole-heart mass ~250 g; textbook ~250 mL/min (4-5 % of CO)",None,["brown2018","czernin1993","textbook"],"C (derived)","AA_COR flow","Corrected 2026-11-27: the first version (60) was MBF x LV mass only. Model heart weight (Mob) ~266 g at 60 kg.")
row("mvo2",H,"Myocardial O2 consumption","mL/100 g/min",12.9,2.4,None,None,"mean_sd","PET",13,["peterson2007"],"B","Mob.mob_vo2 / hw","Women > men (9.5) in the same study.",age="young women")
row("icp",H,"Intracranial pressure","mmHg",7,None,0,15,"compromise","LP opening 4-18 mmHg (lateral) vs supine telemetric ~0.5",None,["leelueck2014","andresen2014"],"C","Brain.icp","")
row("cpp",H,"Cerebral perfusion pressure","mmHg",75,None,60,90,"derived","MAP - ICP",None,["toering2015"],"C","Brain.cpp","")
row("aov_peak",H,"Aortic valve peak velocity","m/s",1.2,0.2,None,None,"mean_sd","CMR",None,["kb2020"],"B",NONE,"",age="women")
B="breathing"
row("rr",B,"Respiratory rate","/min",15,2,None,None,"mean_sd","respiratory inductance plethysmography, supine",None,["parreira2010"],"B","Breathing.resp_rate","",age="women 20-39 y")
row("vt",B,"Tidal volume","mL/kg",5.4,2.1,None,None,"mean_sd","RIP, supine",None,["parreira2010"],"B","Breathing.exp_tidal_volume","325 +/- 127 mL. Below the 6-7 mL/kg often used in models.",age="women 20-39 y")
row("mv",B,"Minute ventilation","mL/kg/min",78,22,None,None,"mean_sd","RIP, supine",None,["parreira2010","goldberg2017"],"B","Breathing.minute_volume","4.69 +/- 1.34 L/min supine; 8.1 L/min seated with a mask (Goldberg).",age="women 20-39 y")
row("ti_ttot",B,"Duty cycle Ti/Ttot","-",0.39,0.03,None,None,"mean_sd","RIP, supine",None,["parreira2010"],"B","Breathing.ie_ratio","",age="women 20-39 y")
row("ptif",B,"Peak tidal inspiratory flow","L/min/kg",0.31,None,None,None,None,"derived from mean inspiratory flow 199 mL/s",None,["parreira2010"],"C","MOUTH_DS peak flow","")
row("ptef",B,"Peak tidal expiratory flow","L/min/kg",0.25,None,None,None,None,"derived",None,["parreira2010"],"C","MOUTH_DS peak flow","")
row("crs",B,"Respiratory system compliance (static, awake, supine)","mL/cmH2O",90,None,80,100,"estimate","CL 150-200 and Ccw ~200 in series",None,["gertler2021"],"C","lung + chest wall in series","No awake cohort found; anaesthetised supine ~43 (do not mix).")
row("cl",B,"Lung compliance","mL/cmH2O/kg",2.9,None,2.5,3.3,"review range","150-200 mL/cmH2O",None,["gertler2021"],"C","ALL + ALR in parallel","")
row("ccw",B,"Chest wall compliance","mL/cmH2O/kg",3.3,None,None,None,None,"~200 mL/cmH2O",None,["gertler2021"],"C","THORAX","")
row("rrs",B,"Respiratory resistance (R5 oscillometry)","cmH2O/L/s",3.2,None,2.3,5.0,"LLN-ULN","oscillometry R5, reference equation for F 26 y 165 cm",None,["valach2026"],"A","MOUTH_DS + DS_ALL//DS_ALR","Device-specific; plethysmographic Raw ~2.3 (Piatti 2012, derived).")
row("frc",B,"Functional residual capacity (supine)","mL/kg",30,None,None,None,None,"GLI 2021 upright 2.63 L minus the supine fall (0.5-1.07 L)",None,["hall2021","drummond1996"],"B/C","min(ALL + ALR + DS) gas volume","~1.8 L supine; upright 2.63 L (44 mL/kg).")
row("tlc",B,"Total lung capacity","L",5.25,None,4.25,6.36,"LLN-ULN","GLI 2021 computed for F 26 y 165 cm",None,["hall2021"],"A",NONE,"VC 4.02 L, RV 1.16 L.")
row("vd",B,"Anatomical dead space","mL/kg",2.2,None,None,None,None,"Hart 1963 equation: 132 mL",None,["hart1963"],"B","DS volume","")
row("ppl_swing",B,"Pleural (oesophageal) pressure swing","cmH2O",4,None,3,5,"median IQR","oesophageal balloon, semi-recumbent 45 deg",23,["lindner2024"],"B","none in this probe: validate_respiratory base.ppl_swing","",age="healthy adults")
row("co2_response",B,"Ventilatory response to CO2","L/min/mmHg",None,None,None,None,None,"Goldberg rebreathing start-to-end slope 0.38 L/min/mmHg (n~240 F); classic Read slope above threshold 1-3 (C)",240,["goldberg2017"],"A/B",
    "none in this probe: scripts/probe_co2_response.mjs","PARKED (user 2026-11-27): definition to be matched to the model's chemoreflex at the breathing step.",age="women ~24 y")
G="gases"
row("spo2",G,"SpO2","%",98.0,1.3,None,None,"mean_sd","pulse oximetry, seated",240,["goldberg2017"],"A/B","Monitor.spo2_pre","",age="women ~24 y")
row("ph",G,"Arterial pH","-",7.40,None,7.35,7.45,"textbook range","sea level",None,["textbook","bushfield2026"],"C","arterial gas","User decision: sea-level textbook targets; cross-check 18 women at 1100 m: 7.43 +/- 0.02.")
row("pco2",G,"PaCO2","mmHg",38,None,35,45,"textbook range","sea level",None,["textbook","bushfield2026","klaestrup2011"],"C","arterial gas","Women run slightly lower; 1100 m cohort 33.5 +/- 3.8.")
row("hco3",G,"Bicarbonate","mmol/L",24,None,22,26,"textbook range","",None,["textbook","bushfield2026"],"C","arterial gas","1100 m cohort 22.4 +/- 2.4.")
row("be",G,"Base excess","mmol/L",0,None,-2,2,"textbook range","",None,["textbook","bushfield2026"],"C","arterial gas","1100 m cohort -1.8 +/- 2.6.")
row("po2",G,"PaO2","mmHg",100,None,85,110,"equation +/- range","Crapo: 106.6 - 0.245 x age",None,["crapo1999"],"B","arterial gas","")
row("etco2",G,"End-tidal CO2","mmHg",35,5,None,None,"mean_sd","capnography, seated with mask (4.65 +/- 0.68 %)",240,["goldberg2017"],"A/B","Monitor.etco2","",age="women ~24 y")
row("svo2",G,"Mixed venous O2 saturation","%",75,None,70,80,"textbook range","PA catheter",None,["barrattboyes1957"],"C","Monitor.svo2","Fick check: VO2 192 / CO 5.4 / Hb 13.5 -> ~77 %.")
M_="metabolism"
row("vo2",M_,"O2 consumption","mL/kg/min",3.2,None,2.6,3.5,"Byrne measured mean to 1 MET","Mifflin REE 1340 kcal/day + Weir -> 192 mL/min",None,["mifflin1990","byrne2005"],"B","gas exchanger O2 uptake","User decision: 3.2. Byrne measured 2.6 +/- 0.4 (mixed cohort incl. obese); 1 MET 3.5 overestimates.")
row("rq",M_,"Respiratory quotient","-",0.82,None,None,None,None,"post-absorptive",None,["textbook"],"C","CO2 out / O2 uptake","")
row("temp",M_,"Core temperature","degC",37.0,None,36.3,37.8,"range","rectal",None,["geneva2019"],"A/B","Monitor.temp","Oral 36.6.",age="adults")
row("glucose",M_,"Fasting glucose","mmol/L",4.9,None,3.9,5.5,"lab RI","",None,["textbook"],"C","AA glucose","ADA normal fasting < 5.6.")
row("lactate",M_,"Arterial lactate","mmol/L",1.0,0.5,0.5,2.2,"mean_sd; RI","arterial",18,["bushfield2026","klaestrup2011"],"B","Lactate.arterial_lactate","",age="healthy women")
BL="blood"
row("hb",BL,"Haemoglobin","g/dL",13.5,None,12.0,15.5,"LLN (P5) to lab ULN","venous",3640,["braat2024","textbook"],"A (LLN) / C (mean)","Blood composition","LLN 11.97 g/dL = WHO 2024 threshold 12.0.",age="non-pregnant women")
row("hct",BL,"Haematocrit","%",40,None,36,46,"lab RI","",None,["textbook"],"C","hb / MCHC","")
row("p50",BL,"O2 dissociation P50 (adult HbA)","mmHg",26.8,None,None,None,None,"Severinghaus equation",None,["severinghaus1979"],"B","Blood.P50_0","")
row("blood_volume",BL,"Blood volume","mL/kg",62.8,None,None,None,None,"Nadler for 1.65 m / 60 kg = 3.77 L; ICSH RCM 23.2 + PV 38.6 = 61.8 mL/kg",None,["nadler1962","icsh1995"],"B/C","sum of blood compartments","ICSH whole-body Hct 0.375 vs venous 0.40.")
row("gfr",BL,"Measured GFR","mL/min/1.73m2",109,14.1,None,None,"mean_sd","inulin/iohexol",24,["pottel2017"],"A","Kidneys.gfr","Not the textbook 120-130. Absolute ~105 mL/min.",age="women 20-30 y")
row("urine",BL,"Urine output","mL/kg/h",1.0,None,0.5,None,"oliguria threshold","",None,["textbook"],"C","Kidneys.urine_flow","")
SH="shunts"
row("pda",SH,"Ductus arteriosus flow","mL/kg/min",0,None,None,0.5,"closed","",None,["textbook"],"-","AAR_DA flow","Adult: closed.",age="adult")
row("fo",SH,"Foramen ovale flow","mL/kg/min",0,None,None,0.5,"closed","",None,["textbook"],"-","LA -> RA flow","Adult: closed (a small PFO in ~25 % is ignored).",age="adult")
out = dict(name="adult_female",
  description="Literature reference values for a healthy non-pregnant adult female (26 y, 60 kg, 1.65 m, BSA 1.65 m2), awake, supine, at rest, room air, sea level. Heart and central flows anchored on CMR norms for women 20-29 y. Grades: A = large normative cohort of matching age/sex/method; B = smaller, adjacent or derived; C = textbook/estimate.",
  state="awake, supine, rest, post-absorptive", compiled="2026-11-27", doc="docs/AdultFemaleReference.md",
  sources=[[k, dict(cite=c, doi=d, pmid=p)] for k,(c,d,p) in S.items()], variables=V)
used = {s for v in V for s in v["sources"]}; assert used <= set(S), used - set(S)
json.dump(out, open(sys.argv[1],"w"), indent=1, ensure_ascii=False)
print(len(V), "variables,", len(S), "sources")
