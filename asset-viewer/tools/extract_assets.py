"""
extract_assets.py

Pulls asset labels out of a VECTOR scheme plan PDF using the text layer
(no AI, no image recognition), classifies NEW / EXISTING / RECOVER from the
text colour, and scores the result against ground_truth.json.

Run:  python3 extract_assets.py [scheme_plan.pdf]
"""
import json
import math
import re
import sys
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else "scheme_plan.pdf"

# Label patterns (FICTIONAL naming; real schemes would need configurable patterns)
PATTERNS = {
    "signal": re.compile(r"^SA\d{3}$"),
    "points": re.compile(r"^PT\d{3}$"),
    "track_circuit": re.compile(r"^TC\d{3}$"),
    "location_case": re.compile(r"^LC\d{2}$"),
}

# Colour legend. In real use, read these from the drawing's legend or let the user set them.
STATUS_COLOURS = {
    "NEW": (0.85, 0.10, 0.10),
    "EXISTING": (0.15, 0.15, 0.15),
    "RECOVER": (0.10, 0.60, 0.20),   # green
    "PROPOSED": (0.10, 0.30, 0.85),  # blue, proposed but not confirmed
}


def classify_colour(rgb):
    """Nearest legend colour. Returns None if nothing is close (e.g. black body text)."""
    if rgb is None or len(rgb) != 3:
        return None
    best, best_d = None, 1e9
    for status, ref in STATUS_COLOURS.items():
        d = math.dist(rgb, ref)
        if d < best_d:
            best, best_d = status, d
    return best if best_d < 0.12 else None


def kind_of(text):
    for kind, pat in PATTERNS.items():
        if pat.match(text):
            return kind
    return None


def extract(pdf_path, drawing_top_margin=90, drawing_bottom_margin=230):
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        n_chars = len(page.chars)
        if n_chars == 0:
            return None, page, 0
        # Only look inside the drawing area; title block and notes are excluded,
        # so labels mentioned in notes text are not mistaken for assets.
        y_min, y_max = drawing_top_margin, page.height - drawing_bottom_margin
        words = page.extract_words(extra_attrs=["non_stroking_color", "upright"])
        found = {}
        for w in words:
            text = w["text"]
            if not w["upright"]:
                text = text[::-1]  # rotated labels come back reversed
            kind = kind_of(text)
            status = classify_colour(w["non_stroking_color"])
            if not kind or not status:
                continue
            cy = (w["top"] + w["bottom"]) / 2
            if not (y_min <= cy <= y_max):
                continue
            found[text] = {
                "label": text,
                "type": kind,
                "status": status,
                "x": round((w["x0"] + w["x1"]) / 2, 1),
                "y_from_top": round(cy, 1),
                "x_norm": round((w["x0"] + w["x1"]) / 2 / page.width, 4),
                "y_norm": round(cy / page.height, 4),
                "rotated": not w["upright"],
            }
        return list(found.values()), page, n_chars


assets, page, n_chars = extract(PDF)

print(f"File: {PDF}")
print(f"Text characters in PDF: {n_chars}")
if assets is None:
    print("\nNo text layer found. This is an image-only (scanned) drawing.")
    print("Text extraction cannot work here; this needs OCR or a vision model,")
    print("with human checking of the results.")
    sys.exit(0)

with open("extracted_assets.json", "w") as f:
    json.dump(assets, f, indent=2)

# ---- Score against ground truth ---------------------------------------------
truth = {a["label"]: a for a in json.load(open("ground_truth.json"))["assets"]}
got = {a["label"]: a for a in assets}
H = page.height

missed = sorted(set(truth) - set(got))
extra = sorted(set(got) - set(truth))
wrong_status = [l for l in got if l in truth and got[l]["status"] != truth[l]["status"]]
wrong_type = [l for l in got if l in truth and got[l]["type"] != truth[l]["type"]]
dists = []
for l in got:
    if l in truth:
        tx, ty = truth[l]["x"], H - truth[l]["y"]  # convert to top-left origin
        dists.append(math.dist((got[l]["x"], got[l]["y_from_top"]), (tx, ty)))

print(f"\nAssets on drawing (ground truth): {len(truth)}")
print(f"Assets found:                     {len(got)}")
print(f"Missed:                {missed or 'none'}")
print(f"False positives:       {extra or 'none'}")
print(f"Wrong status:          {wrong_status or 'none'}")
print(f"Wrong type:            {wrong_type or 'none'}")
if dists:
    print(f"Label-to-symbol distance: avg {sum(dists)/len(dists):.0f} pt, max {max(dists):.0f} pt "
          f"(labels sit beside symbols, so this is an offset, not an error)")
rot = [l for l in got.values() if l["rotated"]]
print(f"Rotated labels recovered: {[r['label'] for r in rot] or 'none'}")

print("\nSummary by status:")
for st in ("NEW", "EXISTING", "RECOVER", "PROPOSED"):
    labels = sorted(l for l in got if got[l]["status"] == st)
    print(f"  {st:9s} ({len(labels)}): {', '.join(labels)}")
print("\nWrote extracted_assets.json")
