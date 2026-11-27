"""Prints the variable tables of docs/AdultFemaleReference.md from scripts/reference/adult_female.json (paste between the intro and Open items).
Usage: python3 scripts/reference/_adult_female_doc_tables.py scripts/reference/adult_female.json"""
import json, sys
r = json.load(open(sys.argv[1])); src = dict((k, v) for k, v in r["sources"])
def f(x):
    if x is None: return ""
    return f"{x:g}" if isinstance(x, (int, float)) else str(x)
def ref(v):
    m, s = v["mean"], v["sd"]
    return "" if m is None else (f"{f(m)} ± {f(s)}" if s else f(m))
def rng(v):
    lo, hi = v["low"], v["high"]
    if lo is None and hi is None: return ""
    return f"{f(lo) or '—'}–{f(hi) or '—'}"
def cite(k):
    c = src[k]["cite"].split(".")[0]
    pm = src[k]["pmid"]
    return f"{c} (PMID {pm})" if pm else c
TITLES = {"hemodynamics": "Hemodynamics, heart and flows", "breathing": "Breathing", "gases": "Gases and saturations",
          "metabolism": "Metabolism", "blood": "Blood and kidneys", "shunts": "Shunts"}
out = []
for g, t in TITLES.items():
    out.append(f"\n## {t}\n\n| Variable | Unit | Reference | Range | Method, cohort, n | Grade | Source | Notes |\n|---|---|---|---|---|---|---|---|")
    for v in r["variables"]:
        if v["group"] != g: continue
        meth = "; ".join(x for x in [v["method"], v["age"], f"n={v['n']}" if v["n"] else ""] if x)
        out.append(f"| {v['label']} (`{v['key']}`) | {v['unit']} | {ref(v)} | {rng(v)} | {meth} | {v['grade']} | {'; '.join(cite(s) for s in v['sources'])} | {v['notes']} |")
out.append("\n## Sources\n")
for k, s in src.items():
    ids = ", ".join(x for x in [f"doi:{s['doi']}" if s["doi"] else "", f"PMID {s['pmid']}" if s["pmid"] else ""] if x)
    out.append(f"- **{k}**: {s['cite']}" + (f" ({ids})" if ids else ""))
print("\n".join(out))
