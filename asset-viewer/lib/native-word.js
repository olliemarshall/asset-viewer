import JSZip from "jszip";
export const WORD_FORMS={
 tq:{form:"F0049",issue:"2",fingerprint:"7cd1f519c60275cfb7266f256dc2b04138cd876a166cafd8d40f2228beb99540",size:250310},
 rfi:{form:"F0052",issue:"1",fingerprint:"4799b9a2571a30d253b40131482c9d6e40954bd422abf52b5521c1512bb90ce0",size:128071}
};
export const WORD_FIELDS={
 tq:[["word_to","To"],["word_from","From"],["word_doc_ref","Document reference"],["word_doc_title","Document title"],["word_solution1","Option 1 — solution and technical compliance"],["word_cost1","Option 1 — estimated cost impact"],["word_programme1","Option 1 — estimated programme impact"],["word_solution2","Option 2 — solution and technical compliance"],["word_cost2","Option 2 — estimated cost impact"],["word_programme2","Option 2 — estimated programme impact"],["word_proposal","Proposed solution and rationale (draft)"],["word_proposal_cost","Estimated cost impact of proposal"],["word_proposal_programme","Estimated programme impact of proposal"],["word_scope_change","Change to scope? (recorded assessment)"]],
 rfi:[["word_to","To (provider)"],["word_from","From (originator)"],["word_doc_ref","Document reference and version"],["word_discipline","Discipline or function"],["word_contact","Organisation / contractor / contact believed to hold information"]]
};
const NS="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML="http://www.w3.org/XML/1998/namespace";
const children=(el,name)=>Array.from(el?.children||[]).filter(n=>n.namespaceURI===NS&&n.localName===name);
const str=v=>typeof v==="string"?v.trim():"";
const compact=(...v)=>v.map(str).filter(Boolean).join("\n");
export async function fingerprint(bytes){
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
}
export async function identifyWord(bytes,kind){
 const form=WORD_FORMS[kind];
 if(!form||bytes.byteLength!==form.size||await fingerprint(bytes)!==form.fingerprint)throw Error("This is not the exact mapped original "+(form?form.form+" Issue "+form.issue:"form")+". Select the unchanged file from the supplied standards pack. Other issues require a new mapping.");
 return form;
}
export function toBase64(bytes){
 let s="";const a=new Uint8Array(bytes);for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);
}
export function fromBase64(s){
 if(typeof s!=="string"||s.length>400000)throw Error("Stored template exceeds supported size.");
 return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
}
export function mappedCells(project,record){
 const d=record.details||{};
 const cells=[
 [0,2,0,project.name],[0,3,0,project.reference],[0,4,0,record.reference],
 [0,5,0,d.word_to],[0,5,1,d.word_from]
 ];
 if(record.kind==="tq"){
 cells.push([0,8,0,d.word_doc_ref],[0,8,1,d.word_doc_title],
 [0,9,0,compact(record.title,d.question,d.impact&&"Overall impacts (draft): "+d.impact,d.operations&&"Functional / operational implications (draft): "+d.operations)],
 [0,11,0,d.options&&"Option considerations (draft): "+d.options],
 [0,13,0,d.word_solution1],[0,13,1,d.word_cost1],[0,13,2,d.word_programme1],
 [0,14,0,d.word_solution2],[0,14,1,d.word_cost2],[0,14,2,d.word_programme2],
 [0,16,0,d.word_proposal],[0,17,0,d.word_proposal_programme],[0,17,1,d.word_proposal_cost],[0,19,0,d.word_scope_change]);
 }else if(record.kind==="rfi"){
 cells.push([0,8,0,d.word_doc_ref],[0,8,1,d.word_discipline],[0,9,0,compact(record.title,d.question)],[0,10,1,d.word_contact]);
 }else throw Error("No native mapping for this register.");
 return cells.map(([t,r,c,value])=>[t,r,c,str(value)]).filter(x=>x[3]);
}
function appendText(doc,p,text){
 const run=doc.createElementNS(NS,"w:r");
 const pr=doc.createElementNS(NS,"w:rPr");
 const size=doc.createElementNS(NS,"w:sz");size.setAttributeNS(NS,"w:val","20");pr.appendChild(size);run.appendChild(pr);
 for(const [i,line] of text.split(/\r?\n/).entries()){
 if(i)run.appendChild(doc.createElementNS(NS,"w:br"));
 const t=doc.createElementNS(NS,"w:t");t.setAttributeNS(XML,"xml:space","preserve");t.textContent=line;run.appendChild(t);
 }
 p.appendChild(run);
}
export async function populateWord(bytes,project,record){
 await identifyWord(bytes,record.kind);
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 const entry=zip.file("word/document.xml");
 if(!entry)throw Error("Word document part not found.");
 const doc=new DOMParser().parseFromString(await entry.async("string"),"application/xml");
 if(doc.getElementsByTagName("parsererror").length)throw Error("Invalid Word XML.");
 const body=children(doc.documentElement,"body")[0],tables=children(body,"tbl");
 const expected=record.kind==="tq"?2:4;
 if(tables.length!==expected)throw Error("Unexpected template table layout.");
 for(const [ti,ri,ci,value] of mappedCells(project,record)){
   const cell=children(children(tables[ti],"tr")[ri],"tc")[ci];
   if(!cell)throw Error("Unexpected mapped cell.");
   const ps=children(cell,"p");
   // Reuse a trailing empty paragraph if available; otherwise append a line
   // after the original label. Never erase the controlled template's wording.
   const p=ps.find((p,i)=>i>0&&!p.textContent.trim()&&!p.getElementsByTagNameNS(NS,"drawing").length)||doc.createElementNS(NS,"w:p");
   if(!p.parentNode)cell.appendChild(p);
   appendText(doc,p,value);
 }
 // Draft marker appears inside the output, not just in the filename.
 const p=doc.createElementNS(NS,"w:p");
 appendText(doc,p,"SCHEMEWORKS WORKING DRAFT — NOT APPROVED | Record "+record.reference+" · v"+record.version);
 body.insertBefore(p,tables[0]);
 zip.file("word/document.xml",new XMLSerializer().serializeToString(doc));
 return zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",compression:"DEFLATE"});
}
