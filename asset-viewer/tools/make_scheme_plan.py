"""
make_scheme_plan.py

Draws a FICTIONAL signalling scheme plan as a vector PDF (A3 landscape), the way
a CAD export would look: real text objects, coloured by status.

  red   = NEW asset
  black = EXISTING asset
  green = asset to be RECOVERED
  blue  = PROPOSED but not yet confirmed

It also writes:
  ground_truth.json      what is really on the drawing (to score the extractor)
  scheme_plan_scanned.pdf  the same drawing flattened to an image (no text layer)

Run:  python3 make_scheme_plan.py
"""
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, black
import pypdfium2 as pdfium

W, H = 1191, 842  # A3 landscape in points
RED, BLUE, GREEN, GREY = Color(0.85, 0.1, 0.1), Color(0.1, 0.3, 0.85), Color(0.1, 0.6, 0.2), Color(0.15, 0.15, 0.15)
COLOUR = {"NEW": RED, "EXISTING": GREY, "RECOVER": GREEN, "PROPOSED": BLUE}

# Drawing area (everything below this y is title block / notes)
DRAWING_TOP, DRAWING_BOTTOM = H - 90, 230

assets = []  # ground truth


def add(label, kind, status, x, y):
    assets.append({"label": label, "type": kind, "status": status, "x": x, "y": y})


c = canvas.Canvas("scheme_plan.pdf", pagesize=(W, H))
c.setTitle("SAMPLE Area 3 Resignalling - Scheme Plan (FICTIONAL)")

# ---- Track layout --------------------------------------------------------
c.setStrokeColor(GREY)
c.setLineWidth(2)
MAIN_Y, LOOP_Y = 560, 440
c.line(60, MAIN_Y, 1130, MAIN_Y)                 # main line
c.line(300, LOOP_Y, 900, LOOP_Y)                 # loop line
c.line(220, MAIN_Y, 300, LOOP_Y)                 # diverge
c.line(900, LOOP_Y, 980, MAIN_Y)                 # converge
c.line(640, MAIN_Y, 700, MAIN_Y + 70)            # siding spur
c.line(700, MAIN_Y + 70, 860, MAIN_Y + 70)

# ---- helpers -------------------------------------------------------------
def label(text, x, y, status, size=9, rotate=False):
    c.setFillColor(COLOUR[status])
    c.setFont("Helvetica-Bold" if status == "NEW" else "Helvetica", size)
    if rotate:
        c.saveState()
        c.translate(x, y)
        c.rotate(90)
        c.drawString(0, 0, text)
        c.restoreState()
    else:
        c.drawString(x, y, text)


def signal(lbl, x, y, status, up=True):
    c.setStrokeColor(COLOUR[status]); c.setFillColor(COLOUR[status]); c.setLineWidth(1.4)
    d = 1 if up else -1
    c.line(x, y, x, y + d * 24)
    c.line(x, y + d * 24, x + 12, y + d * 24)
    c.circle(x + 17, y + d * 24, 5, fill=1)
    label(lbl, x - 6, y + d * 34 if up else y + d * 42, status)
    add(lbl, "signal", status, x, y + d * 24)


def points(lbl, x, y, status):
    c.setStrokeColor(COLOUR[status]); c.setLineWidth(1.4)
    c.rect(x - 7, y - 7, 14, 14, fill=0)
    label(lbl, x - 14, y - 22, status)
    add(lbl, "points", status, x, y)


def track_circuit(lbl, x1, x2, y, status, rotate_label=False):
    c.setStrokeColor(COLOUR[status]); c.setLineWidth(1.0)
    c.line(x1, y - 14, x1, y - 4); c.line(x2, y - 14, x2, y - 4)  # insulated joints
    c.line(x1, y - 9, x2, y - 9)
    mid = (x1 + x2) / 2
    if rotate_label:
        label(lbl, mid + 4, y - 80, status, rotate=True)
    else:
        label(lbl, mid - 16, y - 38, status)
    add(lbl, "track_circuit", status, mid, y - 9)


def case(lbl, x, y, status):
    c.setStrokeColor(COLOUR[status]); c.setFillColor(COLOUR[status])
    c.rect(x, y, 26, 16, fill=1)
    label(lbl, x - 2, y + 22, status)
    add(lbl, "location_case", status, x + 13, y + 8)


# ---- Assets ---------------------------------------------------------------
# Main line
signal("SA101", 120, MAIN_Y, "EXISTING")
signal("SA102", 340, MAIN_Y, "NEW")
signal("SA103", 520, MAIN_Y, "NEW")
signal("SA104", 780, MAIN_Y, "EXISTING")
signal("SA105", 1040, MAIN_Y, "RECOVER")
# Loop line (signals face the other way, drawn below)
signal("SA106", 400, LOOP_Y, "NEW", up=False)
signal("SA107", 820, LOOP_Y, "NEW", up=False)

points("PT201", 220, MAIN_Y, "NEW")
points("PT202", 980, MAIN_Y, "EXISTING")
points("PT203", 640, MAIN_Y, "NEW")
points("PT204", 300, LOOP_Y, "RECOVER")

track_circuit("TC301", 120, 340, MAIN_Y, "EXISTING")
track_circuit("TC302", 340, 520, MAIN_Y, "NEW")
track_circuit("TC303", 520, 780, MAIN_Y, "NEW")
track_circuit("TC304", 300, 520, LOOP_Y, "NEW", rotate_label=True)  # edge case: vertical label
track_circuit("TC305", 520, 900, LOOP_Y, "EXISTING")

signal("SA108", 820, MAIN_Y + 70, "PROPOSED")
case("LC03", 900, 640, "PROPOSED")
case("LC01", 560, 600, "NEW")
case("LC02", 150, 600, "EXISTING")

# ---- Chainage markers and station name (noise the extractor must ignore) ----
c.setFillColor(GREY); c.setFont("Helvetica", 8)
for i, x in enumerate(range(100, 1130, 200)):
    c.drawString(x, MAIN_Y + 150, f"{44 + i}m {20 * i:02d}ch")
c.setFont("Helvetica-Oblique", 12)
c.drawString(620, DRAWING_BOTTOM + 20, "FICTIONAL JUNCTION STATION")

# ---- Legend ---------------------------------------------------------------
lx, ly = 60, 195
c.setStrokeColor(GREY); c.rect(lx - 10, ly - 75, 330, 110)
c.setFillColor(black); c.setFont("Helvetica-Bold", 10); c.drawString(lx, ly + 18, "LEGEND")
for i, (txt, st) in enumerate([("NEW EQUIPMENT", "NEW"), ("EXISTING EQUIPMENT", "EXISTING"),
                               ("EQUIPMENT TO BE RECOVERED", "RECOVER"),
                               ("PROPOSED - NOT CONFIRMED", "PROPOSED")]):
    c.setFillColor(COLOUR[st]); c.setStrokeColor(COLOUR[st])
    c.rect(lx, ly - 4 - i * 18, 18, 8, fill=1)
    c.setFont("Helvetica", 9); c.drawString(lx + 28, ly - 4 - i * 18, txt)

# ---- Notes (false-positive trap: mentions asset labels in prose) -----------
c.setFillColor(black); c.setStrokeColor(GREY)
c.rect(420, 100, 420, 90)
c.setFont("Helvetica-Bold", 10); c.drawString(430, 175, "NOTES")
c.setFont("Helvetica", 8.5)
for i, line in enumerate([
    "1. This drawing is FICTIONAL and for software testing only.",
    "2. Existing signal SA104 to be retained, lamp units to be renewed.",
    "3. Cable routes to LC01 are shown on drawing SAMPLE-CAB-002.",
    "4. See PT203 and PT204 interlocking data on SAMPLE-ID-001.",
]):
    c.drawString(430, 158 - i * 14, line)

# ---- Title block ----------------------------------------------------------
c.setStrokeColor(GREY); c.rect(870, 20, 300, 170)
c.setFillColor(black); c.setFont("Helvetica-Bold", 11)
c.drawString(880, 170, "SAMPLE AREA 3 RESIGNALLING")
c.setFont("Helvetica", 9)
for i, line in enumerate(["SCHEME PLAN - SHEET 1 OF 1", "DRAWING NO: SAMPLE-SP-001",
                          "REVISION: P02", "STATUS: FOR INFORMATION (FICTIONAL)",
                          "SCALE: NOT TO SCALE"]):
    c.drawString(880, 150 - i * 16, line)

c.showPage()
c.save()

with open("ground_truth.json", "w") as f:
    json.dump({"page_width": W, "page_height": H, "assets": assets}, f, indent=2)

# ---- Flatten to an image-only PDF (simulates a scan: no text layer) ----------
pdf = pdfium.PdfDocument("scheme_plan.pdf")
img = pdf[0].render(scale=2).to_pil().convert("RGB")
img.save("scheme_plan_scanned.pdf", resolution=144)

print(f"Wrote scheme_plan.pdf, scheme_plan_scanned.pdf, ground_truth.json ({len(assets)} assets)")
