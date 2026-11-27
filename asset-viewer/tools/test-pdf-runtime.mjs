import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const read=p=>readFileSync(root+p);
const sha=b=>createHash("sha256").update(b).digest("hex");
test("installed PDF runtime matches the pinned library and worker",()=>{
 const expected=JSON.parse(read("package.json")).dependencies["pdfjs-dist"];
 assert.equal(JSON.parse(read("node_modules/pdfjs-dist/package.json")).version,expected);
 assert.equal(JSON.parse(read("public/pdfjs/version.json")).version,expected);
 assert.equal(sha(read("public/pdfjs/pdf.worker.min.mjs")),sha(read("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")));
 for(const name of ["cmaps","standard_fonts","wasm","iccs"]) assert.ok(readdirSync(root+"public/pdfjs/"+name).length>0,name);
 assert.ok(existsSync(root+"public/pdfjs/LICENSE"));
});
