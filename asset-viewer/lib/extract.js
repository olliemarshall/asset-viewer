// Extract candidate assets from the first page of a vector PDF.
// A searchable text layer can be invisible or have a different colour from the
// CAD geometry, so use rendered pixels for suggested status, not text colour.
export const PATTERNS = {
  signal: /^(?:SA\d{3}|L\d{1,4}R?|OX\d{1,4}(?:\/BR\d{1,4})?|G\d{1,4})$/,
  points: /^PT\d{3}$/,
  track_circuit: /^(?:TC\d{3}|[A-Z]{1,3}(?:\(\d+\))?T|\d{3,5}(?:\([A-Z0-9]+\))?T|[A-Z]{1,3}\d{0,2}\(T\))$/,
  location_case: /^LC\d{2}$/,
  wheel_sensor: /^(?:AS|ES)\d{1,2}[AB]$/,
  track_equipment: /^(?:[A-Z]{1,3}(?:\(\d+\))?Q|\d{3,5}(?:\([A-Z0-9]+\))?Q|(?:[A-Z]{2,5}\/)?(?:UM|DM)\d{3,5}[UD]|\([A-Z]{1,5}\)Q|[A-Z]{1,3}Q\d{1,3}|BUSQ|(?:[A-Z]{2,4})(?:UM|DM)\d{2,5}(?:LCAW|SNB|PSI\d{1,3}|LX\d{1,3}))$/,
  pole: /^POLE\d{1,3}$/,
};

// Specific identifiers must take precedence over the broader signal rule.
const TYPES = ["points", "track_circuit", "location_case", "wheel_sensor", "track_equipment", "pole", "signal"];
export function matchAssetLabel(text, profile = "standard") {
  const label = String(text || "").trim().replace(/\s+/g, "").toUpperCase();
  for (const candidate of [label, [...label].reverse().join("")]) {
    const type = TYPES.find(key => PATTERNS[key].test(candidate));
    if (type) return { label: candidate, type };
    // Short references are ambiguous outside the long strip-plan profile.
    if (profile === "strip") {
      if (/^(?:BR|BH)\d{1,3}$/.test(candidate)) return { label: candidate, type: "track_equipment", uncertain: true };
      if (/^\d{1,2}[AB]$/.test(candidate)) return { label: candidate, type: "points", uncertain: true };
      if (/^[A-Z]{2}$/.test(candidate) && !/^(?:AR|SR|LR|NC|ED|YN|YO|ZN|ZO|RR|SB|LC|UP|DN|GC|NR|OX|BR|BH|TO|NO|BY|AT|ON|AS|IN|OF|IS|IT|BE)$/.test(candidate)) {
        return { label: candidate, type: "axle_counter", uncertain: true };
      }
      if (candidate === "BE") return { label: candidate, type: "axle_counter", uncertain: true };
    }
  }
  return null;
}

export const STATUS_COLOURS = {
  NEW: { label: "New", rgb: [217, 26, 26] },
  EXISTING: { label: "Existing", rgb: [38, 38, 38] },
  RECOVER: { label: "Recovered", rgb: [26, 153, 51] },
  PROPOSED: { label: "Proposed (not confirmed)", rgb: [26, 77, 217] },
  REVIEW: { label: "Needs review", rgb: [122, 122, 122] },
};
export const STATUS_ORDER = ["NEW", "EXISTING", "RECOVER", "PROPOSED", "REVIEW"];

const STANDARD = { left: 0, right: 1, top: 0.1, bottom: 0.73 };
const WIDE = { left: 0.02, right: 0.60, top: 0.1, bottom: 0.73 };
const STRIP = { left: 0.145, right: 0.80, top: 0.10, bottom: 0.90, profile: "strip", name: "Long strip plan (central drawing)" };

// Only infer a wide-layout exclusion when the notes-column evidence is present.
// Other layouts retain the previous vertical restriction. The user can also
// override the layout choice in the viewer or search the whole page.
export function chooseDrawingRegion(aspect, rightColumnText, mode = "auto") {
  if (mode === "strip" || (mode === "auto" && aspect >= 7 &&
      /GENERAL\s*NOTES|TRAIN\s*DETECTION\s*NOTES/i.test(rightColumnText))) return { ...STRIP };
  const wide = mode === "wide" || (mode === "auto" && aspect >= 2.8 &&
    /WHEEL\s*SENSOR\s*NAMING\s*CONVENTION/i.test(rightColumnText));
  return wide ? { ...WIDE, name: "Wide plan (left 60%)" } : { ...STANDARD, name: "Standard plan" };
}

export function classifyPixelData(data) {
  const votes = { NEW: 0, EXISTING: 0, RECOVER: 0, PROPOSED: 0, other: 0 };
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    if (data[i + 3] < 128 || low > 190) continue; // transparent / pale background
    total++;
    if (high - low < 35) votes.EXISTING++;
    else if (r - g >= 40 && r - b >= 40) votes.NEW++;
    else if (g - r >= 30 && g - b >= 30) votes.RECOVER++;
    else if (b - r >= 35 && b - g >= 35) votes.PROPOSED++;
    else votes.other++;
  }
  if (total < 4) return "REVIEW";
  const colour = ["NEW", "RECOVER", "PROPOSED"].sort((a, b) => votes[b] - votes[a])[0];
  if (votes[colour] / total >= 0.5) return colour;
  if (votes.EXISTING / total >= 0.75) return "EXISTING";
  return "REVIEW";
}

function classifyPixels(ctx, bounds) {
  const x = Math.max(0, Math.floor(bounds.x0)), y = Math.max(0, Math.floor(bounds.y0));
  const right = Math.min(ctx.canvas.width, Math.ceil(bounds.x1));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(bounds.y1));
  if (right <= x || bottom <= y) return "REVIEW";
  return classifyPixelData(ctx.getImageData(x, y, right - x, bottom - y).data);
}

function itemBounds(item, viewport) {
  const [a, b, c, d, e, f] = item.transform;
  const dl = Math.hypot(a, b) || 1, ul = Math.hypot(c, d) || 1;
  const height = item.height || ul;
  const dir = [(a / dl) * item.width, (b / dl) * item.width];
  const up = [(c / ul) * height, (d / ul) * height];
  const pts = [[e, f], [e + dir[0], f + dir[1]], [e + up[0], f + up[1]], [e + dir[0] + up[0], f + dir[1] + up[1]]]
    .map(([px, py]) => viewport.convertToViewportPoint(px, py));
  return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])),
    y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) };
}

function mergeBounds(a, b) {
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1),
    y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
}

// PDF.js can split the final T or Q from a track identifier into another item.
// Only join immediately adjacent, horizontally aligned items with a small gap.
function nearby(a, b) {
  const height = Math.max(a.y1 - a.y0, b.y1 - b.y0);
  const dy = Math.abs((a.y0 + a.y1 - b.y0 - b.y1) / 2);
  const gap = b.x0 - a.x1;
  return dy <= height * 0.45 && gap >= -height * 0.3 && gap <= height * 1.3;
}

export async function extractFromPdf(data, { restrictToDrawing = true, regionMode = "auto" } = {}) {
  const pdfjs = await import("pdfjs-dist/build/pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const page = await pdf.getPage(1);
  const original = page.getViewport({ scale: 1 });
  // Long CAD sheets can exceed browser canvas dimension/pixel budgets at 2x.
  const scale = Math.min(2, 8192 / Math.max(original.width, original.height),
    Math.sqrt(16000000 / (original.width * original.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The drawing is too large for this browser to render.");
  await page.render({ canvasContext: ctx, viewport }).promise;

  const text = await page.getTextContent();
  const items = text.items.filter(item => typeof item.str === "string" && item.str.trim() && item.transform)
    .map(item => ({ str: item.str, bounds: itemBounds(item, viewport), hasEOL: item.hasEOL }));
  const rightText = items.filter(item => item.bounds.x0 / canvas.width >= 0.60).map(item => item.str).join(" ");
  const region = chooseDrawingRegion(canvas.width / canvas.height, rightText, regionMode);
  const assets = new Map();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let match = matchAssetLabel(item.str, region.profile);
    let bounds = item.bounds;
    const next = items[i + 1];
    if (next && !item.hasEOL && /^[TQ]$/i.test(next.str.trim()) && nearby(bounds, next.bounds)) {
      const joined = matchAssetLabel(item.str + next.str, region.profile);
      if (joined && ["track_circuit", "track_equipment"].includes(joined.type)) {
        match = joined;
        bounds = mergeBounds(bounds, next.bounds);
        i++;
      }
    }
    if (!match) continue;
    const x = (bounds.x0 + bounds.x1) / 2 / canvas.width;
    const y = (bounds.y0 + bounds.y1) / 2 / canvas.height;
    const inside = x >= region.left && x <= region.right && y >= region.top && y <= region.bottom;
    if (restrictToDrawing && !inside) continue;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;

    // Short identifiers are only meaningful near the track diagram in this
    // layout, not in the control/notes insets.
    const mainTrack = region.profile === "strip" && y >= 0.52 && y <= 0.71;
    if (region.profile === "strip" && match.uncertain && !mainTrack) continue;
    const status = match.uncertain ? "REVIEW" : classifyPixels(ctx, bounds);
    const rank = (inside ? 2 : 0) + (mainTrack ? 4 : 0) + (status !== "REVIEW" ? 1 : 0);
    const previous = assets.get(match.label);
    // Prefer a diagram occurrence over a repeated label in a notes table.
    if (!previous || rank > previous.rank) {
      assets.set(match.label, { label: match.label, type: match.type, status, x, y, rank });
    }
  }
  return {
    canvas, assets: [...assets.values()].map(({ rank, ...asset }) => asset),
    hasText: items.length > 0, region: restrictToDrawing ? region.name : "Whole page",
    regionBounds: restrictToDrawing ? {left:region.left,right:region.right,top:region.top,bottom:region.bottom} : {left:0,right:1,top:0,bottom:1},
  };
}
