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
export default function DrawingRegister({db,user,scheme,project,canUpload,onClose,initialDrawing,onOpenRecord,onOpenAsset}){
  const [drawings,setDrawings]=useState([]),[draft,setDraft]=useState(empty);
  const [file,setFile]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[opened,setOpened]=useState(null);
  const [retry,setRetry]=useState(null);
  const [uploadOpen,setUploadOpen]=useState(false);
  const [folders,setFolders]=useState([]),[locations,setLocations]=useState({});
  const [folderId,setFolderId]=useState(null),[folderForm,setFolderForm]=useState(null),[folderName,setFolderName]=useState("");
  const [moving,setMoving]=useState(null),[destination,setDestination]=useState("");
  const [search,setSearch]=useState("");
  const folder=folders.find(f=>f.id===folderId);
  function ancestry(id){
    const result=[],seen=new Set();
    while(id&&!seen.has(id)){seen.add(id);const f=folders.find(x=>x.id===id);if(!f)break;result.unshift(f);id=f.parent_id;}
    return result;
  }
  const trail=ancestry(folderId);
  const childFolders=folders.filter(f=>f.parent_id===folderId);
  const visibleDrawings=drawings.filter(d=>(search.trim()||((locations[d.id]||null)===folderId))&&[d.title,d.reference,d.revision,d.discipline,d.filename].some(v=>String(v||"").toLowerCase().includes(search.trim().toLowerCase())));
  function navigateFolder(id){setFolderId(id);setFolderForm(null);setUploadOpen(false);setMoving(null);setRetry(null);setFile(null);setSearch("");}
  function saveFolder(e){e.preventDefault();perform(async()=>{
    const name=folderName.trim();
    if(!name)throw Error("Enter a folder name.");
    if(folderForm==="rename")assertResult(await db.from("drawing_folders").update({name}).eq("id",folderId).select("id").single());
    else assertResult(await db.from("drawing_folders").insert({scheme_id:scheme.id,parent_id:folderId,name}).select("id").single());
    setFolderForm(null);setFolderName("");await refresh();
  });}
  async function moveDrawing(row,to){
    const current=await db.from("drawing_folder_locations").select("drawing_id").eq("drawing_id",row.id).maybeSingle();
    const exists=assertResult(current);
    if(exists)assertResult(await db.from("drawing_folder_locations").update({folder_id:to}).eq("drawing_id",row.id).select("drawing_id").single());
    else if(to)assertResult(await db.from("drawing_folder_locations").insert({drawing_id:row.id,scheme_id:scheme.id,folder_id:to}).select("drawing_id").single());
  }
  const [scratchChanged,setScratchChanged]=useState(false);
  const initialOpened=useRef(false);
  const input=useRef(null),live=useRef(true),working=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  async function refresh(){
    setLoading(true);
    try{
      const results=await Promise.all([
        db.from("drawings").select(cols).eq("scheme_id",scheme.id).order("reference").order("created_at",{ascending:false}),
        db.from("drawing_folders").select("id,parent_id,name").eq("scheme_id",scheme.id).order("name"),
        db.from("drawing_folder_locations").select("drawing_id,folder_id").eq("scheme_id",scheme.id)
      ]);
      const [data,fs,ls]=results.map(assertResult);
      if(live.current){setDrawings(data||[]);setFolders(fs||[]);setLocations(Object.fromEntries((ls||[]).map(l=>[l.drawing_id,l.folder_id])));}
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
      try{await complete(row,file);}
      catch(e){setRetry(row.id);throw Error("Drawing registered but upload is incomplete. The pending record is in the root folder; resume it there: "+e.message);}
      finally{setDraft(empty);setFile(null);if(input.current)input.current.value="";await refresh();}
      setUploadOpen(false);
      try{await moveDrawing(row,folderId);setNotice("PDF uploaded and verified.");}catch(e){setNotice("PDF uploaded to the root. Move it to the desired folder manually.");}
      await refresh();
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
      const snapshot=assertResult(await db.from("drawing_calloff_sets").select("payload,version,updated_at").eq("drawing_id",row.id).maybeSingle());
      if(live.current){setScratchChanged(false);setOpened({row,buffer,snapshot});}
    });
  }
  useEffect(()=>{if(!loading&&!busy&&initialDrawing&&!initialOpened.current){initialOpened.current=true;const row=drawings.find(d=>d.id===initialDrawing.drawingId&&d.upload_status==="ready");if(row)open(row);else setError("Linked drawing is unavailable.");}},[loading,busy,drawings,initialDrawing]);
  if(opened)return <div className="sharedDrawingOverlay">
    <div className="sharedDrawingBanner"><button onClick={()=>{if(!scratchChanged||window.confirm("You have unsaved call-off edits. Discard changes and close this drawing?")){setOpened(null);setScratchChanged(false);}}}>← Drawing register</button><span>{project.name} / {scheme.name} / {opened.row.reference} · Rev {opened.row.revision}</span><span>Shared drawing · saved call-offs are visible to authorised project members</span></div>
    <AssetViewer key={opened.row.id} context={{scope:"shared:"+user.id+":"+opened.row.id,title:opened.row.title+" · Rev "+opened.row.revision,shared:true}} initialPdf={{buffer:opened.buffer,name:opened.row.filename}} onScratchChange={setScratchChanged} sharedStore={{db,drawingId:opened.row.id,schemeId:scheme.id,projectId:project.id,canEdit:canUpload,snapshot:opened.snapshot,initialCalloffId:initialDrawing?.drawingId===opened.row.id?initialDrawing.calloffId:null,onOpenRecord,onOpenAsset}}/>
  </div>;
  return <section className="drawingRegister">
    <div className="swSectionHeader"><h2>Drawing register</h2><div className="chips">{canUpload&&<button className="swPrimary" disabled={busy} onClick={()=>{setRetry(null);setUploadOpen(v=>!v);setFile(null);}}>{uploadOpen?"Cancel upload":"＋ Upload drawing"}</button>}<button disabled={busy} onClick={onClose}>Back to schemes</button></div></div>
    <p className="note">Private PDF revisions · shared with authorised project members. Only upload files approved for this development environment.</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="folderToolbar">
      <nav className="folderTrail" aria-label="Drawing folders"><button disabled={busy} onClick={()=>navigateFolder(null)}>Drawing register</button>{trail.map(f=><span key={f.id}> / <button disabled={busy} onClick={()=>navigateFolder(f.id)}>{f.name}</button></span>)}</nav>
      <div className="chips">{canUpload&&<><button disabled={busy} onClick={()=>{setFolderForm("new");setFolderName("");}}>＋ New folder</button>{folder&&<button disabled={busy} onClick={()=>{setFolderForm("rename");setFolderName(folder.name);}}>Rename folder</button>}</>}<button disabled={busy||loading} onClick={refresh}>Refresh</button></div>
    </div>
    <input className="drawingSearch" aria-label="Search all drawings" placeholder="Search drawings across all folders…" value={search} onChange={e=>setSearch(e.target.value)}/>
    {folderForm&&<form className="swFormPanel swForm" onSubmit={saveFolder}><h2>{folderForm==="rename"?"Rename folder":"Create folder"}</h2><label>Folder name<input required maxLength={120} value={folderName} onChange={e=>setFolderName(e.target.value)}/></label><div className="chips"><button className="swPrimary" disabled={busy}>Save</button><button type="button" disabled={busy} onClick={()=>setFolderForm(null)}>Cancel</button></div></form>}
    {!search.trim()&&<div className="folderGrid">{childFolders.map(f=><button key={f.id} className="folderTile" disabled={busy} onClick={()=>navigateFolder(f.id)}><span className="folderGlyph" aria-hidden="true">▰</span><span>{f.name}<small>{folders.filter(x=>x.parent_id===f.id).length} folders · {drawings.filter(d=>locations[d.id]===f.id).length} drawings</small></span><span aria-hidden="true">›</span></button>)}</div>}
    {loading?<p>Loading drawings…</p>:!visibleDrawings.length?<p className="schemeEmpty">{search.trim()?"No matching drawings.":"No drawing revisions in this folder."}</p>:<div className="schemeList">
      {visibleDrawings.map(row=><article className="schemeCard" key={row.id}>
        <div><h3>{row.title}</h3><p>{row.reference} · Rev {row.revision} · {row.discipline}</p><p>{row.filename} · {(Number(row.byte_size)/1048576).toFixed(2)} MiB · {new Date(row.created_at).toLocaleDateString("en-GB")}</p><p>{row.description}</p>{search.trim()&&<p>{ancestry(locations[row.id]).map(f=>f.name).join(" / ")||"Root"}</p>}<span className="note">{row.upload_status==="ready"?"Stored PDF":"Upload pending"}</span></div>
        <div className="chips">{row.upload_status==="ready"?<><button disabled={busy} onClick={()=>open(row)}>Open drawing</button>{canUpload&&<button disabled={busy} onClick={()=>{setMoving(row.id);setDestination(locations[row.id]||"");}}>Move</button>}</>:canUpload&&row.uploaded_by===user.id&&<button disabled={busy} onClick={()=>{setRetry(row.id);setFile(null);setUploadOpen(false);}}>Resume upload</button>}</div>
      {moving===row.id&&<div className="folderMove"><label className="field">Move to<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Root</option>{folders.map(f=><option key={f.id} value={f.id}>{ancestry(f.id).map(x=>x.name).join(" / ")}</option>)}</select></label><button disabled={busy} onClick={()=>perform(async()=>{await moveDrawing(row,destination||null);setMoving(null);await refresh();})}>Move drawing</button><button disabled={busy} onClick={()=>setMoving(null)}>Cancel</button></div>}
      </article>)}
    </div>}
    {canUpload&&retry&&<div className="schemeForm"><h2>Resume pending upload</h2><p className="note">Choose the exact original PDF if the file has not yet been stored. A successfully stored PDF can be finalised without choosing a file.</p><input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/><div className="chips"><button disabled={busy||!drawings.some(d=>d.id===retry&&d.upload_status==="pending")} onClick={()=>resume(drawings.find(d=>d.id===retry))}>Resume / finalise</button><button disabled={busy} onClick={()=>{setRetry(null);setFile(null);}}>Cancel</button></div></div>}
    {canUpload&&uploadOpen&&!retry&&<form className="swFormPanel swForm" onSubmit={submit}><h2>Upload drawing revision</h2><p className="note">Destination: {trail.map(f=>f.name).join(" / ")||"Root"}</p>
      {[["title","Drawing title",200],["reference","Drawing reference",100],["revision","Revision",40]].map(([k,label,max])=><label key={k}>{label}<input required maxLength={max} disabled={busy} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))}/></label>)}
      <label>Discipline<select value={draft.discipline} disabled={busy} onChange={e=>setDraft(d=>({...d,discipline:e.target.value}))}>{DISCIPLINES.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Description<textarea maxLength={4000} value={draft.description} disabled={busy} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
      <label>PDF (max 25 MiB)<input ref={input} type="file" accept="application/pdf,.pdf" required disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/></label>
      <button className="swPrimary" disabled={busy||!file}>{busy?"Uploading / verifying…":"Upload drawing"}</button>
    </form>}
    {!canUpload&&<p className="note">Read-only drawing access. Uploading requires an editor or administrator on an active project and scheme.</p>}
  </section>;
}
