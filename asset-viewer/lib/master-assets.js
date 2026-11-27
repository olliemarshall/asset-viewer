export const disciplines=["Unassigned","Signalling","Track","E&P","Civils","Telecoms","Other"];
export const statuses={REVIEW:"Needs review",NEW:"New",EXISTING:"Existing",RECOVER:"Recovered",PROPOSED:"Proposed"};
export const check=r=>{if(r.error)throw r.error;return r.data;};
export async function allRows(build){
 const result=[];let offset=0;for(;;){const rows=check(await build().range(offset,offset+499));if(!rows?.length)break;result.push(...rows);offset+=rows.length;}return result;
}
export const assetCols="id,scheme_id,project_id,reference,name,discipline,asset_type,status,owner,notes,version,updated_at";
export const listAssets=(db,field,id)=>allRows(()=>db.from("master_assets").select(assetCols).eq(field,id).order("id"));
export function calloffExists(payload,id){
 if(!payload||typeof id!=="string")return false;
 if(id.startsWith("manual:"))return !!payload.records?.manual?.[id];
 return id.startsWith("auto:")&&Array.isArray(payload.extracted)&&payload.extracted.some(a=>"auto:"+a.label===id)&&payload.records?.overrides?.[id]?.dismissed!==true;
}
export function blankAsset(){return {reference:"",name:"",discipline:"Unassigned",asset_type:"unclassified",status:"REVIEW",owner:"",notes:""};}
export function fromCalloff(a){return {...blankAsset(),reference:String(a.label||"").trim().slice(0,200),discipline:disciplines.includes(a.discipline)?a.discipline:"Unassigned",asset_type:String(a.type||"unclassified").slice(0,150)};}
export async function createAsset(db,schemeId,projectId,draft){
 return check(await db.from("master_assets").insert({...draft,reference:draft.reference.trim(),scheme_id:schemeId,project_id:projectId}).select(assetCols).single());
}
export async function assetRelations(db,asset){
 const [placements,links]=await Promise.all([
 allRows(()=>db.from("asset_drawing_links").select("drawing_id,calloff_id,linked_version").eq("asset_id",asset.id).order("drawing_id").order("calloff_id")),
 allRows(()=>db.from("asset_assurance_links").select("record_id").eq("asset_id",asset.id).order("record_id"))
 ]);
 const drawings=[],records=[],sets=[];
 const drawingIds=[...new Set(placements.map(p=>p.drawing_id))];
 for(let i=0;i<drawingIds.length;i+=50){
 const ids=drawingIds.slice(i,i+50);
 const [d,s]=await Promise.all([db.from("drawings").select("id,reference,title,revision,scheme_id").in("id",ids),db.from("drawing_calloff_sets").select("drawing_id,version,payload").in("drawing_id",ids)]);
 drawings.push(...check(d));sets.push(...check(s));
 }
 for(let i=0;i<links.length;i+=100){records.push(...check(await db.from("assurance_records").select("id,project_id,reference,title,kind,status").in("id",links.slice(i,i+100).map(l=>l.record_id))));}
 return {placements:placements.map(p=>{const s=sets.find(s=>s.drawing_id===p.drawing_id);return {...p,drawing:drawings.find(d=>d.id===p.drawing_id),present:calloffExists(s?.payload,p.calloff_id),changed:s?.version!==p.linked_version};}),records};
}
