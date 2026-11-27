"use client";
import {useEffect,useRef,useState} from "react";
const BUCKET="assurance-attachments";
const MIME={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",txt:"text/plain"};
const cols="id,title,kind,url,filename,mime_type,byte_size,fingerprint,storage_path,upload_status,created_by,created_at";
const checked=r=>{if(r.error)throw r.error;return r.data;};
function safeLink(s){try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}catch{return null;}}
async function hash(blob){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer())),x=>x.toString(16).padStart(2,"0")).join("");}
export default function RecordAttachments({db,record,canEdit:editPermission,onChanged}){
 const [restrictedAccess,setRestrictedAccess]=useState(null);
 const canEdit=editPermission&&(record.kind!=="appointment"||restrictedAccess===true);
 const [rows,setRows]=useState([]),[user,setUser]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [mode,setMode]=useState("file"),[file,setFile]=useState(null),[title,setTitle]=useState(""),[url,setUrl]=useState(""),[retry,setRetry]=useState(null);
 const lock=useRef(false),input=useRef(null),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function refresh(){setLoading(true);try{
 const all=[];let cursor=null;
 for(;;){let q=db.from("assurance_attachments").select(cols).eq("record_id",record.id).order("id").limit(100);if(cursor)q=q.gt("id",cursor);const data=checked(await q);if(!data?.length)break;all.push(...data);cursor=data.at(-1).id;}
 if(live.current)setRows(all.sort((a,b)=>b.created_at.localeCompare(a.created_at)));
 }catch(e){if(live.current)setError(e.message);}finally{if(live.current)setLoading(false);}}
 useEffect(()=>{refresh();(async()=>{try{const u=checked(await db.auth.getUser())?.user; if(!live.current)return;setUser(u?.id||null);if(record.kind==="appointment"){const project=checked(await db.from("projects").select("organisation_id").eq("id",record.project_id).single());const membership=checked(await db.from("organisation_members").select("role").eq("organisation_id",project.organisation_id).eq("user_id",u?.id).maybeSingle());if(live.current)setRestrictedAccess(membership?.role==="admin");}}catch(e){if(live.current){setRestrictedAccess(false);setError(e.message);}}})();},[record.id]);
 async function run(fn){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await fn();}catch(e){if(live.current)setError(e.message);}finally{lock.current=false;if(live.current)setBusy(false);}}
 async function finish(row,selected){
 let res=await db.storage.from(BUCKET).download(row.storage_path);
 if(res.error){
  if(!selected||selected.size!==Number(row.byte_size)||await hash(selected)!==row.fingerprint)throw Error("Select the exact original file to resume this upload.");
  const up=await db.storage.from(BUCKET).upload(row.storage_path,selected,{contentType:row.mime_type,upsert:false,cacheControl:"0"});
  res=await db.storage.from(BUCKET).download(row.storage_path);
  if(res.error)throw up.error||res.error;
 }
 const blob=checked(res);if(blob.size!==Number(row.byte_size)||await hash(blob)!==row.fingerprint)throw Error("Stored file does not match the registered fingerprint.");
 checked(await db.from("assurance_attachments").update({upload_status:"ready"}).eq("id",row.id).select("id").single());
 }
 function submit(e){e.preventDefault();if(!canEdit)return;run(async()=>{
 if(mode==="link"){const link=safeLink(url.trim());if(!link)throw Error("Enter an HTTPS document link without embedded credentials.");
 checked(await db.from("assurance_attachments").insert({record_id:record.id,title:title.trim(),kind:"link",url:link,upload_status:"ready"}).select("id").single());setUrl("");setTitle("");setNotice("Document link saved.");await refresh();await onChanged?.();return;}
 if(!file||file.size<1||file.size>26214400)throw Error("Choose a document of up to 25 MiB.");
 const mime=MIME[file.name.split(".").pop().toLowerCase()];if(!mime)throw Error("Supported files: PDF, DOCX, XLSX, PNG, JPEG and TXT.");
 const row=checked(await db.from("assurance_attachments").insert({record_id:record.id,title:title.trim()||file.name,kind:"file",filename:file.name,mime_type:mime,byte_size:file.size,fingerprint:await hash(file)}).select(cols).single());
 try{await finish(row,file);setNotice("File attached and verified.");await onChanged?.();}catch(e){setRetry(row.id);throw Error("Attachment registered but upload incomplete: "+e.message);}finally{setTitle("");setFile(null);if(input.current)input.current.value="";await refresh();}
 });}
 function resume(){run(async()=>{const row=rows.find(r=>r.id===retry);if(!row)throw Error("Pending attachment not found.");await finish(row,file);setRetry(null);setFile(null);setNotice("Attachment completed.");await refresh();await onChanged?.();});}
 function download(row){run(async()=>{const blob=checked(await db.storage.from(BUCKET).download(row.storage_path));if(blob.size!==Number(row.byte_size)||await hash(blob)!==row.fingerprint)throw Error("Attachment integrity check failed.");const object=URL.createObjectURL(new Blob([blob],{type:"application/octet-stream"}));Object.assign(document.createElement("a"),{href:object,download:row.filename}).click();setTimeout(()=>URL.revokeObjectURL(object),1000);});}
 return <section className="swFormPanel assuranceAttachments"><div className="swSectionHeader"><h2>Attachments & linked documents · {record.reference}</h2><button disabled={busy||loading} onClick={refresh}>Refresh</button></div>
 {record.kind==="appointment"&&restrictedAccess!==true&&<p className="note">Appointment evidence is restricted to organisation administrators. The register itself remains project-visible.</p>}
 <p className="note">Private project attachments. External links retain the destination system’s own access permissions. Only attach authorised documents.</p>
 {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {loading?<p>Loading documents…</p>:rows.length?rows.map(r=><div className="attachmentRow" key={r.id}><div><strong>{r.title}</strong><p className="note">{r.kind==="file"?r.filename+" · "+(Number(r.byte_size)/1048576).toFixed(2)+" MiB · "+r.upload_status:"External HTTPS document link"} · {new Date(r.created_at).toLocaleDateString("en-GB")}</p></div>{r.kind==="link"?safeLink(r.url)&&<a href={safeLink(r.url)} target="_blank" rel="noopener noreferrer">Open link ↗</a>:r.upload_status==="ready"?<button disabled={busy} onClick={()=>download(r)}>Download</button>:canEdit&&r.created_by===user&&<button disabled={busy} onClick={()=>{setRetry(r.id);setFile(null);}}>Resume upload</button>}</div>):<p className="note">No documents attached yet.</p>}
 {canEdit&&retry&&<div className="swForm"><h3>Resume upload</h3><input type="file" disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/><div className="chips"><button disabled={busy} onClick={resume}>Resume / finalise</button><button disabled={busy} onClick={()=>{setRetry(null);setFile(null);}}>Cancel</button></div></div>}
 {canEdit&&!retry&&<form className="swForm" onSubmit={submit}><div className="chips"><button type="button" disabled={busy} aria-pressed={mode==="file"} onClick={()=>{setMode("file");setFile(null);}}>Attach file</button><button type="button" disabled={busy} aria-pressed={mode==="link"} onClick={()=>{setMode("link");setFile(null);}}>Link document</button></div><label>Document title{mode==="file"?" (optional)":""}<input required={mode==="link"} maxLength={250} value={title} onChange={e=>setTitle(e.target.value)}/></label>{mode==="file"?<label>File (25 MiB max)<input ref={input} type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt" required disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/></label>:<label>Document URL<input type="url" required maxLength={4000} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label>}<button className="swPrimary" disabled={busy}>{busy?"Working…":mode==="file"?"Attach document":"Save link"}</button></form>}
 </section>;
}
