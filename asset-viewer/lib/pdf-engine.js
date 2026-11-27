// Browser-only PDF engine. Worker and auxiliary data are copied from the
// same pinned package on install; no external CDN or full scripting viewer.
export async function loadPdfDocument(data) {
  if (typeof window === "undefined") throw new Error("PDF parsing requires the browser.");
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  const root = new URL("/pdfjs/", window.location.origin).href;
  pdfjs.GlobalWorkerOptions.workerSrc = root + "pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data,
    cMapUrl: root + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: root + "standard_fonts/",
    wasmUrl: root + "wasm/",
    iccUrl: root + "iccs/",
    // We render canvases and read text only; never attach a scripting manager.
    enableScripting: false,
    isEvalSupported: false,
    enableXfa: false,
  });
  try { return await task.promise; }
  catch (error) { await task.destroy().catch(() => {}); throw error; }
}
