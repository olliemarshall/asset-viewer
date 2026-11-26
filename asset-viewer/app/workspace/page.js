"use client";
import Link from "next/link";
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
    <Link className="workspaceBrand" href="/workspace">Engineering Workspace</Link>
    <div className="sharedHeaderActions"><Link href="/projects">Local prototype</Link>{user&&<><span className="note">{user.email}</span><button onClick={onSignOut}>Sign out</button></>}</div>
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
  const org=orgs.find(o=>o.id===orgId);
  const project=projects.find(p=>p.id===projectId&&p.organisation_id===orgId);
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
  function createOrg(e){e.preventDefault();write(()=>db.rpc("create_workspace_organisation",{org_name:orgName.trim()}),id=>{setOrgName("");setOrgId(id);setProjectId("");});}
  function saveProject(e){
    e.preventDefault();const values={name:projectDraft.name.trim(),reference:projectDraft.reference.trim(),description:projectDraft.description.trim()};
    write(()=>editingProject
      ?db.from("projects").update(values).eq("id",editingProject).select("id").single()
      :db.from("projects").insert({...values,organisation_id:orgId}).select("id").single(),data=>{setProjectDraft(emptyProject);setEditingProject(null);setProjectId(data.id);});
  }
  function saveScheme(e){
    e.preventDefault();const values={name:schemeDraft.name.trim(),reference:schemeDraft.reference.trim(),location:schemeDraft.location.trim(),description:schemeDraft.description.trim()};
    write(()=>editingScheme
      ?db.from("schemes").update(values).eq("id",editingScheme).select("id").single()
      :db.from("schemes").insert({...values,project_id:project.id}).select("id").single(),()=>{setSchemeDraft(emptyScheme);setEditingScheme(null);});
  }
  function toggleStatus(table,item){
    const status=item.status==="active"?"archived":"active";
    if(!window.confirm((status==="archived"?"Archive ":"Restore ")+item.name+"?"))return;
    write(()=>db.from(table).update({status}).eq("id",item.id).select("id").single());
  }
  function chooseOrg(id){setOrgId(id);setProjectId("");setEditingProject(null);setProjectDraft(emptyProject);setEditingScheme(null);setSchemeDraft(emptyScheme);}
  function chooseProject(id){setProjectId(id);setEditingScheme(null);setSchemeDraft(emptyScheme);}
  const filtered=projects.filter(p=>p.organisation_id===orgId&&(showArchived||p.status==="active"));
  const filteredSchemes=schemes.filter(s=>s.project_id===project?.id&&(showArchived||s.status==="active"));
  return <section className="workspaceContent">
    <div className="workspaceEyebrow">SHARED WORKSPACE</div>
    <div className="workspaceHeadingRow"><div><h1 className="workspaceTitle">Projects</h1><p className="workspaceLead">Authenticated organisation and scheme records in Supabase.</p></div><span className="workspacePill">Development</span></div>
    {error&&<div className="workspaceNotice error" role="alert"><strong>Could not complete request</strong><p>{error}</p><p>Ensure the workspace migration has been applied to the correct development database.</p></div>}
    {loading?<p>Loading shared records…</p>:<>
      <div className="sharedToolbar"><label className="field">Organisation<select value={orgId} onChange={e=>chooseOrg(e.target.value)} disabled={busy}><option value="">Select organisation</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="sharedCheck"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Show archived</label>
      <button disabled={busy} onClick={()=>setRevision(n=>n+1)}>Refresh</button></div>
      <details className="workspaceInfoCard" open={!orgs.length}>
        <summary>Create organisation</summary>
        <form className="sharedInlineForm" onSubmit={createOrg}><label className="field">Organisation name<input required maxLength={200} value={orgName} onChange={e=>setOrgName(e.target.value)}/></label><button disabled={busy}>Create</button></form>
      </details>
      {org&&<>
        <div className="workspaceSectionHeading sharedSection"><h2>{org.name} — projects</h2><span>{admin?"Organisation administrator":"Organisation member"}</span></div>
        {!filtered.length&&<p className="schemeEmpty">No accessible projects yet.</p>}
        <div className="schemeList">{filtered.map(p=><article className="schemeCard" key={p.id}><div><h3>{p.name}</h3><p>{p.reference} · {p.status}</p><p>{p.description}</p></div><div className="chips"><button disabled={busy} onClick={()=>chooseProject(p.id)}>Open</button>{admin&&<><button disabled={busy} onClick={()=>{setEditingProject(p.id);setProjectDraft({name:p.name,reference:p.reference,description:p.description});}}>Edit</button><button disabled={busy} onClick={()=>toggleStatus("projects",p)}>{p.status==="active"?"Archive":"Restore"}</button></>}</div></article>)}</div>
        {admin&&<form className="schemeForm" onSubmit={saveProject}><h2>{editingProject?"Edit project":"Create project"}</h2><label>Name<input required maxLength={200} value={projectDraft.name} onChange={e=>setProjectDraft(d=>({...d,name:e.target.value}))}/></label><label>Reference<input required maxLength={100} value={projectDraft.reference} onChange={e=>setProjectDraft(d=>({...d,reference:e.target.value}))}/></label><label>Description<textarea maxLength={4000} value={projectDraft.description} onChange={e=>setProjectDraft(d=>({...d,description:e.target.value}))}/></label><div className="chips"><button disabled={busy}>{editingProject?"Save project":"Create project"}</button>{editingProject&&<button type="button" className="sharedSecondary" onClick={()=>{setEditingProject(null);setProjectDraft(emptyProject);}}>Cancel</button>}</div></form>}
      </>}
      {project&&<>
        <div className="workspaceSectionHeading sharedSection"><h2>{project.name} — schemes</h2><button onClick={()=>chooseProject("")}>Close</button></div>
        {project.status==="archived"&&<p className="note">This project is archived.</p>}
        {!filteredSchemes.length&&<p className="schemeEmpty">No accessible schemes yet.</p>}
        <div className="schemeList">{filteredSchemes.map(s=><article className="schemeCard" key={s.id}><div><h3>{s.name}</h3><p>{s.reference} · {s.location||"Location unassigned"} · {s.status}</p><p>{s.description}</p></div>{canEditScheme&&project.status==="active"&&<div className="chips"><button disabled={busy} onClick={()=>{setEditingScheme(s.id);setSchemeDraft({name:s.name,reference:s.reference,location:s.location,description:s.description});}}>Edit</button><button disabled={busy} onClick={()=>toggleStatus("schemes",s)}>{s.status==="active"?"Archive":"Restore"}</button></div>}</article>)}</div>
        {canEditScheme&&project.status==="active"&&<form className="schemeForm" onSubmit={saveScheme}><h2>{editingScheme?"Edit scheme":"Create scheme"}</h2>{[["name","Name",200],["reference","Reference",100],["location","Location / ELR",200]].map(([field,label,max])=><label key={field}>{label}<input required={field!=="location"} maxLength={max} value={schemeDraft[field]} onChange={e=>setSchemeDraft(d=>({...d,[field]:e.target.value}))}/></label>)}<label>Description<textarea maxLength={4000} value={schemeDraft.description} onChange={e=>setSchemeDraft(d=>({...d,description:e.target.value}))}/></label><div className="chips"><button disabled={busy}>{editingScheme?"Save scheme":"Create scheme"}</button>{editingScheme&&<button type="button" className="sharedSecondary" onClick={()=>{setEditingScheme(null);setSchemeDraft(emptyScheme);}}>Cancel</button>}</div></form>}
      </>}
    </>}
    <div className="workspaceNotice"><strong>Scope of this release</strong><p>Organisations, projects and schemes are shared database records. Membership roles are enforced in the database; invitations, uploaded drawings, shared asset records and document/action/discussion registers are not yet connected. Archive is a reversible record status, not a security boundary.</p><p><Link href="/projects">Open the existing local prototype →</Link></p></div>
  </section>;
}
