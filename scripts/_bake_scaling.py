# Scenario migration: bake the ModelScaler scaling layer into the base values (format-preserving),
# exactly as ModelScaler.incorporate() does on a live model:
#   u_vol, el_base, el_min, el_max *= their *_factor_scaling_ps;  r_for, r_back *= r_factor_scaling_ps
#   (a BloodVessel also gets el_base *= f^alpha, its R->E coupling; a HeartChamber el_k *= the el_min
#   factor), then the layer -> 1.0. On additive models the matching *_factor_ps becomes 1 + (ps-1)/f so
#   its absolute effect is unchanged.
# Only components named in the scenario's scaler_config are baked (as incorporate does).
# The generators stored their size calibration in this layer, which the bot's/lessons' absolute
# `scale` and the Scaler reset then overwrote; baked, 1.0 means "this scenario".
#
#   python3 scripts/_bake_scaling.py model_definitions/<scenario>.json [...] [--write]
import json, re, sys

WRITE = "--write" in sys.argv
files = [a for a in sys.argv[1:] if not a.startswith("--")]
LAYERS = [("u_vol", "u_vol_factor_scaling_ps"), ("el_base", "el_base_factor_scaling_ps"),
          ("el_min", "el_min_factor_scaling_ps"), ("el_max", "el_max_factor_scaling_ps")]

def names_in(v, out):
    if isinstance(v, list): out.update(n for n in v if isinstance(n, str))
    elif isinstance(v, dict):
        for x in v.values(): names_in(x, out)
    return out

def find(models, name):
    if name in models and isinstance(models[name], dict) and models[name].get("model_type"): return models[name]
    for m in models.values():
        if isinstance(m, dict) and isinstance(m.get("components"), dict):
            r = find(m["components"], name)
            if r: return r
    return None

def fmt(v):
    return json.dumps(v)

for f in files:
    src = open(f).read(); data = json.loads(src); md = data["model_definition"]
    names = sorted(names_in(md.get("scaler_config", {}), set()))
    edits = {}  # name -> {key: new}
    for n in names:
        c = find(md["models"], n)
        if not c: continue
        e = {}
        additive = c.get("model_type") != "BloodVessel"  # BloodVessel multiplies its layers; the rest add them
        for base, lay in LAYERS:
            fct = c.get(lay)
            if isinstance(fct, (int, float)) and fct != 1.0 and base in c:
                e[base] = (e.get(base, c[base])) * fct; e[lay] = 1
                # an additive layer's change is a fraction of the base: keep its absolute effect
                ps = c.get(f"{base}_factor_ps")
                if additive and isinstance(ps, (int, float)) and ps != 1.0:
                    e[f"{base}_factor_ps"] = 1 + (ps - 1) / fct
        # a HeartChamber's diastolic modulation (which contains el_min_factor_scaling_ps) also scales
        # its non-linear el_k: carry the el_min scaling into el_k as well
        fm = c.get("el_min_factor_scaling_ps")
        if c.get("model_type") == "HeartChamber" and isinstance(fm, (int, float)) and fm != 1.0 and "el_k" in c:
            e["el_k"] = c["el_k"] * fm
        fr = c.get("r_factor_scaling_ps")
        if isinstance(fr, (int, float)) and fr != 1.0:
            for k in ("r_for", "r_back"):
                if k in c: e[k] = c[k] * fr
            rps = c.get("r_factor_ps")
            if c.get("model_type") != "BloodVessel" and isinstance(rps, (int, float)) and rps != 1.0:
                e["r_factor_ps"] = 1 + (rps - 1) / fr
            if (c.get("alpha") or 0) > 0 and "el_base" in c:
                e["el_base"] = e.get("el_base", c["el_base"]) * fr ** c["alpha"]
            e["r_factor_scaling_ps"] = 1
        if e: edits[n] = e
    # apply textually: each model block's own direct keys
    lines = src.split("\n"); md_line = src[:src.index('"model_definition"')].count("\n")
    for n, e in edits.items():
        start = None
        for i in range(md_line, len(lines)):
            if re.match(rf'^\s*"{re.escape(n)}": \{{\s*$', lines[i]):
                ind = re.match(r"\s*", lines[i]).group(0) + " "
                # block end and model_type check
                depth = 0
                for j in range(i, len(lines)):
                    depth += lines[j].count("{") - lines[j].count("}")
                    if j > i and depth == 0: break
                inner_ind = re.match(r"\s*", lines[i + 1]).group(0)
                if any(lines[x].startswith(f'{inner_ind}"model_type": ') for x in range(i, j)):
                    start, end = i, j; break
        assert start is not None, (f, n)
        for k, v in e.items():
            hit = [x for x in range(start, end) if lines[x].startswith(f'{inner_ind}"{k}": ')]
            assert len(hit) == 1, (f, n, k, hit)
            x = hit[0]; comma = "," if lines[x].rstrip().endswith(",") else ""
            lines[x] = f'{inner_ind}"{k}": {fmt(v)}{comma}'
    new = "\n".join(lines)
    # verify: exactly the intended values changed
    exp = json.loads(src)
    for n, e in edits.items():
        c = find(exp["model_definition"]["models"], n); c.update(e)
    assert json.loads(new) == exp, f
    print(f"{f.split('/')[-1]}: baked {len(edits)} components")
    if WRITE: open(f, "w").write(new)
