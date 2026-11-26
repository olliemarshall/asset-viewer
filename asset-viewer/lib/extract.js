// lib/extract.js
// Reads a vector scheme plan PDF in the browser (nothing is uploaded).
//  - pdf.js gives us the text labels and where they are on the page
//  - pdf.js does NOT expose text colour, so we render the page and look at the
//    pixels under each label to decide NEW / EXISTING / RECOVER / PROPOSED.

// ---- Edit these to match your own plans --------------------------------------
export const PATTERNS = {
  signal: /^SA\d{3}$/,
  points: /^PT\d{3}$/,
  track_circuit: /^TC\d{3}$/,
  location_case: /^LC\d{2}$/,
};

export const STATUS_COLOURS = {
  NEW: { label: "New", rgb: [217, 26, 26] }, // red
  EXISTING: { label: "Existing", rgb: [38, 38, 38] }, // black
  RECOVER: { label: "Recovered", rgb: [26, 153, 51] }, // green
  PROPOSED: { label: "Proposed (not confirmed)", rgb: [26, 77, 217] }, // blue
};
export const STATUS_ORDER = ["NEW", "EXISTING", "RECOVER", "PROPOSED"];

// Title block and notes are ignored so labels mentioned in notes aren't counted.
// Fractions of page height measured from the top.
const DRAWING_AREA = { top: 0.1, bottom: 0.73 };
// -------------------------------------------------------------------------------

const kindOf = (text) => Object.keys(PATTERNS).find((k) => PATTERNS[k].test(text));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function classifyPixels(ctx, x0, y0, x1, y1) {
  const x = Math.max(0, Math.floor(x0)), y = Math.max(0, Math.floor(y0));
  const w = Math.max(1, Math.ceil(x1 - x0)), h = Math.max(1, Math.ceil(y1 - y0));
  const data = ctx.getImageData(x, y, w, h).data;
  const votes = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const px = [data[i], data[i + 1], data[i + 2]];
    if (dist(px, [255, 255, 255]) < 150) continue; // background or faint anti-aliasing
    let best = null, bestD = Infinity;
    for (const s of STATUS_ORDER) {
      const d = dist(px, STATUS_COLOURS[s].rgb);
      if (d < bestD) { best = s; bestD = d; }
    }
    votes[best]++; total++;
  }
  if (!total) return null;
  // Black lines often cross labels, so a coloured label only needs a minority of the
  // ink to be coloured. Otherwise it is existing (black).
  const coloured = STATUS_ORDER.filter((s) => s !== "EXISTING").sort((a, b) => votes[b] - votes[a])[0];
  return votes[coloured] >= 0.25 * total ? coloured : "EXISTING";
}

export async function extractFromPdf(data, { restrictToDrawing = true } = {}) {
  const pdfjs = await import("pdfjs-dist/build/pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;

  const text = await page.getTextContent();
  const assets = new Map();

  for (const item of text.items) {
    const str = item.str.trim();
    const label = kindOf(str) ? str : kindOf([...str].reverse().join("")) ? [...str].reverse().join("") : null;
    if (!label) continue;

    // Corners of the text box in PDF space -> canvas pixels (handles rotated labels)
    const [a, b, c, d, e, f] = item.transform;
    const dl = Math.hypot(a, b) || 1, ul = Math.hypot(c, d) || 1;
    const dir = [(a / dl) * item.width, (b / dl) * item.width];
    const up = [(c / ul) * item.height, (d / ul) * item.height];
    const pts = [[e, f], [e + dir[0], f + dir[1]], [e + up[0], f + up[1]], [e + dir[0] + up[0], f + dir[1] + up[1]]]
      .map(([px, py]) => viewport.convertToViewportPoint(px, py));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

    const cy = (y0 + y1) / 2 / canvas.height;
    if (restrictToDrawing && (cy < DRAWING_AREA.top || cy > DRAWING_AREA.bottom)) continue;

    const status = classifyPixels(ctx, x0, y0, x1, y1);
    if (!status) continue;
    assets.set(label, {
      label,
      type: kindOf(label),
      status,
      x: (x0 + x1) / 2 / canvas.width,
      y: cy,
    });
  }

  return { canvas, assets: [...assets.values()], hasText: text.items.length > 0 };
}
