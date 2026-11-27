"use client";
import {useEffect,useRef,useState} from "react";
import {WORD_FORMS,identifyWord,toBase64,fromBase64,populateWord} from "../lib/native-word";
export default function NativeWordLibrary({db,project,kind,record,canEdit}){
 const form=WORD_FORMS[kind];
 const [template,setTemplate]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [file,setFile]=useState(null),[permitted,setPermitted]=useState(false);
 const input=useRef(null),live=useRef(true),lock=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function refresh(){
  setLoading(true);setError("");
  try{
   const res=await db.from("native_word_templates").select("id,kind,fingerprint,created_at").eq("project_id",project.id).eq("kind",kind).maybeSingle();
   if(res.error)throw res.error;if(live.current)setTemplate(res.data);
  }catch(e){if(live.current)setError(e.message);}
  finally{if(live.current)setLoading(false);}
 }
 useEffect(()=>{if(form)refresh();},[project.id,kind]);
 async function perform(fn){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await fn();}catch(e){if(live.current)setError(e.message);}finally{lock.current=false;if(live.current)setBusy(false);}}
 function upload(e){
  e.preventDefault();if(!canEdit||!file||!permitted)return;
  perform(async()=>{
   if(file.size!==form.size)throw Error("Select the unchanged Word template from the supplied standards pack.");
   const bytes=await file.arrayBuffer();await identifyWord(bytes,kind);
   const result=await db.from("native_word_templates").insert({project_id:project.id,kind,fingerprint:form.fingerprint,original_base64:toBase64(bytes)}).select("id").single();
   if(result.error)throw result.error;
   if(live.current){setFile(null);setPermitted(false);if(input.current)input.current.value="";setNotice("Original template registered. It cannot be overwritten.");await refresh();}
  });
 }
 function generate(){
  if(!record||record.kind!==kind||!template)return;
  perform(async()=>{
   const result=await db.from("native_word_templates").select("original_base64,fingerprint").eq("project_id",project.id).eq("id",template.id).single();
   if(result.error)throw result.error;
   const blob=await populateWord(fromBase64(result.data.original_base64),project,record);
   const url=URL.createObjectURL(blob);
   const name=record.reference.replace(/[^a-z0-9._-]/gi,"_").slice(0,100)||"record";
   Object.assign(document.createElement("a"),{href:url,download:form.form+"-"+name+"-v"+record.version+"-DRAFT.docx"}).click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   if(live.current)setNotice("Draft generated from saved record version "+record.version+". Inspect it in Word before any circulation.");
  });
 }
 if(!form)return null;
 return <section className="swFormPanel nativeWordLibrary">
  <div className="swSectionHeader"><div><h2>Native Word form · {form.form}</h2><p className="note">Supplied Issue {form.issue} · mapped original only</p></div><button disabled={busy||loading} onClick={refresh}>Refresh</button></div>
  <p className="note">Private project template library. Confirm the controlled issue and your permission to store the original here before registering it. Generated documents are working drafts.</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p>Checking template library…</p>:template?<><p>Registered original · {new Date(template.created_at).toLocaleDateString("en-GB")} · SHA-256 {template.fingerprint.slice(0,12)}…</p>
  {record?<><p className="note">Selected record: {record.reference} · saved version {record.version}</p><button className="swPrimary" disabled={busy} onClick={generate}>{busy?"Generating…":"Download populated Word draft"}</button></>:<p className="note">Select View on a saved register record to generate its Word draft.</p>}</>:canEdit?<form className="swForm" onSubmit={upload}>
   <label>Original {form.form} Issue {form.issue} (.docx)<input ref={input} type="file" accept=".docx" required disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/></label>
   <label className="nativePermission"><input type="checkbox" checked={permitted} disabled={busy} onChange={e=>setPermitted(e.target.checked)}/>I am authorised to store this template in this project and have checked its applicable issue.</label>
   <button className="swPrimary" disabled={busy||!file||!permitted}>{busy?"Checking original…":"Register original template"}</button>
  </form>:<p className="note">A project editor must register the original template first.</p>}
  <p className="note">Only originator fields and draft contractor proposals are populated. Dates of transmission, signatures, employer/provider responses, approvals and closure fields remain blank. Existing free-text responses stay in the register. This is not a formal submission or approved record.</p>
 </section>;
}
