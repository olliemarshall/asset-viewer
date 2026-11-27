"use client";
import {useState,useEffect} from "react";
import NativeWordLibrary from "./NativeWordLibrary";
import {loadProjectRecords} from "../lib/assurance-tracking";
export default function DocumentTemplates({db,project,canEdit,onOpenRecord}){
 const [rows,setRows]=useState([]),[selected,setSelected]=useState({tq:"",rfi:""}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError("");loadProjectRecords(db,project.id).then(data=>{if(live)setRows(data);}).catch(e=>{if(live){setRows([]);setError(e.message);}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[db,project.id,reload]);
 return <section className="assuranceWorkspace"><div className="swSectionHeader"><div><h2>Document templates</h2><p className="note">Register authorised original forms once, then generate working drafts from saved records.</p></div><button disabled={loading} onClick={()=>setReload(x=>x+1)}>Refresh records</button></div>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="templateGrid">{[["tq","Technical Query"],["rfi","Request for Information"]].map(([kind,name])=>{const record=rows.find(r=>r.kind===kind&&r.id===selected[kind]);return <section className="templateCard" key={kind}><h2>{name}</h2><label className="field">Saved register record<select disabled={loading||!!error} value={selected[kind]} onChange={e=>setSelected(s=>({...s,[kind]:e.target.value}))}><option value="">Select a record</option>{rows.filter(r=>r.kind===kind).map(r=><option key={r.id} value={r.id}>{r.reference} — {r.title} · v{r.version}</option>)}</select></label>{record&&<button onClick={()=>onOpenRecord(record)}>Open source record →</button>}<NativeWordLibrary db={db} project={project} kind={kind} record={record} canEdit={canEdit}/></section>;})}</div>
 <p className="note">F0049 Issue 2 and F0052 Issue 1 are currently supported. Other controlled forms and Excel trackers are not yet mapped. The existing custom text templates remain available under Engineering assurance.</p></section>;
}
