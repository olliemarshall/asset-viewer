"use client";
export default function TechnicalQueryForm({project,draft,setDraft,disabled}){
 const d=draft.details||{};
 const extras=Array.isArray(d.word_extra_options)?d.word_extra_options:[];
 const changeExtra=(i,k,v)=>put("word_extra_options",extras.map((row,j)=>i===j?{...row,[k]:v}:row));
 const put=(key,value)=>setDraft(old=>({...old,details:{...old.details,[key]:value}}));
 const base=(key,value)=>setDraft(old=>({...old,[key]:value}));
 const input=(key,label,type="text")=><label key={key}>{label}<input type={type} maxLength={2000} value={d[key]||""} onChange={e=>put(key,e.target.value)}/></label>;
 const area=(key,label,rows=3)=><label key={key}>{label}<textarea rows={rows} maxLength={8000} value={d[key]||""} onChange={e=>put(key,e.target.value)}/></label>;
 return <fieldset className="tqForm" disabled={disabled}>
  <div className="tqHeader"><div><strong>Technical Query</strong><p>F0049 · Issue 2 · Working record</p></div><span className="note">Not a signed form</span></div>
  <div className="tqGrid">
   <label>Project name<input readOnly value={project.name}/></label><label>Project number<input readOnly value={project.reference}/></label>
   <label>Technical Query number<input required maxLength={100} value={draft.reference} onChange={e=>base("reference",e.target.value)}/></label>
   <label>Short title (register)<input required maxLength={250} value={draft.title} onChange={e=>base("title",e.target.value)}/></label>
   {input("word_to","To")}{input("word_from","From")}
  </div>
  <h3>Part 1 — Query / question</h3>
  <div className="tqGrid">{input("word_sent","Date sent (actual)","date")}{input("word_received","Date received by project (actual)","date")}{input("word_doc_ref","Document reference (where applicable)")}{input("word_doc_title","Document title (where applicable)")}</div>
  {area("question","Detailed description of query / question",6)}
  <h3>Part 2 — Contractor's possible solutions</h3>
  <div className="tqOptions"><table><thead><tr><th>Solution(s)</th><th>Estimated cost impact</th><th>Estimated programme impact</th></tr></thead><tbody>{[1,2].map(n=><tr key={n}><td>{area("word_solution"+n,"Option "+n+" — solution and technical compliance")}</td><td>{area("word_cost"+n,"Cost impact "+n)}</td><td>{area("word_programme"+n,"Programme impact "+n)}</td></tr>)}{extras.map((row,i)=><tr key={i+2}><td><label>Option {i+3} — solution and technical compliance<textarea rows={3} maxLength={2000} value={row.solution||""} onChange={e=>changeExtra(i,"solution",e.target.value)}/></label><button type="button" onClick={()=>{if(!Object.values(row).some(Boolean)||window.confirm("Remove this solution option?"))put("word_extra_options",extras.filter((_,j)=>i!==j));}}>Remove option {i+3}</button></td>{[["cost","Cost impact"],["programme","Programme impact"]].map(([k,l])=><td key={k}><label>{l}<textarea rows={3} maxLength={2000} value={row[k]||""} onChange={e=>changeExtra(i,k,e.target.value)}/></label></td>)}</tr>)}</tbody></table></div><div className="chips"><button type="button" disabled={extras.length>=10} onClick={()=>put("word_extra_options",[...extras,{solution:"",cost:"",programme:""}])}>＋ Add solution option</button><span className="note">{2+extras.length} options · up to 12 total</span></div>
  {area("options","Additional options and technical compliance")}
  <div className="tqGrid">{area("impact","Additional cost, resource and programme considerations")}{area("operations","Functional / operational implications")}</div>
  <h3>Part 3 — Contractor's proposed solution</h3>
  {area("word_proposal","Proposed solution and rationale",5)}
  <div className="tqGrid">{area("word_proposal_programme","Estimated programme impact of proposal")}{area("word_proposal_cost","Estimated cost impact of proposal")}</div>
  <div className="tqGrid">{input("word_response_required","Response / instruction required by (date)","date")}{input("word_milestone","Required milestone (if applicable)")}</div>
  {area("word_delay_impact","Programme impact if response or instruction is not received")}
  <label>Change to scope of work?<select value={d.word_scope_change||""} onChange={e=>put("word_scope_change",e.target.value)}>{[...new Set(["","Yes","No","To be determined",d.word_scope_change||""])].map(v=><option key={v} value={v}>{v||"Not recorded"}</option>)}</select></label>
  <div className="tqGrid">{input("word_contractor","Contractor")}{input("word_contractor_name","Contractor representative name")}</div>
  <p className="note">Signature and formal CEM confirmation must be completed through the authorised process.</p>
  <h3>Part 4 — Project's response</h3>
  <p className="note">Record the actual employer response and evidence only. This does not issue a response, instruction or approval. The native originator draft leaves Part 4 untouched.</p>
  {area("response","Reply / response evidence",5)}
  <div className="tqGrid">{input("word_reply_ref","Response reference")}{input("word_reply_date","Response received (actual)","date")}{input("word_pe","Discipline Project Engineer name (recorded)")}{input("word_dpe","Designated Project Engineer name (recorded)")}{input("word_pm","Project Manager name (recorded)")}{input("instruction","Separate instruction reference (if applicable)")}</div>
  <h3>SchemeWorks — management tracking</h3>
  <div className="tqGrid"><label>Owner / responsible person<input maxLength={200} value={draft.owner} onChange={e=>base("owner",e.target.value)}/></label><label>Tracker due date<input type="date" value={draft.due_date} onChange={e=>base("due_date",e.target.value)}/></label><label>Record status<select value={draft.status} onChange={e=>base("status",e.target.value)}>{Object.entries({draft:"Draft",open:"Open",in_review:"In review",closed:"Closed (record only)",withdrawn:"Withdrawn"}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
  <p className="note">Tracker due date is separate from the contractual response date. Neither status nor a TQ response is authority to commence work.</p>
 </fieldset>;
}
