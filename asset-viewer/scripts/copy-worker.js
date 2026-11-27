// Copy version-matched browser runtime assets; fail installation if incomplete.
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const source = path.join(root, "node_modules", "pdfjs-dist");
const destination = path.join(root, "public", "pdfjs");
const manifest = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
const expected = require("../package.json").dependencies["pdfjs-dist"];
if (manifest.version !== expected) throw new Error("PDF.js version mismatch");
const worker = path.join(source, "build", "pdf.worker.min.mjs");
if (!fs.existsSync(worker)) throw new Error("PDF.js module worker missing");
for (const name of ["cmaps","standard_fonts","wasm","iccs"]) {
  if (!fs.statSync(path.join(source,name)).isDirectory()) throw new Error("PDF.js runtime directory missing: "+name);
}
fs.rmSync(destination,{recursive:true,force:true});
fs.mkdirSync(destination,{recursive:true});
fs.copyFileSync(worker,path.join(destination,"pdf.worker.min.mjs"));
for (const name of ["cmaps","standard_fonts","wasm","iccs"]) fs.cpSync(path.join(source,name),path.join(destination,name),{recursive:true});
fs.copyFileSync(path.join(source,"LICENSE"),path.join(destination,"LICENSE"));
fs.writeFileSync(path.join(destination,"version.json"),JSON.stringify({version:manifest.version})+"\n");
console.log("Installed PDF.js browser runtime "+manifest.version);
