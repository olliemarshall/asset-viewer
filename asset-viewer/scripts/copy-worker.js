// Copies the PDF.js worker into /public so the browser can load it from our own site.
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.js");
const dest = path.join(__dirname, "..", "public", "pdf.worker.min.js");
if (fs.existsSync(src)) fs.copyFileSync(src, dest);
else console.warn("pdf.worker.min.js not found; run npm install again");
