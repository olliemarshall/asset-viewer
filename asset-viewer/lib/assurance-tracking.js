// Project-scoped queries use the current authenticated client's RLS permissions.
export async function loadProjectRecords(db,projectId){
 const rows=[];let last=null;
 for(;;){
  let q=db.from("assurance_records").select("*").eq("project_id",projectId).order("id").limit(500);
  if(last)q=q.gt("id",last);
  const {data,error}=await q;if(error)throw error;
  if(!data?.length)break;
  rows.push(...data);last=data[data.length-1].id;
 }
 return rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
}
export const outstanding=r=>!["closed","withdrawn","note"].includes(r.status);
export const active=r=>["open","in_review"].includes(r.status);
export function localDay(date=new Date()){
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export const validDay=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function trackerDue(r){return validDay(r.due_date)?r.due_date:null;}
export function responseDue(r){return r.kind==="tq"&&validDay(r.details?.word_response_required)?r.details.word_response_required:null;}
export function flags(r,today){
 const due=trackerDue(r),response=responseDue(r),waiting=r.kind==="tq"&&active(r)&&validDay(r.details?.word_sent)&&!validDay(r.details?.word_reply_date);
 return {overdue:outstanding(r)&&!!due&&due<today,dueToday:outstanding(r)&&due===today,
 unassigned:outstanding(r)&&!String(r.owner||"").trim(),noDue:outstanding(r)&&!due,
 waiting,lateResponse:waiting&&!!response&&response<today,
 missingSent:r.kind==="tq"&&active(r)&&!validDay(r.details?.word_sent),
 missingResponseDate:r.kind==="tq"&&!!String(r.details?.response||"").trim()&&!validDay(r.details?.word_reply_date)};
}
export function metrics(rows,today){
 const m={total:rows.length,draft:0,open:0,in_review:0,closed:0,withdrawn:0,note:0,deferred:0,outstanding:0,overdue:0,dueToday:0,unassigned:0,noDue:0,waiting:0,lateResponse:0,missingSent:0,missingResponseDate:0};
 for(const r of rows){
  if(["draft","open","in_review","closed","withdrawn","note","deferred"].includes(r.status))m[r.status]++;
  if(outstanding(r))m.outstanding++;
  for(const [k,v] of Object.entries(flags(r,today)))if(v)m[k]++;
 }
 return m;
}
