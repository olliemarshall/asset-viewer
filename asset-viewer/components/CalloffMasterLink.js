"use client";
import {useEffect,useState,useRef} from "react";
import AssetRelations from "./AssetRelations";
import {listAssets,createAsset,fromCalloff,check,statuses} from "../lib/master-assets";
export default function CalloffMasterLink({store,calloff,version,dirty,disabled}){
 const {db,drawingId,schemeId,projectId,canEdit}=store;
 const [assets,setAssets]=useState([]),[link,setLink]=useState(null),[choice,setChoice]=useState(""),[reference,setReference]=useState(calloff.label||""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const lock=useRef(false),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function refresh(){setLoading(true);setError("");try{const [a,l]=await Promise.all([listAssets(db,"scheme_id",schemeId),db.from("asset_drawing_links").select("asset_id,linked_version").eq("drawing_id",drawingId).eq("calloff_id",calloff.id).maybeSingle()]);if(live.current){setAssets(a);setLink(check(l));}}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setLoading(false);}}
 useEffect(()=>{refresh();},[drawingId,calloff.id]);
 const asset=assets.find(a=>a.id===link?.asset_id);
 const allowed=canEdit&&!dirty&&version>0&&!busy&&!disabled;
 async function write(operation){if(!allowed||lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await operation();await refresh();}catch(e){if(live.current)setError(e.message);await refresh().catch(()=>{});}finally{lock.current=false;if(live.current)setBusy(false);}}
 async function linkTo(id){check(await db.from("asset_drawing_links").insert({drawing_id:drawingId,calloff_id:calloff.id,scheme_id:schemeId,asset_id:id,linked_version:version}));setNotice("Master asset linked.");}
 function createAndLink(){if(!reference.trim())return;if(!window.confirm("Create a new master asset? Check that this equipment is not already registered."))return;write(async()=>{const a=await createAsset(db,schemeId,projectId,{...fromCalloff(calloff),reference:reference.trim()});try{await linkTo(a.id);}catch(e){throw Error("Master asset created, but the link failed. Select the existing asset after refreshing: "+e.message);}});}
 const sorted=[...assets].sort((a,b)=>a.reference.localeCompare(b.reference,undefined,{numeric:true}));
 return <div className="masterCalloff"><div className="swSectionHeader"><strong>Master asset</strong><button type="button" disabled={busy||loading} onClick={refresh}>Refresh</button></div>
 <p className="note">Drawing call-offs are revision-specific observations. A master record is shared across this scheme.</p>
 {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="note" role="status">{notice}</p>}
 {loading?<p className="note">Loading master asset…</p>:link?<>{asset?<AssetRelations key={asset.id} db={db} asset={asset} canEdit={false} onOpenRecord={store.onOpenRecord}/>:<p className="note">Linked master asset unavailable.</p>}{canEdit&&<button type="button" disabled={!allowed} onClick={()=>{if(window.confirm("Unlink this call-off from its master asset?"))write(async()=>{check(await db.from("asset_drawing_links").delete().eq("drawing_id",drawingId).eq("calloff_id",calloff.id).eq("asset_id",link.asset_id));setNotice("Association removed.");});}}>Unlink master asset</button>}</>:canEdit?<><label className="field">Link existing asset<select disabled={!allowed} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose master asset</option>{sorted.map(a=><option key={a.id} value={a.id}>{a.reference} · {a.discipline} · {statuses[a.status]}</option>)}</select></label><button type="button" disabled={!allowed||!choice} onClick={()=>write(()=>linkTo(choice))}>Link selected asset</button><details><summary>Create new master asset</summary><label className="field">Master asset reference<input maxLength={200} disabled={!allowed} value={reference} onChange={e=>setReference(e.target.value)}/></label><button type="button" disabled={!allowed||!reference.trim()} onClick={createAndLink}>Create & link</button><p className="note">New master assets start as Needs review. Existing call-off notes and status stay on the drawing.</p></details></>:<p className="note">No master asset linked.</p>}
 {canEdit&&(dirty||!version)&&<p className="note">Save call-offs before changing master asset associations.</p>}</div>;
}
