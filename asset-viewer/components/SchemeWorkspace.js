"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const TABS = ["Overview", "Drawings & assets", "Documents", "Actions", "Discussions & decisions"];
const EMPTY = { documents: [], actions: [], discussions: [] };
const NEW = { title: "", url: "", type: "Design", owner: "", due: "", body: "" };

export default function SchemeWorkspace({ project, scheme }) {
  const [tab, setTab] = useState(TABS[0]);
  const [records, setRecords] = useState(EMPTY);
  const [draft, setDraft] = useState(NEW);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const schemePath = `/projects/${project.id}/schemes/${scheme.id}`;
  const storageKey = `scheme-workspace:${project.id}:${scheme.id}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw ? JSON.parse(raw) : {};
      setRecords({
        documents: Array.isArray(saved.documents) ? saved.documents : [],
        actions: Array.isArray(saved.actions) ? saved.actions : [],
        discussions: Array.isArray(saved.discussions) ? saved.discussions : [],
      });
    } catch {
      setStorageError("Could not read saved scheme records. Browser storage may be unavailable.");
    }
    setReady(true);
  }, [storageKey]);

  function save(next) {
    setRecords(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError("Changes are visible now but could not be saved in this browser.");
    }
  }

  function changeTab(next) {
    setTab(next);
    setDraft({ ...NEW, type: next === "Discussions & decisions" ? "Discussion" : "Design" });
    setError("");
  }

  function addRecord(event, kind) {
    event.preventDefault();
    setError("");
    const title = draft.title.trim();
    if (!title) { setError("Enter a title."); return; }
    const base = { id: crypto.randomUUID(), title, created: new Date().toISOString() };
    let record;
    if (kind === "documents") {
      let url;
      try { url = new URL(draft.url.trim()); } catch { setError("Enter a valid https:// or http:// document link."); return; }
      if (!["https:", "http:"].includes(url.protocol)) { setError("Use an HTTP or HTTPS link."); return; }
      record = { ...base, type: draft.type, url: url.href };
    } else if (kind === "actions") {
      record = { ...base, owner: draft.owner.trim(), due: draft.due, complete: false };
    } else {
      if (!draft.body.trim()) { setError("Enter the discussion or decision details."); return; }
      record = { ...base, type: draft.type, body: draft.body.trim() };
    }
    save({ ...records, [kind]: [...records[kind], record] });
    setDraft({ ...NEW, type: kind === "discussions" ? "Discussion" : "Design" });
  }

  function removeRecord(kind, id) {
    if (!window.confirm("Remove this local prototype record?")) return;
    save({ ...records, [kind]: records[kind].filter(record => record.id !== id) });
  }

  function toggleAction(id) {
    save({ ...records, actions: records.actions.map(record =>
      record.id === id ? { ...record, complete: !record.complete } : record) });
  }

  const field = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const openActions = records.actions.filter(action => !action.complete).length;
  const decisions = records.discussions.filter(item => item.type === "Decision").length;

  return (
    <main className="workspaceShell">
      <header className="workspaceTopbar">
        <Link className="workspaceBrand" href="/projects">Engineering Workspace</Link>
        <span className="workspaceTopbarNote">{project.name} / {scheme.name}</span>
      </header>
      <section className="workspaceContent schemeWorkspace">
        <Link className="workspaceBack" href={`/projects/${project.id}`}>← {project.name}</Link>
        <div className="workspaceEyebrow">SCHEME WORKSPACE · {scheme.reference}</div>
        <div className="workspaceHeadingRow">
          <div>
            <h1 className="workspaceTitle">{scheme.name}</h1>
            <p className="workspaceLead">{scheme.description}</p>
            <div className="schemeMeta"><span>{scheme.reference}</span><span>{scheme.location}</span></div>
          </div>
          <span className="workspacePill">Local prototype</span>
        </div>
        <nav className="schemeTabs" aria-label="Scheme sections">
          {TABS.map(item => (
            <button key={item} type="button" aria-pressed={item === tab}
              className={item === tab ? "schemeTab active" : "schemeTab"}
              onClick={() => changeTab(item)}>{item}</button>
          ))}
        </nav>

        {tab === "Overview" && <>
          <div className="schemeMetrics">
            {[
              [scheme.drawings.length, "Drawings", "Drawings & assets"],
              [ready ? records.documents.length : "—", "Document links", "Documents"],
              [ready ? openActions : "—", "Open actions", "Actions"],
              [ready ? decisions : "—", "Decisions", "Discussions & decisions"],
            ].map(([value, label, destination]) => (
              <button key={label} className="schemeMetric" onClick={() => changeTab(destination)}>
                <strong>{value}</strong><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="workspaceColumns">
            <section className="workspaceInfoCard">
              <h2>Scheme details</h2>
              <dl className="schemeFacts">
                <dt>Project</dt><dd>{project.name}</dd>
                <dt>Reference</dt><dd>{scheme.reference}</dd>
                <dt>Location / ELR</dt><dd>{scheme.location}</dd>
              </dl>
            </section>
            <section className="workspaceInfoCard">
              <h2>Discipline coordination</h2>
              <p>Signalling, track, E&amp;P, civils, telecoms and other disciplines can ultimately contribute drawing and asset records. Shared discipline assignment and filtering are not connected yet.</p>
            </section>
          </div>
        </>}

        {tab === "Drawings & assets" && <>
          <div className="workspaceSectionHeading"><h2>Drawing register</h2><span>{scheme.drawings.length} registered</span></div>
          <div className="schemeList">
            {scheme.drawings.map(drawing => (
              <article className="schemeCard" key={drawing.id}>
                <div className="schemeCardMain">
                  <div className="schemeIcon">▤</div>
                  <div>
                    <h3>{drawing.title}</h3>
                    <div className="schemeMeta"><span>{drawing.reference}</span><span>Revision {drawing.revision}</span><span>{drawing.discipline}</span></div>
                    <p>Open the corresponding PDF in the viewer.</p>
                  </div>
                </div>
                <Link className="primaryWorkspaceLink" href={`${schemePath}/drawings/${drawing.id}`}>Open drawing →</Link>
              </article>
            ))}
          </div>
          <div className="workspaceNotice"><strong>Drawing storage</strong><p>This register supports multiple drawing records in its data model. Adding drawings and storing their PDFs centrally will follow; currently the registered drawing is example metadata, not an attached PDF.</p></div>
        </>}

        {tab === "Documents" && <>
          <div className="workspaceSectionHeading"><h2>Document register</h2><span>{ready ? records.documents.length : "—"} links</span></div>
          <div className="schemeRecordList">
            {ready && !records.documents.length && <p className="schemeEmpty">No document links added yet.</p>}
            {records.documents.map(record => (
              <article className="schemeRecord" key={record.id}>
                <div><span className="schemeRecordType">{record.type}</span><h3><a href={record.url} target="_blank" rel="noopener noreferrer">{record.title} ↗</a></h3></div>
                <button onClick={() => removeRecord("documents", record.id)}>Remove</button>
              </article>
            ))}
          </div>
          <form className="schemeForm" onSubmit={event => addRecord(event, "documents")}>
            <h2>Add document link</h2>
            <label>Title<input required value={draft.title} onChange={event => field("title", event.target.value)} /></label>
            <label>Type<select value={draft.type} onChange={event => field("type", event.target.value)}>
              {["Design", "Drawing", "Meeting minutes", "Proposal", "Other"].map(type => <option key={type}>{type}</option>)}
            </select></label>
            <label>Document URL<input type="url" required placeholder="https://..." value={draft.url} onChange={event => field("url", event.target.value)} /></label>
            <button type="submit" disabled={!ready}>Add link</button>
          </form>
        </>}

        {tab === "Actions" && <>
          <div className="workspaceSectionHeading"><h2>Action register</h2><span>{ready ? openActions : "—"} open</span></div>
          <div className="schemeRecordList">
            {ready && !records.actions.length && <p className="schemeEmpty">No actions added yet.</p>}
            {records.actions.map(record => (
              <article className="schemeRecord" key={record.id}>
                <div><span className="schemeRecordType">{record.complete ? "Complete" : "Open"}</span><h3>{record.title}</h3><p>{record.owner || "Unassigned"} · {record.due || "No due date"}</p></div>
                <div className="schemeRecordButtons"><button onClick={() => toggleAction(record.id)}>{record.complete ? "Reopen" : "Complete"}</button><button onClick={() => removeRecord("actions", record.id)}>Remove</button></div>
              </article>
            ))}
          </div>
          <form className="schemeForm" onSubmit={event => addRecord(event, "actions")}>
            <h2>Add action</h2>
            <label>Action<input required value={draft.title} onChange={event => field("title", event.target.value)} /></label>
            <label>Owner<input value={draft.owner} onChange={event => field("owner", event.target.value)} /></label>
            <label>Due date<input type="date" value={draft.due} onChange={event => field("due", event.target.value)} /></label>
            <button type="submit" disabled={!ready}>Add action</button>
          </form>
        </>}

        {tab === "Discussions & decisions" && <>
          <div className="workspaceSectionHeading"><h2>Coordination log</h2><span>{ready ? records.discussions.length : "—"} entries</span></div>
          <div className="schemeRecordList">
            {ready && !records.discussions.length && <p className="schemeEmpty">No discussions or decisions recorded yet.</p>}
            {records.discussions.map(record => (
              <article className="schemeRecord" key={record.id}>
                <div><span className="schemeRecordType">{record.type}</span><h3>{record.title}</h3><p className="schemeRecordBody">{record.body}</p></div>
                <button onClick={() => removeRecord("discussions", record.id)}>Remove</button>
              </article>
            ))}
          </div>
          <form className="schemeForm" onSubmit={event => addRecord(event, "discussions")}>
            <h2>Add coordination entry</h2>
            <label>Title<input required value={draft.title} onChange={event => field("title", event.target.value)} /></label>
            <label>Type<select value={draft.type} onChange={event => field("type", event.target.value)}><option>Discussion</option><option>Decision</option></select></label>
            <label>Details<textarea required rows={4} value={draft.body} onChange={event => field("body", event.target.value)} /></label>
            <button type="submit" disabled={!ready}>Add entry</button>
          </form>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        {storageError && <p className="error" role="alert">{storageError}</p>}
        <div className="workspaceNotice">
          <strong>Prototype — browser only</strong>
          <p>Documents, actions and coordination entries are saved locally in this browser for this scheme. They are not shared, authenticated, audited or suitable for controlled engineering records. Document links do not upload files.</p>
        </div>
      </section>
    </main>
  );
}
