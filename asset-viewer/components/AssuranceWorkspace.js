"use client";
import {useEffect,useState,useRef} from "react";
import NativeWordLibrary from "./NativeWordLibrary";
import TechnicalQueryForm from "./TechnicalQueryForm";
import IDCMinutes from "./IDCMinutes";
import RecordAttachments from "./RecordAttachments";
import RecordWorkflow from "./RecordWorkflow";
import RecordAssetLinks from "./RecordAssetLinks";
import {loadProjectRecords} from "../lib/assurance-tracking";
import {WORD_FIELDS} from "../lib/native-word";

// SchemeWorks working drafts, not copies of controlled Network Rail forms.
export const KINDS={
 tq:{name:"Technical queries",clause:"13.2",form:"F0049",fields:[["question","Technical issue / conflict / AFC change"],["options","Options and technical compliance"],["impact","Cost, resource, time and programme impacts"],["operations","Functional and operational implications"],["response","Response / evidence"],["instruction","Separate instruction reference (if applicable)"]]},
 rfi:{name:"Requests for information",clause:"13.3",form:"F0052",fields:[["question","Information missing or clarification required"],["response","Response / evidence"]]},
 variation:{name:"Variations",clause:"12",form:"",fields:[["standard","Standard and clause"],["proposal","Proposed departure"],["mitigation","Risk assessment and mitigation reference"],["decision","Formal variation decision / evidence reference"],["management_action","Next action"],["management_response","Response / evidence reference"]]},
 idr:{name:"IDR issues and actions",clause:"15.4",form:"F0045B",fields:[["deliverable","Deliverable / revision"],["meeting","Review date / certificate reference"],["issue","Interface issue or action"],["resolution","Resolution / closure evidence"],["waiver","DPE waiver reference, where applicable"]]},
 idc:{name:"Interdisciplinary checks",clause:"15.3",form:"F0046",fields:[["deliverable","Deliverable / revision"],["meeting","Check meeting / attendees"],["issue","Comments and actions"],["resolution","Closure evidence"],["certificate","Signed certificate reference"]]},
 deliverable:{name:"Engineering deliverables",clause:"15.1, 15.7",form:"F0044",fields:[["revision","Deliverable revision"],["scope","CR-T / baseline scope"],["discipline","Discipline"],["review","Review category / evidence"],["idc","IDC / IDR references"],["approval","Technical approval evidence, if applicable"],["acceptance","Technical acceptance / DRN reference"]]},
 appointment:{name:"Engineering appointments",clause:"10.1",form:"F0042 / F0053 and applicable appointment form",fields:[["person","Appointee"],["role","Engineering role"],["scope","Discipline and scope"],["competence","Competence evidence reference"],["mitigation","Mentoring / supervision arrangements"],["acceptance","Signed appointment and acceptance reference"],["review","Next review / withdrawal details"]]},
 hazard:{name:"Hazard records",clause:"5.2.4",form:"",fields:[["hazard","Hazard / affected interface"],["consequence","Potential consequence"],["control","Controls and residual risk"],["evidence","Assessment and transfer evidence"]]},
 change:{name:"Technical changes",clause:"14",form:"",fields:[["standard","Changed standard / requirement"],["impact","Technical, programme and cost impact"],["decision","Change-control decision / evidence reference"]]},
 ecc:{name:"ECC preparation",clause:"16",form:"F0048",fields:[["section","Section 1 or 2"],["scope","Scope / baseline requirements"],["evidence","Evidence of compliance and related Section 1 forms"],["exceptions","Variations and exceptions"],["review","Review / endorsement / acceptance evidence references"]]},
 ecmp:{name:"ECMP preparation",clause:"11.2",form:"",fields:[["scope","Project engineering and construction scope"],["roles","Roles and responsibilities"],["integration","Technical integration arrangements"],["arrangements","Project-specific processes"],["approval","Approval and endorsement evidence references"]]}
};
export const TAB_NAMES={tq:"TQs",rfi:"RFIs",variation:"Variations",idr:"IDRs",idc:"IDC / IDRs",deliverable:"Deliverables",appointment:"Appointments",hazard:"Hazard Record",change:"Technical changes",ecc:"ECC",ecmp:"ECMP"};
const extraOptionsText=d=>Array.isArray(d?.word_extra_options)?d.word_extra_options.map((o,i)=>"Option "+(i+3)+": "+(o.solution||"")+"\nCost impact: "+(o.cost||"")+"\nProgramme impact: "+(o.programme||"")).join("\n\n"):"";
const STATUSES={note:"Note",deferred:"Deferred",draft:"Draft",open:"Open",in_review:"In review",closed:"Closed (record only)",withdrawn:"Withdrawn"};
const fresh=()=>({reference:"",title:"",status:"draft",owner:"",due_date:"",details:{}});
const placeholders=["project","project_reference","register","reference","title","status","owner","due_date","clause","form_reference","details","record_version","generated_date"];
function values(project,record){
  const cfg=KINDS[record.kind];
  const out={project:project.name,project_reference:project.reference,register:cfg.name,reference:record.reference,title:record.title,status:STATUSES[record.status],owner:record.owner,due_date:record.due_date||"",clause:"NR/L2/RSE/02009 Issue 8 · "+cfg.clause,form_reference:cfg.form||"Not specified here",record_version:String(record.version),generated_date:new Date().toISOString().slice(0,10),details:[...cfg.fields,...(WORD_FIELDS[record.kind]||[])].map(([k,l])=>l+":\n"+(record.details?.[k]||"[Not recorded]")).join("\n\n")};
  for(const [k] of [...cfg.fields,...(WORD_FIELDS[record.kind]||[])])out["field_"+k]=record.details?.[k]||"";
  if(record.kind==="tq"){out.field_extra_solutions=extraOptionsText(record.details);if(out.field_extra_solutions)out.details+="\n\nAdditional solution options:\n"+out.field_extra_solutions;}
  return out;
}
const defaultTemplate="Project: {{project}} ({{project_reference}})\nRecord: {{reference}} — {{title}}\nRegister: {{register}}\nStandard reference: {{clause}}\nRelated form: {{form_reference}}\nRecord status: {{status}}\nOwner: {{owner}}\nDue: {{due_date}}\n\n{{details}}\n\nRecord version: {{record_version}}\nGenerated: {{generated_date}}";
const fill=(body,data)=>body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(m,k)=>Object.hasOwn(data,k)?data[k]:m);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function download(name,body,type){
  const url=URL.createObjectURL(new Blob([body],{type}));
  Object.assign(document.createElement("a"),{href:url,download:name}).click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function safeName(s){return String(s).replace(/[^a-z0-9._-]/gi,"_").slice(0,100)||"record";}
function csvCell(v){let s=String(v??"");if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export default function AssuranceWorkspace({db,project,canEdit,initialRecord=null,onOpenAsset}){
 const [kind,setKind]=useState(initialRecord?.kind&&Object.hasOwn(KINDS,initialRecord.kind)?initialRecord.kind:"tq"),[rows,setRows]=useState([]),[templates,setTemplates]=useState([]);
 const [draft,setDraft]=useState(null),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[search,setSearch]=useState(""),[status,setStatus]=useState("");
 const [selected,setSelected]=useState(initialRecord?.id||null),[templateId,setTemplateId]=useState(""),[templateName,setTemplateName]=useState(""),[templateBody,setTemplateBody]=useState(defaultTemplate),[showTemplate,setShowTemplate]=useState(false);
 const live=useRef(true),lock=useRef(false);
 const cfg=KINDS[kind];
 const coordination=["idc","idr"].includes(kind);
 const wordFields=WORD_FIELDS[kind]||[];
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function refresh(){
   setLoading(true);setError("");
   try{
     const [a,b]=await Promise.all([loadProjectRecords(db,project.id).then(data=>({data})),db.from("assurance_templates").select("*").eq("project_id",project.id).order("name")]);
     if(a.error)throw a.error;if(b.error)throw b.error;
     if(live.current){setRows(a.data||[]);setTemplates(b.data||[]);}
   }catch(e){if(live.current)setError(e.message);}
   finally{if(live.current)setLoading(false);}
 }
 useEffect(()=>{refresh();},[project.id]);
 function switchKind(k){setKind(k);setDraft(null);setEditing(null);setSelected(null);setTemplateId("");setShowTemplate(false);setSearch("");setStatus("");}
 async function perform(fn){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await fn();}catch(e){if(live.current)setError(e.message);}finally{lock.current=false;if(live.current)setBusy(false);}}
 function save(e){e.preventDefault();if(!canEdit||!draft)return;perform(async()=>{
   const payload={...draft,reference:draft.reference.trim(),title:draft.title.trim(),owner:draft.owner.trim(),due_date:draft.due_date||null};
   const res=editing?await db.from("assurance_records").update({...payload,version:editing.version+1}).eq("id",editing.id).eq("version",editing.version).select("id").maybeSingle():await db.from("assurance_records").insert({...payload,project_id:project.id,kind}).select("id").single();
   if(res.error)throw res.error;if(!res.data)throw Error("Record changed or edit access revoked. Your changes were not saved. Refresh and reopen the record.");
   setDraft(null);setEditing(null);setSelected(res.data.id);setNotice("Register record saved.");await refresh();
 });}
 function saveTemplate(e){e.preventDefault();if(!canEdit)return;perform(async()=>{
   const res=await db.from("assurance_templates").insert({project_id:project.id,kind,name:templateName.trim(),body:templateBody}).select("id").single();
   if(res.error)throw res.error;setTemplateId(res.data.id);setShowTemplate(false);setTemplateName("");setNotice("Reusable text template saved.");await refresh();
 });}
 const filtered=rows.filter(r=>r.kind===kind&&!(coordination&&r.details?.idc_minute===true)&&(!status||r.status===status)&&[r.reference,r.title,r.owner].some(v=>String(v||"").toLowerCase().includes(search.toLowerCase().trim())));
 const record=rows.find(r=>r.id===selected&&r.kind===kind);
 const text=record?fill(templates.find(t=>t.id===templateId&&t.kind===kind)?.body||defaultTemplate,values(project,record)):"";
 function exportDraft(){
   if(!record)return;
   const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>'+escape(record.reference)+' — SchemeWorks draft</title><style>body{font:15px system-ui;margin:40px;max-width:850px;color:#222}h1{font-size:25px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.55}header,footer{border-bottom:1px solid #aaa;padding:12px 0}footer{border-top:1px solid #aaa;border-bottom:0;font-size:12px}@media print{body{margin:15mm}}</style><header><strong>SchemeWorks · WORKING DRAFT — NOT APPROVED</strong></header><h1>'+escape(record.title)+'</h1><pre>'+escape(text)+'</pre><footer>Not an official Network Rail form, signature, technical acceptance, formal instruction or compliance certificate. Verify against applicable controlled documents and project arrangements.</footer></html>';
   download(safeName(record.reference)+"-draft.html",html,"text/html;charset=utf-8");
 }
 function exportRegister(){
   const keys=["Reference","Title","Status","Owner","Due date","Record version",...cfg.fields.map(x=>x[1]),...wordFields.map(x=>x[1]),...(kind==="tq"?["Additional solution options"]:[])];
   const lines=[keys,...filtered.map(r=>[r.reference,r.title,STATUSES[r.status],r.owner,r.due_date,r.version,...cfg.fields.map(([k])=>r.details?.[k]),...wordFields.map(([k])=>r.details?.[k]),...(kind==="tq"?[extraOptionsText(r.details)]:[])])].map(row=>row.map(csvCell).join(",")).join("\r\n");
   download(safeName(project.reference)+"-"+kind+"-register.csv","\ufeff"+lines,"text/csv;charset=utf-8");
 }
 return <section className="assuranceWorkspace">
   <div className="swSectionHeader"><h2>Engineering assurance</h2><span className="note">NR/L2/RSE/02009 · Issue 8 reference baseline</span></div>
   <p className="note">Project-wide working records. Confirm the applicable issue, contract and delivery group arrangements. Record status is not formal acceptance.</p>
   {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   <div className="assuranceKinds">{Object.entries(KINDS).filter(([k])=>k!=="idr").map(([k,c])=><button key={k} disabled={busy} className={k===kind||k==="idc"&&coordination?"active":""} onClick={()=>switchKind(k)}>{TAB_NAMES[k]||c.name} <small>{rows.filter(r=>r.kind===k||k==="idc"&&r.kind==="idr").length}</small></button>)}</div>
   {coordination&&<><IDCMinutes key={project.id} db={db} project={project} rows={rows} canEdit={canEdit} onSaved={refresh} initialRecord={initialRecord} onSelectRecord={r=>{setKind(r.kind);setSelected(r.id);setDraft(null);}}/><div className="chips" role="group" aria-label="Other coordination records"><button disabled={busy} className={kind==="idc"?"swPrimary":""} onClick={()=>switchKind("idc")}>IDC certificates / other records</button><button disabled={busy} className={kind==="idr"?"swPrimary":""} onClick={()=>switchKind("idr")}>IDR certificates / other records</button></div></>}
   <div className="swSectionHeader"><div><h2>{coordination?(kind==="idc"?"IDC certificates / other records":"IDR certificates / other records"):cfg.name}</h2><p className="note">Clause {cfg.clause}{cfg.form?" · "+cfg.form:""}</p></div><div className="chips"><button disabled={busy||loading} onClick={refresh}>Refresh</button><button disabled={loading} onClick={exportRegister}>{coordination?"Export other records CSV":"Export CSV"}</button>{canEdit&&<button className="swPrimary" disabled={busy} onClick={()=>{setEditing(null);setDraft(fresh());}}>＋ New record</button>}</div></div>
   <div className="swSearchRow"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reference, title or owner…" aria-label="Search register"/><select aria-label="Filter record status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All record statuses</option>{Object.entries(STATUSES).filter(([k])=>!["note","deferred"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
   {loading?<p>Loading registers…</p>:<div className="assuranceTableWrap"><table className="assuranceTable"><thead><tr>{["Reference","Title","Owner","Due","Status",""].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.id} className={selected===r.id?"selected":""}><td>{r.reference}</td><td>{r.title}</td><td>{r.owner||"—"}</td><td>{r.due_date||"—"}</td><td>{STATUSES[r.status]}</td><td><button disabled={busy} onClick={()=>{setSelected(r.id);setDraft(null);setEditing(null);}}>View</button>{canEdit&&<button disabled={busy} onClick={()=>{setSelected(r.id);setEditing(r);setDraft({reference:r.reference,title:r.title,status:r.status,owner:r.owner,due_date:r.due_date||"",details:r.details||{}});}}>Edit</button>}</td></tr>)}</tbody></table>{!filtered.length&&<p className="swEmpty">No matching records.</p>}</div>}
   {draft&&canEdit&&<form className="swFormPanel swForm" onSubmit={save}><div className="swSectionHeader"><h2>{editing?"Edit":"New"} record</h2><button type="button" disabled={busy} onClick={()=>{setDraft(null);setEditing(null);}}>Cancel</button></div>{kind==="tq"?<TechnicalQueryForm project={project} draft={draft} setDraft={setDraft} disabled={busy}/>:<>{kind==="variation"&&<h3>Variation record</h3>}<div className="swFormGrid">{[["reference","Reference",100],["title","Title",250],["owner","Owner / responsible person",200]].map(([k,l,max])=><label key={k}>{l}<input maxLength={max} required={k!=="owner"} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))}/></label>)}<label>Due date<input type="date" value={draft.due_date} onChange={e=>setDraft(d=>({...d,due_date:e.target.value}))}/></label><label>Record status<select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}>{Object.entries(STATUSES).filter(([k])=>!["note","deferred"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label></div>{cfg.fields.filter(([k])=>!k.startsWith("management_")).map(([k,l])=><label key={k}>{l}<textarea rows={3} maxLength={8000} value={draft.details[k]||""} onChange={e=>setDraft(d=>({...d,details:{...d.details,[k]:e.target.value}}))}/></label>)}{kind==="variation"&&<><h3>SchemeWorks — action management</h3>{[["management_action","Next action"],["management_response","Response / evidence reference"]].map(([k,l])=><label key={k}>{l}<textarea rows={3} maxLength={8000} value={draft.details[k]||""} onChange={e=>setDraft(d=>({...d,details:{...d.details,[k]:e.target.value}}))}/></label>)}<p className="note">Owner, due date and record status above are tracker fields. Save to assign a named project engineer or request independent internal review.</p></>}{wordFields.length>0&&<details className="nativeFields"><summary>Native Word form fields (optional)</summary><div className="swFormGrid">{wordFields.map(([k,l])=><label key={k}>{l}<textarea rows={2} maxLength={2000} value={draft.details[k]||""} onChange={e=>setDraft(d=>({...d,details:{...d.details,[k]:e.target.value}}))}/></label>)}</div></details>}</>}<button className="swPrimary" disabled={busy}>Save record</button></form>}
   {record&&!record.details?.idc_minute&&!draft&&<section className="swFormPanel assuranceDocument"><div className="swSectionHeader"><h2>Document preparation · {record.reference}</h2><button onClick={()=>setSelected(null)}>Close</button></div><label className="field">Template<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">SchemeWorks working draft</option>{templates.filter(t=>t.kind===kind).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><pre>{text}</pre><button className="swPrimary" onClick={exportDraft}>Download populated draft (HTML)</button><p className="note">Open the file in a browser to print or save as PDF. No signature or approval is generated.</p></section>}
   {record&&!draft&&<RecordAssetLinks key={record.id} db={db} project={project} record={record} canEdit={canEdit} onOpenAsset={onOpenAsset}/>}
   {record&&!draft&&["tq","variation"].includes(kind)&&<RecordWorkflow key={record.id} db={db} project={project} record={record} canEdit={canEdit}/>}
   {record&&!draft&&["tq","rfi","variation","appointment"].includes(kind)&&<RecordAttachments key={record.id} db={db} record={record} canEdit={canEdit} onChanged={refresh}/>}
   {!!wordFields.length&&<NativeWordLibrary key={project.id+":"+kind} db={db} project={project} kind={kind} record={draft?null:record} canEdit={canEdit}/>}
   {canEdit&&<section className="swFormPanel"><div className="swSectionHeader"><h2>Reusable document templates</h2><button disabled={busy} onClick={()=>setShowTemplate(v=>!v)}>{showTemplate?"Close":"＋ New text template"}</button></div>{showTemplate&&<form className="swForm" onSubmit={saveTemplate}><label>Name<input required maxLength={200} value={templateName} onChange={e=>setTemplateName(e.target.value)}/></label><label>Template text<textarea required rows={12} maxLength={60000} value={templateBody} onChange={e=>setTemplateBody(e.target.value)}/></label><p className="note">Placeholders: {[...placeholders,...[...cfg.fields,...wordFields].map(([k])=>"field_"+k),...(kind==="tq"?["field_extra_solutions"]:[])].map(k=>"{{"+k+"}}").join(", ")}</p><button className="swPrimary" disabled={busy}>Save reusable template</button></form>}</section>}
   <p className="note">TQ responses are not instructions; variation approval and engineering acceptance remain separate controlled processes. Use only authorised test records. Native Word mapping is limited to the supplied F0049 and F0052 originals; formal submission and sign-off workflows are not implemented.</p>
 </section>;
}
