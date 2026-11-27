"use client";
import {useEffect,useState} from "react";
import {localDay,outstanding} from "../lib/assurance-tracking";
async function allRows(build){
 const rows=[];let offset=0;for(;;){const res=await build().range(offset,offset+499);if(res.error)throw res.error;if(!res.data?.length)break;rows.push(...res.data);offset+=res.data.length;}return rows;
}
export default function MyWorkspace({db,user,projects,onOpenRecord}){
 const [rows,setRows]=useState([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[filter,setFilter]=useState("all");
 const today=localDay(),projectKey=projects.filter(p=>p.status==="active").map(p=>p.id).sort().join(",");
 useEffect(()=>{let live=true;setLoading(true);setError("");(async()=>{try{
 const [assignments,reviews]=await Promise.all([allRows(()=>db.from("assurance_assignments").select("record_id").eq("assignee_id",user.id).order("record_id")),allRows(()=>db.from("assurance_reviews").select("record_id,record_version").eq("reviewer_id",user.id).eq("status","pending").order("record_id").order("record_version"))]);
 const ids=[...new Set([...assignments,...reviews].map(r=>r.record_id))],records=[];
 for(let i=0;i<ids.length;i+=100){const res=await db.from("assurance_records").select("id,project_id,kind,reference,title,owner,due_date,status,version").in("id",ids.slice(i,i+100));if(res.error)throw res.error;records.push(...res.data);}
 const allowed=new Set(projectKey.split(",").filter(Boolean));
 const result=records.filter(r=>allowed.has(r.project_id)&&outstanding(r)).map(r=>({...r,assigned:assignments.some(a=>a.record_id===r.id),review:reviews.some(v=>v.record_id===r.id&&v.record_version===r.version)})).filter(r=>r.assigned||r.review);
 if(live)setRows(result);
 }catch(e){if(live){setRows([]);setError(e.message);}}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[db,user.id,projectKey,reload]);
 const late=r=>!!r.due_date&&r.due_date<today;
 const cards=[["Assigned to me",rows.filter(r=>r.assigned).length,"assigned"],["Awaiting my review",rows.filter(r=>r.review).length,"review"],["Overdue",rows.filter(late).length,"overdue"]];
 const visible=rows.filter(r=>filter==="all"||filter==="assigned"&&r.assigned||filter==="review"&&r.review||filter==="overdue"&&late(r)).sort((a,b)=>(a.due_date||"9999-12-31").localeCompare(b.due_date||"9999-12-31"));
 return <section className="assuranceWorkspace"><div className="swSectionHeader"><div><h2>My engineering work</h2><p className="note">Across accessible active projects · named TQ and variation assignments and current-version internal reviews.</p></div><button disabled={loading} onClick={()=>setReload(x=>x+1)}>Refresh</button></div>{error&&<p className="error" role="alert">{error}</p>}{loading?<p>Loading personal queues…</p>:!error&&<><div className="managementCards">{cards.map(([l,n,k])=><button className={"managementCard "+(filter===k?"active":"")} key={k} onClick={()=>setFilter(f=>f===k?"all":k)}><span>{l}</span><strong>{n}</strong></button>)}</div><div className="swSectionHeader"><h3>{visible.length} records</h3><button onClick={()=>setFilter("all")}>Show all</button></div><div className="assuranceTableWrap"><table className="assuranceTable"><thead><tr>{["Project","Reference","Title","My responsibility","Due date","Record status",""].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.id}><td>{projects.find(p=>p.id===r.project_id)?.name}</td><td>{r.reference}</td><td>{r.title}</td><td>{[r.assigned?"Assigned":null,r.review?"Review":null].filter(Boolean).join(" · ")}</td><td>{r.due_date||"—"}{late(r)?" · Overdue":""}</td><td>{r.status.replaceAll("_"," ")}</td><td><button onClick={()=>onOpenRecord(r)}>Open record →</button></td></tr>)}</tbody></table>{!visible.length&&<p className="swEmpty">No matching outstanding assignments or reviews.</p>}</div><p className="note">Free-text action owners are not treated as authenticated assignments. Other register actions remain available in project trackers.</p></>}</section>;
}
