"use client";
import {useEffect,useState,useRef} from "react";
import {check,listAssets,allRows,statuses} from "../lib/master-assets";
export default function RecordAssetLinks({db,project,record,canEdit,onOpenAsset}){
 const [assets,setAssets]=useState([]),[schemes,setSchemes]=useState([]),[links,setLinks]=useState([]),[choice,setChoice]=useState(""),[search,setSearch]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const lock=useRef(false);
 async function refresh(){setLoading(true);setError("");try{const [a,s,l]=await Promise.all([listAssets(db,"project_id",project.id),allRows(()=>db.from("schemes").select("id,name,reference,status").eq("project_id",project.id).order("id")),allRows(()=>db.from("asset_assurance_links").select("asset_id").eq("record_id",record.id).order("asset_id"))]);setAssets(a);setSchemes(s);setLinks(l);}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{refresh();},[record.id]);
 async function write(fn){if(!canEdit||lock.current)return;lock.current=true;setBusy(true);setError("");try{await fn();await refresh();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 const scheme=a=>schemes.find(s=>s.id===a.scheme_id);
 const linked=assets.filter(a=>links.some(l=>l.asset_id===a.id));
 const available=assets.filter(a=>scheme(a)?.status==="active"&&!links.some(l=>l.asset_id===a.id)&&[a.reference,a.name,a.discipline,scheme(a)?.name].some(v=>String(v||"").toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b)=>a.reference.localeCompare(b.reference,undefined,{numeric:true}));
 return <section className="swFormPanel assetRelations"><div className="swSectionHeader"><h2>Linked master assets · {record.reference}</h2><button type="button" disabled={loading||busy} onClick={refresh}>Refresh</button></div>
 {error&&<p className="error" role="alert">{error}</p>}{loading?<p className="note">Loading assets…</p>:<>
 {linked.map(a=><div className="assetRelationRow" key={a.id}><div><strong>{a.reference} · {a.name||a.asset_type}</strong><p className="note">{scheme(a)?.name||"Scheme"} · {a.discipline} · {statuses[a.status]}</p></div><div className="chips">{onOpenAsset&&<button type="button" onClick={()=>onOpenAsset(a)}>Open asset</button>}{canEdit&&scheme(a)?.status==="active"&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm("Remove this asset association?"))write(async()=>{check(await db.from("asset_assurance_links").delete().eq("asset_id",a.id).eq("record_id",record.id));});}}>Unlink</button>}</div></div>)}{!linked.length&&<p className="note">No master assets linked.</p>}
 {canEdit&&<div className="swForm"><label>Find asset in this project<input value={search} onChange={e=>{setSearch(e.target.value);setChoice("");}} placeholder="Reference, discipline or scheme…"/></label><label>Master asset<select value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Select an asset</option>{available.map(a=><option key={a.id} value={a.id}>{scheme(a)?.name} · {a.reference} · {a.name||a.asset_type}</option>)}</select></label><button type="button" disabled={busy||!choice} onClick={()=>write(async()=>{check(await db.from("asset_assurance_links").insert({asset_id:choice,record_id:record.id,project_id:project.id}));setChoice("");})}>Link asset</button></div>}</>}
 <p className="note">Associations are shared across the project, but do not alter the assurance record version or its approval.</p></section>;
}
