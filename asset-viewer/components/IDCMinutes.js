"use client";
import {useState,useRef,useEffect} from "react";
import {localDay} from "../lib/assurance-tracking";
const statuses={open:"Open",closed:"Closed",note:"Note",deferred:"Deferred"};
const blank=()=>({drawing:"",minute:"",raised:"",owner:"",response:"",status:"open",due_date:""});
const headerFrom=r=>({meetingType:r.details.idc_meeting_type||"IDC",meetingRef:r.details.idc_meeting_ref,meetingDate:r.details.idc_meeting_date||"",drawingRef:r.details.idc_drawing_ref||"",revision:r.details.idc_revision||"",attendees:r.details.idc_attendees||""});
export default function IDCMinutes({db,project,rows,canEdit,onSaved,initialRecord,onSelectRecord}){
 const minutes=rows.filter(r=>["idc","idr"].includes(r.kind)&&r.details?.idc_minute===true);
 const initial=minutes.find(r=>r.id===initialRecord?.id);
 const [header,setHeader]=useState(()=>initial?headerFrom(initial):{meetingType:"IDC",meetingRef:"",meetingDate:localDay(),drawingRef:"",revision:"",attendees:""});
 const [entry,setEntry]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [editing,setEditing]=useState(null),[filter,setFilter]=useState(""),[statusFilter,setStatusFilter]=useState("");
 const lock=useRef(false),minuteInput=useRef(null),initialised=useRef(false);
 useEffect(()=>{if(initial&&!initialised.current){initialised.current=true;setHeader(headerFrom(initial));setFilter((initial.details.idc_meeting_type||"IDC")+" / "+initial.details.idc_meeting_ref);}},[initial]);
 const updateHeader=(k,v)=>setHeader(h=>({...h,[k]:v}));
 const put=(k,v)=>setEntry(d=>({...d,[k]:v}));
 const meetingKey=r=>(r.details.idc_meeting_type||"IDC")+" / "+r.details.idc_meeting_ref;
 const meetings=[...new Map(minutes.map(r=>[meetingKey(r),r])).values()];
 const shown=minutes.filter(r=>(!filter||meetingKey(r)===filter)&&(!statusFilter||r.status===statusFilter)).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
 const headerFields=[["meetingRef","Meeting reference","text",70],["meetingDate","Meeting date","date",10],["drawingRef","Drawing / package reference","text",250],["revision","Revision","text",80],["attendees","Attendees / disciplines","text",1000]];
 function loadMeeting(ref){
  if(!ref){setFilter("");return;}
  const r=meetings.find(m=>meetingKey(m)===ref);if(!r)return;
  if((editing||entry.minute.trim())&&!window.confirm("Discard the current unsaved minute?"))return;
  setHeader(headerFrom(r));setFilter(ref);setEditing(null);setEntry({...blank(),drawing:r.details.idc_sheet||""});
 }
 function edit(r){
  if((editing||entry.minute.trim())&&!window.confirm("Discard the current unsaved minute?"))return;
  setHeader(headerFrom(r));setEditing(r);setEntry({drawing:r.details.idc_sheet||"",minute:r.details.issue||"",raised:r.details.idc_raised_by||"",owner:r.owner||"",response:r.details.resolution||"",status:r.status,due_date:r.due_date||""});
  setTimeout(()=>minuteInput.current?.focus(),0);
 }
 async function save(e){
  e.preventDefault();if(!canEdit||lock.current)return;
  if(!header.meetingRef.trim()||!header.meetingDate||!entry.minute.trim()){setError("Enter a meeting reference, date and minute.");return;}
  lock.current=true;setBusy(true);setError("");setNotice("");
  try{
   const details={...(editing?.details||{}),idc_minute:true,idc_meeting_type:header.meetingType,idc_meeting_ref:header.meetingRef.trim(),idc_meeting_date:header.meetingDate,idc_drawing_ref:header.drawingRef,idc_revision:header.revision,idc_attendees:header.attendees,idc_project_ref:project.reference,idc_sheet:entry.drawing.trim(),idc_raised_by:entry.raised.trim(),issue:entry.minute.trim(),resolution:entry.response.trim(),deliverable:[header.drawingRef,header.revision,entry.drawing].filter(Boolean).join(" / "),meeting:header.meetingRef+" · "+header.meetingDate};
   const payload={title:entry.minute.trim().slice(0,250),owner:entry.owner.trim(),status:entry.status,due_date:entry.due_date||null,details};
   const result=editing?await db.from("assurance_records").update({...payload,version:editing.version+1}).eq("id",editing.id).eq("version",editing.version).select("id").maybeSingle():await db.from("assurance_records").insert({...payload,reference:header.meetingRef.trim().slice(0,65)+"-"+crypto.randomUUID().slice(0,8),project_id:project.id,kind:"idc"}).select("id").single();
   if(result.error)throw result.error;if(!result.data)throw Error("The minute changed or access was revoked. Refresh before editing again.");
   setNotice(editing?"Minute updated.":"Minute saved. Meeting header and drawing/sheet retained for the next item.");
   setEntry({...blank(),drawing:entry.drawing});setEditing(null);setFilter(header.meetingType+" / "+header.meetingRef.trim());setStatusFilter("");
   await onSaved();setTimeout(()=>minuteInput.current?.focus(),0);
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <section className="idcMinutes">
  <div className="swSectionHeader"><div><h2>IDC / IDR minutes</h2><p className="note">Set the meeting details once; add individual minutes below. Saved minutes are shared engineering records.</p></div><span className="note">Exports are under Trackers</span></div>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="idcFilters"><label className="field">Meeting<select value={filter} disabled={busy} onChange={e=>loadMeeting(e.target.value)}><option value="">All meetings</option>{meetings.map(r=><option key={meetingKey(r)} value={meetingKey(r)}>{meetingKey(r)} · {r.details.idc_meeting_date}</option>)}</select></label><label className="field">Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
  {canEdit&&<form className="swFormPanel swForm idcEntry" onSubmit={save}><fieldset disabled={busy} className="idcFieldset"><h3>Meeting details — carried forward</h3><div className="chips" role="group" aria-label="Meeting type">{["IDC","IDR","Combined IDCR"].map(t=><button type="button" key={t} className={header.meetingType===t?"swPrimary":""} aria-pressed={header.meetingType===t} onClick={()=>updateHeader("meetingType",t)}>{t}</button>)}</div><div className="tqGrid"><label>Project reference<input readOnly value={project.reference}/></label>{headerFields.map(([k,l,t,max])=><label key={k}>{l}<input type={t} maxLength={max} required={k==="meetingRef"||k==="meetingDate"} value={header[k]} onChange={e=>updateHeader(k,e.target.value)}/></label>)}</div>
  <h3>{editing?"Edit minute "+editing.reference:"Quick minute entry"}</h3>
  <div className="idcQuick"><label>Drawing / sheet<input maxLength={250} value={entry.drawing} onChange={e=>put("drawing",e.target.value)}/></label><label>Minute<textarea ref={minuteInput} required rows={3} maxLength={8000} value={entry.minute} onChange={e=>put("minute",e.target.value)}/></label><label>Raised by<input maxLength={200} value={entry.raised} onChange={e=>put("raised",e.target.value)}/></label><label>Action owner<input maxLength={200} value={entry.owner} onChange={e=>put("owner",e.target.value)}/></label><label>Response<textarea rows={3} maxLength={8000} value={entry.response} onChange={e=>put("response",e.target.value)}/></label><label>Status<select value={entry.status} onChange={e=>put("status",e.target.value)}>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
  <label className="idcDue">Action due date (optional)<input type="date" value={entry.due_date} onChange={e=>put("due_date",e.target.value)}/></label>
  <div className="chips"><button className="swPrimary" type="submit">{busy?"Saving…":editing?"Save changes":"Save + next minute"}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setEntry(blank());}}>Cancel edit</button>}</div></fieldset></form>}
  <div className="assuranceTableWrap"><table className="assuranceTable idcTable"><thead><tr>{["Meeting / date","Drawing / sheet","Minute","Raised by","Action owner","Response","Status","Due",""].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={r.id} id={"minute-"+r.id} className={initialRecord?.id===r.id?"selected":""}><td>{r.details.idc_meeting_type||"IDC"} · {r.details.idc_meeting_ref}<br/>{r.details.idc_meeting_date}</td><td>{r.details.idc_sheet||r.details.idc_drawing_ref}</td><td>{r.details.issue}<small className="note"> · {r.reference}</small></td><td>{r.details.idc_raised_by}</td><td>{r.owner}</td><td>{r.details.resolution}</td><td>{statuses[r.status]||r.status}</td><td>{r.due_date||"—"}</td><td><button disabled={busy} onClick={()=>onSelectRecord?.(r)}>View links</button>{canEdit&&<button disabled={busy} onClick={()=>edit(r)}>Edit</button>}</td></tr>)}</tbody></table>{!shown.length&&<p className="swEmpty">No minutes match this meeting/status.</p>}</div>
  <p className="note">Meeting details are copied into each minute. Changes to a header affect subsequent entries only. A closed minute or note is not a signed IDC/IDR certificate.</p>
 </section>;
}
