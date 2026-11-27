"use client";
import Link from "next/link";
import DrawingRegister from "../../components/DrawingRegister";
import MasterAssetRegister from "../../components/MasterAssetRegister";
import AssuranceWorkspace from "../../components/AssuranceWorkspace";
import DocumentTemplates from "../../components/DocumentTemplates";
import EngineeringManagement from "../../components/EngineeringManagement";
import Trackers from "../../components/Trackers";
import MyWorkspace from "../../components/MyWorkspace";
import ProjectEngineeringTeam from "../../components/ProjectEngineeringTeam";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let db = null;
let configurationError = "";
try {
  if (url && key) db = createClient(url, key);
} catch { configurationError = "Invalid Supabase public configuration."; }

function Header({user,onSignOut}) {
  return <header className="workspaceTopbar">
    <Link className="workspaceBrand" href="/"><span className="swMark" aria-hidden="true">S</span><span>Scheme<span className="swBrandAccent">Works</span></span></Link>
    <div className="sharedHeaderActions"><Link href="/viewer">PDF viewer</Link><Link href="/projects">Local prototype</Link>{user&&<><span className="note">{user.email}</span><button onClick={onSignOut}>Sign out</button></>}</div>
  </header>;
}

export default function SharedWorkspace() {
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [signup,setSignup]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!db){setLoading(false);return;}
    let live=true;
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,next)=>{
      if(live){setSession(next);setLoading(false);}
    });
    db.auth.getSession().then(({data,error})=>{
      if(live){if(error)setError(error.message);setSession(data.session);setLoading(false);}
    }).catch(e=>{if(live){setError(e.message);setLoading(false);}});
    return()=>{live=false;subscription.unsubscribe();};
  },[]);

  async function submit(e){
    e.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const credentials={email:email.trim(),password};
      const result=signup
        ? await db.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin+"/workspace"}})
        : await db.auth.signInWithPassword(credentials);
      if(result.error)throw result.error;
      setPassword("");
      if(signup&&!result.data.session)setMessage("If registration is available for this address, check your email for a confirmation link before signing in.");
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function signOut(){
    setError("");
    const {error}=await db.auth.signOut();
    if(error)setError(error.message);
  }
  if(!db)return <main className="workspaceShell"><Header/><section className="workspaceContent"><h1 className="workspaceTitle">Shared workspace setup</h1><p>{configurationError||"Supabase public environment variables are not configured for this deployment."}</p><p className="note">Configure the public project URL and publishable key in Vercel. Never use a service-role or secret key in browser configuration.</p><Link href="/projects">Open the local prototype →</Link></section></main>;
  if(loading)return <main className="workspaceShell"><Header/><section className="workspaceContent">Checking your session…</section></main>;
  if(session?.user)return <main className="workspaceShell"><Header user={session.user} onSignOut={signOut}/>{error&&<p className="error">{error}</p>}<Portfolio key={session.user.id} user={session.user}/></main>;
  return <main className="workspaceShell"><Header/><section className="workspaceContent">
    <div className="workspaceEyebrow">SHARED WORKSPACE · DEVELOPMENT</div>
    <h1 className="workspaceTitle">{signup?"Create an account":"Sign in"}</h1>
    <p className="workspaceLead">Access persistent organisation, project and scheme records.</p>
    <form className="schemeForm sharedAuth" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input type="password" autoComplete={signup?"new-password":"current-password"} minLength={signup?8:1} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {error&&<p className="error" role="alert">{error}</p>}
      {message&&<p role="status">{message}</p>}
      <button disabled={busy} type="submit">{busy?"Please wait…":signup?"Register":"Sign in"}</button>
      <button className="sharedSecondary" type="button" disabled={busy} onClick={()=>{setSignup(v=>!v);setError("");setMessage("");}}>{signup?"Already registered? Sign in":"Create an account"}</button>
    </form>
    <div className="workspaceNotice"><strong>Development environment</strong><p>Use invented test project data only. The local PDF viewer and its existing browser records have not been migrated.</p></div>
  </section></main>;
}

const emptyProject={name:"",reference:"",description:""};
const emptyScheme={name:"",reference:"",location:"",description:""};
function Portfolio({user}){
  const [orgs,setOrgs]=useState([]);
  const [memberships,setMemberships]=useState([]);
  const [projects,setProjects]=useState([]);
  const [projectRoles,setProjectRoles]=useState([]);
  const [schemes,setSchemes]=useState([]);
  const [orgId,setOrgId]=useState("");
  const [projectId,setProjectId]=useState("");
  const [schemeId,setSchemeId]=useState("");
  const [projectTab,setProjectTab]=useState("schemes");
  const [schemeTab,setSchemeTab]=useState("drawings");
  const [initialAssetId,setInitialAssetId]=useState("");
  const [initialDrawing,setInitialDrawing]=useState(null);
  function openMasterAsset(asset){const p=projects.find(p=>p.id===asset.project_id);if(!p)return;setOrgId(p.organisation_id);setProjectId(p.id);setSchemeId(asset.scheme_id);setPersonal(false);setSchemeTab("assets");setInitialAssetId(asset.id);setInitialDrawing(null);cancelForm();}
  function openLinkedDrawing(drawing,calloffId){setSchemeId(drawing.scheme_id);setSchemeTab("drawings");setInitialDrawing({drawingId:drawing.id,calloffId});cancelForm();}
  const [personal,setPersonal]=useState(false);
  const [initialRecord,setInitialRecord]=useState(null);
  function openAssuranceRecord(record){const target=projects.find(p=>p.id===record.project_id);if(target){setOrgId(target.organisation_id);setProjectId(target.id);setSchemeId("");}setPersonal(false);setInitialRecord({id:record.id,kind:record.kind});setProjectTab("assurance");cancelForm();}
  const [orgName,setOrgName]=useState("");
  const [projectDraft,setProjectDraft]=useState(emptyProject);
  const [schemeDraft,setSchemeDraft]=useState(emptyScheme);
  const [editingProject,setEditingProject]=useState(null);
  const [editingScheme,setEditingScheme]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [showArchived,setShowArchived]=useState(false);
  const [revision,setRevision]=useState(0);
  const [form,setForm]=useState(null);
  const [search,setSearch]=useState("");
  const org=orgs.find(o=>o.id===orgId);
  const project=projects.find(p=>p.id===projectId&&p.organisation_id===orgId);
  const scheme=schemes.find(s=>s.id===schemeId&&s.project_id===project?.id);
  const admin=memberships.some(m=>m.organisation_id===orgId&&m.role==="admin");
  const canEditScheme=!!project&&(admin||projectRoles.some(m=>m.project_id===project.id&&m.role==="editor"));

  useEffect(()=>{
    let live=true;setLoading(true);setError("");
    Promise.all([
      db.from("organisations").select("id,name").order("name"),
      db.from("organisation_members").select("organisation_id,role").eq("user_id",user.id),
      db.from("projects").select("id,organisation_id,name,reference,description,status").order("name"),
      db.from("project_members").select("project_id,role").eq("user_id",user.id),
      db.from("schemes").select("id,project_id,name,reference,location,description,status").order("name"),
    ]).then(results=>{
      if(!live)return;
      const failure=results.find(x=>x.error);
      if(failure)throw failure.error;
      const [o,m,p,pm,s]=results.map(x=>x.data||[]);
      setOrgs(o);setMemberships(m);setProjects(p);setProjectRoles(pm);setSchemes(s);
      setOrgId(current=>o.some(x=>x.id===current)?current:o[0]?.id||"");
      setProjectId(current=>p.some(x=>x.id===current)?current:"");
    }).catch(e=>{if(live){setError(e.message);setOrgs([]);setMemberships([]);setProjects([]);setProjectRoles([]);setSchemes([]);}}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[user.id,revision]);

  async function write(operation,success){
    setBusy(true);setError("");
    try{const {data,error}=await operation();if(error)throw error;success?.(data);setRevision(n=>n+1);}
    catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  function createOrg(e){e.preventDefault();write(()=>db.rpc("create_workspace_organisation",{org_name:orgName.trim()}),id=>{setOrgName("");setOrgId(id);setProjectId("");setSchemeId("");setForm(null);});}
  function saveProject(e){
    e.preventDefault();const values={name:projectDraft.name.trim(),reference:projectDraft.reference.trim(),description:projectDraft.description.trim()};
    write(()=>editingProject
      ?db.from("projects").update(values).eq("id",editingProject).select("id").single()
      :db.from("projects").insert({...values,organisation_id:orgId}).select("id").single(),data=>{setProjectDraft(emptyProject);setEditingProject(null);setProjectId(data.id);setSchemeId("");setForm(null);setSearch("");});
  }
  function saveScheme(e){
    e.preventDefault();const values={name:schemeDraft.name.trim(),reference:schemeDraft.reference.trim(),location:schemeDraft.location.trim(),description:schemeDraft.description.trim()};
    write(()=>editingScheme
      ?db.from("schemes").update(values).eq("id",editingScheme).select("id").single()
      :db.from("schemes").insert({...values,project_id:project.id}).select("id").single(),()=>{setSchemeDraft(emptyScheme);setEditingScheme(null);setForm(null);});
  }
  function toggleStatus(table,item){
    const status=item.status==="active"?"archived":"active";
    if(!window.confirm((status==="archived"?"Archive ":"Restore ")+item.name+"?"))return;
    write(()=>db.from(table).update({status}).eq("id",item.id).select("id").single());
  }
  function chooseOrg(id){setPersonal(false);setInitialRecord(null);setProjectTab("schemes");setSearch("");setForm(null);setOrgId(id);setProjectId("");setSchemeId("");setEditingProject(null);setProjectDraft(emptyProject);setEditingScheme(null);setSchemeDraft(emptyScheme);}
  function chooseProject(id){setPersonal(false);setInitialRecord(null);setProjectTab("schemes");setSearch("");setForm(null);setProjectId(id);setSchemeId("");setEditingScheme(null);setSchemeDraft(emptyScheme);}
  const matches=item=>[item.name,item.reference,item.description,item.location].some(v=>String(v||"").toLowerCase().includes(search.trim().toLowerCase()));
  const orgProjects=projects.filter(p=>p.organisation_id===orgId);
  const projectSchemes=schemes.filter(s=>s.project_id===project?.id);
  const filtered=orgProjects.filter(p=>(showArchived||p.status==="active")&&matches(p));
  const filteredSchemes=projectSchemes.filter(s=>(showArchived||s.status==="active")&&matches(s));
  const chooseScheme=id=>{setSchemeTab("drawings");setInitialDrawing(null);setInitialAssetId("");setProjectTab("schemes");setSchemeId(id);setForm(null);setSearch("");};
  const cancelForm=()=>{setForm(null);setEditingProject(null);setEditingScheme(null);setProjectDraft(emptyProject);setSchemeDraft(emptyScheme);setOrgName("");};
  function newProject(){cancelForm();setForm("project");}
  function newScheme(){cancelForm();setForm("scheme");}
  function editProject(p){setEditingProject(p.id);setProjectDraft({name:p.name,reference:p.reference,description:p.description});setForm("project");}
  function editScheme(s){setEditingScheme(s.id);setSchemeDraft({name:s.name,reference:s.reference,location:s.location,description:s.description});setForm("scheme");}
  return <div className="swLayout">
    <aside className="swNav" aria-label="Workspace navigation">
      <div className="swNavLabel">WORKSPACE</div>
      <label className="field">Organisation<select value={orgId} onChange={e=>chooseOrg(e.target.value)} disabled={busy}><option value="">Select organisation</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <button className="swNavLink" disabled={busy} onClick={()=>{chooseProject("");setForm("organisation");}}>＋ New organisation</button>
      <div className="swNavLabel">PORTFOLIO</div><button className={"swNavLink"+(personal?" active":"")} disabled={busy} onClick={()=>{chooseProject("");setPersonal(true);}}>◉ My workspace</button>
      <button className={"swNavLink"+(!project&&!personal?" active":"")} disabled={busy} onClick={()=>chooseProject("")}>▦ All projects</button>
      {orgProjects.filter(p=>p.status==="active"||showArchived||p.id===projectId).map(p=><button key={p.id} title={p.name} className={"swNavLink swNavProject"+(p.id===projectId?" active":"")} disabled={busy} onClick={()=>chooseProject(p.id)}><span>▰</span><span>{p.name}</span></button>)}
      <div className="swNavFoot"><span className="note">{org?(admin?"Organisation administrator":"Organisation member"):"No organisation selected"}</span><Link href="/projects">Standalone prototype ↗</Link></div>
    </aside>
    <main className="swMain">
      <nav className="swBreadcrumb" aria-label="Breadcrumb"><button disabled={busy} onClick={()=>chooseProject("")}>Projects</button>{project&&<><span>›</span><button disabled={busy} onClick={()=>chooseScheme("")}>{project.name}</button></>}{scheme&&<><span>›</span><span aria-current="page">{scheme.name}</span></>}</nav>
      <div className="swHeading">
        <div><div className="workspaceEyebrow">{personal?"PERSONAL WORKSPACE":scheme?"SCHEME WORKSPACE":project?"PROJECT WORKSPACE":"PROJECT PORTFOLIO"}</div>
          <h1 className="workspaceTitle">{personal?"My workspace":scheme?.name||project?.name||"Projects"}</h1>
          <p className="workspaceLead">{scheme?scheme.reference+(scheme.location?" · "+scheme.location:""):project?project.reference+" · "+(project.description||"Engineering schemes"):"Manage your engineering projects, schemes and drawings."}</p>
        </div>
        <div className="swHeadingActions">
          {!scheme&&project&&projectTab==="schemes"&&canEditScheme&&project.status==="active"&&<button className="swPrimary" disabled={busy} onClick={newScheme}>＋ New scheme</button>}
          {!personal&&!project&&org&&admin&&<button className="swPrimary" disabled={busy} onClick={newProject}>＋ New project</button>}
          {!personal&&!org&&<button className="swPrimary" disabled={busy} onClick={()=>setForm("organisation")}>＋ New organisation</button>}
          <button disabled={busy||loading} onClick={()=>setRevision(n=>n+1)}>Refresh</button>
        </div>
      </div>
      {error&&<div className="workspaceNotice error" role="alert"><strong>Could not complete request</strong><p>{error}</p></div>}
      {form&&<section className="swFormPanel" aria-label="Record editor">
        <div className="swSectionHeader"><h2>{form==="organisation"?"Create organisation":form==="project"?(editingProject?"Edit project":"Create project"):(editingScheme?"Edit scheme":"Create scheme")}</h2><button disabled={busy} onClick={cancelForm}>Cancel ×</button></div>
        {form==="organisation"?<form className="swForm" onSubmit={createOrg}><label>Organisation name<input required maxLength={200} value={orgName} onChange={e=>setOrgName(e.target.value)}/></label><button className="swPrimary" disabled={busy}>Create organisation</button></form>:form==="project"&&admin?<form className="swForm" onSubmit={saveProject}>
          <div className="swFormGrid"><label>Project name<input required maxLength={200} value={projectDraft.name} onChange={e=>setProjectDraft(d=>({...d,name:e.target.value}))}/></label><label>Reference<input required maxLength={100} value={projectDraft.reference} onChange={e=>setProjectDraft(d=>({...d,reference:e.target.value}))}/></label></div>
          <label>Description<textarea maxLength={4000} rows={3} value={projectDraft.description} onChange={e=>setProjectDraft(d=>({...d,description:e.target.value}))}/></label><button className="swPrimary" disabled={busy}>{editingProject?"Save changes":"Create project"}</button>
        </form>:form==="scheme"&&canEditScheme&&project?.status==="active"?<form className="swForm" onSubmit={saveScheme}>
          <div className="swFormGrid">{[["name","Scheme name",200],["reference","Reference",100],["location","Location / ELR",200]].map(([field,label,max])=><label key={field}>{label}<input required={field!=="location"} maxLength={max} value={schemeDraft[field]} onChange={e=>setSchemeDraft(d=>({...d,[field]:e.target.value}))}/></label>)}</div>
          <label>Description<textarea maxLength={4000} rows={3} value={schemeDraft.description} onChange={e=>setSchemeDraft(d=>({...d,description:e.target.value}))}/></label><button className="swPrimary" disabled={busy}>{editingScheme?"Save changes":"Create scheme"}</button>
        </form>:<p className="note">You do not have permission to edit this record.</p>}
      </section>}
      {project&&!scheme&&<nav className="assuranceTabs" aria-label="Project sections">{[["schemes","Schemes"],["assurance","Engineering assurance"],["templates","Document templates"],["management","Engineering management"],["trackers","Trackers"],["team","Engineering team"]].map(([k,label])=><button key={k} className={projectTab===k?"active":""} onClick={()=>{setInitialRecord(null);setProjectTab(k);cancelForm();}}>{label}</button>)}</nav>}
      {scheme&&<nav className="assuranceTabs" aria-label="Scheme sections">{[["drawings","Drawing register"],["assets","Master asset register"]].map(([k,l])=><button key={k} className={schemeTab===k?"active":""} onClick={()=>{setSchemeTab(k);setInitialDrawing(null);setInitialAssetId("");}}>{l}</button>)}</nav>}
      {loading?<p className="swEmpty">Loading shared records…</p>:personal?<MyWorkspace db={db} user={user} projects={projects} onOpenRecord={openAssuranceRecord}/>:project&&!scheme&&projectTab==="assurance"?<AssuranceWorkspace key={project.id+":"+(initialRecord?.id||"")} db={db} project={project} initialRecord={initialRecord} onOpenAsset={openMasterAsset} canEdit={canEditScheme&&project.status==="active"}/>:project&&!scheme&&projectTab==="templates"?<DocumentTemplates key={project.id} db={db} project={project} canEdit={canEditScheme&&project.status==="active"} onOpenRecord={openAssuranceRecord}/>:project&&!scheme&&projectTab==="management"?<EngineeringManagement key={project.id} db={db} project={project} onOpenRecord={openAssuranceRecord}/>:project&&!scheme&&projectTab==="trackers"?<Trackers key={project.id} db={db} project={project} onOpenRecord={openAssuranceRecord}/>:project&&!scheme&&projectTab==="team"?<ProjectEngineeringTeam key={project.id} db={db} project={project} admin={admin}/>:scheme&&schemeTab==="assets"?<MasterAssetRegister key={scheme.id+":"+initialAssetId} db={db} project={project} scheme={scheme} initialAssetId={initialAssetId} canEdit={canEditScheme&&project.status==="active"&&scheme.status==="active"} onOpenDrawing={openLinkedDrawing} onOpenRecord={openAssuranceRecord}/>:scheme?<DrawingRegister key={scheme.id} db={db} user={user} scheme={scheme} project={project} canUpload={canEditScheme&&project.status==="active"&&scheme.status==="active"} initialDrawing={initialDrawing} onOpenRecord={openAssuranceRecord} onClose={()=>chooseScheme("")}/>:org?<>
        <div className="swStats">
          <div><span>{project?"Active schemes":"Active projects"}</span><strong>{(project?projectSchemes:orgProjects).filter(x=>x.status==="active").length}</strong></div>
          <div><span>{project?"Archived schemes":"Archived projects"}</span><strong>{(project?projectSchemes:orgProjects).filter(x=>x.status==="archived").length}</strong></div>
          <div><span>{project?"Project access":"Accessible schemes"}</span><strong>{project?(canEditScheme?"Editor":"Viewer"):schemes.filter(s=>orgProjects.some(p=>p.id===s.project_id)).length}</strong></div>
        </div>
        <div className="swSectionHeader swListHeading"><h2>{project?"Schemes":"Project workspaces"}</h2><span className="note">{(project?filteredSchemes:filtered).length} shown</span></div>
        <div className="swSearchRow"><input aria-label={project?"Search schemes":"Search projects"} placeholder={project?"Search schemes…":"Search projects…"} value={search} onChange={e=>setSearch(e.target.value)}/><label className="sharedCheck"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Show archived</label></div>
        {!(project?filteredSchemes:filtered).length&&<div className="swEmpty">{search?"No matching records.":project?"No accessible schemes yet.":"No accessible projects yet."}</div>}
        <div className="swCardGrid">{(project?filteredSchemes:filtered).map(item=><article className="swRecordCard" key={item.id}>
          <div className="swRecordTop"><span className="swRecordIcon" aria-hidden="true">{project?"▤":"▦"}</span><span className={"swStatus "+item.status}>{item.status==="active"?"Active":"Archived"}</span></div>
          <button type="button" className="swRecordTitle" disabled={busy} onClick={()=>project?chooseScheme(item.id):chooseProject(item.id)}>{item.name}</button>
          <span className="swReference">{item.reference}{project&&item.location?" · "+item.location:""}</span>
          <p>{item.description||"No description provided."}</p>
          {!project&&<span className="note">{schemes.filter(s=>s.project_id===item.id&&s.status==="active").length} active schemes</span>}
          <div className="swRecordActions"><button className="swOpen" disabled={busy} onClick={()=>project?chooseScheme(item.id):chooseProject(item.id)}>{project?"Open scheme":"Open project"} →</button>
          {(project?canEditScheme&&project.status==="active":admin)&&<><button disabled={busy} onClick={()=>project?editScheme(item):editProject(item)}>Edit</button><button disabled={busy} onClick={()=>toggleStatus(project?"schemes":"projects",item)}>{item.status==="active"?"Archive":"Restore"}</button></>}</div>
        </article>)}</div>
      </>:<div className="swEmpty"><h2>Start with an organisation</h2><p>Create an organisation to manage engineering projects and schemes.</p></div>}
      <footer className="swFooter">SchemeWorks · Development preview · Use approved test data only. Drawing call-offs and assurance records are working drafts; engineering verification required.</footer>
    </main>
  </div>;
}
