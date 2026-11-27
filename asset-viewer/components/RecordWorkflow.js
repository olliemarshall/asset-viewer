"use client";
import {useEffect,useState,useRef} from "react";
const check=r=>{if(r.error)throw r.error;return r.data;};
export default function RecordWorkflow({db,project,record,canEdit}){
 const [team,setTeam]=useState([]),[assignment,setAssignment]=useState(null),[reviews,setReviews]=useState([]),[uid,setUid]=useState(null),[assignee,setAssignee]=useState(""),[reviewer,setReviewer]=useState(""),[comment,setComment]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const lock=useRef(false);
 async function refresh(){setLoading(true);try{
 const [t,a,v,u]=await Promise.all([db.from("project_engineers").select("*").eq("project_id",project.id).order("display_name"),db.from("assurance_assignments").select("*").eq("record_id",record.id).maybeSingle(),db.from("assurance_reviews").select("*").eq("record_id",record.id).order("record_version",{ascending:false}),db.auth.getUser()]);
 const tt=check(t)||[],aa=check(a),vv=check(v)||[];setTeam(tt);setAssignment(aa);setAssignee(aa?.assignee_id||"");setReviews(vv);setUid(u.data?.user?.id||null);
 }catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{refresh();},[record.id,record.version]);
 const current=reviews.find(r=>r.record_version===record.version);
 const person=id=>{const t=team.find(t=>t.user_id===id);return t?t.display_name+" · "+t.designation:"Former / unlisted project engineer";};
 const eligible=team.filter(t=>t.active),reviewers=eligible.filter(t=>t.can_review&&t.user_id!==uid&&t.user_id!==record.updated_by);
 const canDecide=canEdit&&current?.status==="pending"&&current.reviewer_id===uid&&eligible.some(t=>t.user_id===uid&&t.can_review)&&current.requested_by!==uid&&record.updated_by!==uid;
 async function act(operation,target=null){
 if(lock.current||!canEdit)return;
 if(operation==="approved"&&!window.confirm("Record internal approval of this saved record version only? This is not technical acceptance, variation approval or authority to commence work."))return;
 lock.current=true;setBusy(true);setError("");setNotice("");
 try{check(await db.rpc("manage_assurance_workflow",{rid:record.id,expected_version:record.version,operation,target_user:target||null,comment_text:operation==="assign"?"":comment.trim()}));setComment("");setNotice("Workflow updated.");await refresh();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 const readable={pending:"Awaiting internal review",approved:"Internally approved",changes_requested:"Changes requested"};
 return <section className="swFormPanel swForm"><div className="swSectionHeader"><h2>Assignment & internal review · {record.reference}</h2><button disabled={busy||loading} onClick={refresh}>Refresh</button></div>
 <p className="note">Review is tied to saved record version {record.version}. Editing the record creates a new version requiring a fresh review. Attachments are not included in the review snapshot.</p>
 {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading?<p>Loading workflow…</p>:<>
 <p><strong>Assigned to:</strong> {assignment?person(assignment.assignee_id):"Unassigned"}</p>
 {canEdit&&<div className="tqGrid"><label>Assign responsibility<select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{assignment&&!eligible.some(t=>t.user_id===assignment.assignee_id)&&<option value={assignment.assignee_id}>Former roster member</option>}{eligible.map(t=><option key={t.user_id} value={t.user_id}>{t.display_name} · {t.designation}</option>)}</select></label><button type="button" disabled={busy||assignee===(assignment?.assignee_id||"")} onClick={()=>act("assign",assignee)}>Save assignment</button></div>}
 <p><strong>Review:</strong> {current?readable[current.status]:"Not reviewed for this version"}</p>
 {current&&<p className="note">Reviewer: {person(current.reviewer_id)} · Requested {new Date(current.requested_at).toLocaleDateString("en-GB")}{current.request_note?" · "+current.request_note:""}{current.decision_note?" · Decision: "+current.decision_note:""}</p>}
 {canEdit&&!current&&!["closed","withdrawn"].includes(record.status)&&<><label>Request review from<select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Choose independent reviewer</option>{reviewers.map(t=><option key={t.user_id} value={t.user_id}>{t.display_name} · {t.designation}</option>)}</select></label><label>Review request note<textarea rows={2} maxLength={4000} value={comment} onChange={e=>setComment(e.target.value)}/></label><button disabled={busy||!reviewer} onClick={()=>act("request",reviewer)}>Request internal review</button>{!reviewers.length&&<p className="note">An administrator must configure another eligible reviewer in Engineering team.</p>}</>}
 {canDecide&&<><label>Decision / requested changes<textarea rows={3} maxLength={4000} value={comment} onChange={e=>setComment(e.target.value)}/></label><div className="chips"><button className="swPrimary" disabled={busy} onClick={()=>act("approved")}>Approve internally</button><button disabled={busy||!comment.trim()} onClick={()=>act("changes_requested")}>Request changes</button></div></>}
 {reviews.length>0&&<details><summary>Review history ({reviews.length})</summary><div className="assuranceTableWrap"><table className="assuranceTable"><thead><tr><th>Version</th><th>Reviewer</th><th>Decision</th><th>Notes</th><th>Decision date</th></tr></thead><tbody>{reviews.map(r=><tr key={r.id}><td>{r.record_version}{r.record_version!==record.version?" (superseded)":""}</td><td>{person(r.reviewer_id)}</td><td>{readable[r.status]}</td><td>{r.request_note}{r.decision_note?" / "+r.decision_note:""}</td><td>{r.decided_at?new Date(r.decided_at).toLocaleString("en-GB"):"—"}</td></tr>)}</tbody></table></div></details>}
 <p className="note">Draft exports remain available without internal approval. Internal approval is not a signed Network Rail form, formal variation approval, instruction or engineering acceptance.</p>
 </>}</section>;
}
