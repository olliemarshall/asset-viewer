"use client";
import {useEffect,useRef,useState} from "react";
import AssetViewer from "./AssetViewer";

const BUCKET="scheme-drawings";
const DISCIPLINES=["Unassigned","Signalling","Track","E&P","Civils","Telecoms","Other"];
const empty={title:"",reference:"",revision:"",discipline:"Unassigned",description:""};
const cols="id,scheme_id,title,reference,revision,discipline,description,filename,byte_size,fingerprint,uploaded_by,created_at,upload_status,storage_path";
async function sha(buffer){
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),x=>x.toString(16).padStart(2,"0")).join("");
}
async function validate(file){
  if(!file||file.size>26214400||file.size<5)throw Error("Select a PDF of up to 25 MiB.");
  const buffer=await file.arrayBuffer();
  if(new TextDecoder().decode(buffer.slice(0,5))!=="%PDF-")throw Error("The selected file does not have a PDF header.");
  return {buffer,hash:await sha(buffer)};
}
function assertResult(result){if(result.error)throw result.error;return result.data;}
export default function DrawingRegister({db,user,scheme,project,canUpload,onClose}){
  const [drawings,setDrawings]=useState([]),[draft,setDraft]=useState(empty);
  const [file,setFile]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[opened,setOpened]=useState(null);
  const [retry,setRetry]=useState(null);
  const [scratchChanged,setScratchChanged]=useState(false);
  const input=useRef(null),live=useRef(true),working=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  async function refresh(){
    setLoading(true);
    try{
      const data=assertResult(await db.from("drawings").select(cols).eq("scheme_id",scheme.id).order("reference").order("created_at",{ascending:false}));
      if(live.current)setDrawings(data||[]);
    }catch(e){if(live.current)setError(e.message);}
    finally{if(live.current)setLoading(false);}
  }
  useEffect(()=>{refresh();},[scheme.id]);
  async function perform(operation){
    if(working.current)return;
    working.current=true;setBusy(true);setError("");setNotice("");
    try{await operation();}catch(e){if(live.current)setError(e.message);}
    finally{working.current=false;if(live.current)setBusy(false);}
  }
  async function complete(row,selectedFile){
    const path=row.storage_path;
    // A pending upload may already have succeeded before a network interruption.
    // Download first to verify the bytes before finalising or retrying.
    let existing=await db.storage.from(BUCKET).download(path);
    if(existing.error){
      if(!selectedFile)throw Error("Select the original PDF to resume this pending upload.");
      const {hash}=await validate(selectedFile);
      if(hash!==row.fingerprint||selectedFile.size!==Number(row.byte_size))throw Error("Choose the exact original PDF. Revisions are immutable.");
      const upload=await db.storage.from(BUCKET).upload(path,selectedFile,{contentType:"application/pdf",upsert:false,cacheControl:"0"});
      if(upload.error){
        existing=await db.storage.from(BUCKET).download(path);
        if(existing.error)throw upload.error;
      }else existing=await db.storage.from(BUCKET).download(path);
    }
    const bytes=await assertResult(existing).arrayBuffer();
    if(bytes.byteLength!==Number(row.byte_size)||await sha(bytes)!==row.fingerprint)throw Error("Stored PDF does not match the registered fingerprint. Contact an administrator.");
    assertResult(await db.from("drawings").update({upload_status:"ready"}).eq("id",row.id).select("id").single());
  }
  function submit(e){
    e.preventDefault();
    perform(async()=>{
      if(!canUpload)throw Error("Upload permission required.");
      const {hash}=await validate(file);
      const row=assertResult(await db.from("drawings").insert({
        scheme_id:scheme.id,title:draft.title.trim(),reference:draft.reference.trim(),revision:draft.revision.trim(),
        discipline:draft.discipline,description:draft.description.trim(),filename:file.name,byte_size:file.size,fingerprint:hash
      }).select(cols).single());
      try{await complete(row,file);setNotice("PDF uploaded and verified.");}
      catch(e){setRetry(row.id);throw Error("Drawing registered but upload is incomplete. Resume the pending record: "+e.message);}
      finally{setDraft(empty);setFile(null);if(input.current)input.current.value="";await refresh();}
    });
  }
  function resume(row){
    perform(async()=>{
      try{await complete(row,file);setRetry(null);setFile(null);setNotice("Pending drawing upload completed.");}
      finally{await refresh();}
    });
  }
  function open(row){
    perform(async()=>{
      // Storage authorisation is checked on download, not just in the UI.
      const blob=assertResult(await db.storage.from(BUCKET).download(row.storage_path));
      const buffer=await blob.arrayBuffer();
      if(buffer.byteLength!==Number(row.byte_size)||await sha(buffer)!==row.fingerprint)throw Error("The downloaded PDF does not match its registered fingerprint.");
      if(live.current){setScratchChanged(false);setOpened({row,buffer});}
    });
  }
  if(opened)return <div className="sharedDrawingOverlay">
    <div className="sharedDrawingBanner"><button onClick={()=>{if(!scratchChanged||window.confirm("Call-off edits are temporary and will be lost when you close this drawing. Close anyway?")){setOpened(null);setScratchChanged(false);}}}>← Drawing register</button><span>{project.name} / {scheme.name} / {opened.row.reference} · Rev {opened.row.revision}</span><span>Call-off edits are temporary until shared asset saving is implemented</span></div>
    <AssetViewer key={opened.row.id} context={{scope:"shared:"+user.id+":"+opened.row.id,title:opened.row.title+" · Rev "+opened.row.revision,shared:true}} initialPdf={{buffer:opened.buffer,name:opened.row.filename}} onScratchChange={setScratchChanged}/>
  </div>;
  return <section className="drawingRegister">
    <div className="workspaceSectionHeading sharedSection"><h2>{scheme.name} — drawing register</h2><button disabled={busy} onClick={onClose}>Close</button></div>
    <p className="note">Private PDF revisions · shared with authorised project members. Only upload files approved for this development environment.</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button disabled={busy||loading} onClick={refresh}>Refresh drawings</button>
    {loading?<p>Loading drawings…</p>:!drawings.length?<p className="schemeEmpty">No drawing revisions registered.</p>:<div className="schemeList">
      {drawings.map(row=><article className="schemeCard" key={row.id}>
        <div><h3>{row.title}</h3><p>{row.reference} · Rev {row.revision} · {row.discipline}</p><p>{row.filename} · {(Number(row.byte_size)/1048576).toFixed(2)} MiB · {new Date(row.created_at).toLocaleDateString("en-GB")}</p><p>{row.description}</p><span className="note">{row.upload_status==="ready"?"Stored PDF":"Upload pending"}</span></div>
        <div className="chips">{row.upload_status==="ready"?<button disabled={busy} onClick={()=>open(row)}>Open drawing</button>:canUpload&&row.uploaded_by===user.id&&<button disabled={busy} onClick={()=>{setRetry(row.id);setFile(null);}}>Resume upload</button>}</div>
      </article>)}
    </div>}
    {canUpload&&retry&&<div className="schemeForm"><h2>Resume pending upload</h2><p className="note">Choose the exact original PDF if the file has not yet been stored. A successfully stored PDF can be finalised without choosing a file.</p><input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/><div className="chips"><button disabled={busy||!drawings.some(d=>d.id===retry&&d.upload_status==="pending")} onClick={()=>resume(drawings.find(d=>d.id===retry))}>Resume / finalise</button><button disabled={busy} onClick={()=>{setRetry(null);setFile(null);}}>Cancel</button></div></div>}
    {canUpload&&!retry&&<form className="schemeForm" onSubmit={submit}><h2>Upload drawing revision</h2>
      {[["title","Drawing title",200],["reference","Drawing reference",100],["revision","Revision",40]].map(([k,label,max])=><label key={k}>{label}<input required maxLength={max} disabled={busy} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))}/></label>)}
      <label>Discipline<select value={draft.discipline} disabled={busy} onChange={e=>setDraft(d=>({...d,discipline:e.target.value}))}>{DISCIPLINES.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Description<textarea maxLength={4000} value={draft.description} disabled={busy} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
      <label>PDF (max 25 MiB)<input ref={input} type="file" accept="application/pdf,.pdf" required disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/></label>
      <button disabled={busy||!file}>{busy?"Uploading / verifying…":"Upload drawing"}</button>
    </form>}
    {!canUpload&&<p className="note">Read-only drawing access. Uploading requires an editor or administrator on an active project and scheme.</p>}
  </section>;
}
