"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { extractFromPdf, STATUS_COLOURS, STATUS_ORDER } from "../lib/extract";

const DISCIPLINES = ["Unassigned", "Signalling", "Track", "E&P", "Civils", "Telecoms", "Other"];
const TYPES = {
  Unassigned: ["unclassified"],
  Signalling: ["signal", "points", "track_circuit", "location_case", "wheel_sensor", "track_equipment", "whistle_board", "speed_board", "level_crossing_equipment", "treadle", "axle_counter", "sawd_detector", "sawd_annunciator", "cable", "other"],
  Track: ["rail", "sleeper", "points", "crossing", "buffer_stop", "track_equipment", "other"],
  "E&P": ["pole", "overhead_line_equipment", "power_supply", "cable", "distribution_equipment", "other"],
  Civils: ["foundation", "fence", "structure", "drainage", "access", "other"],
  Telecoms: ["telephone", "cabinet", "cable", "antenna", "other"],
  Other: ["other"],
};
const typeLabel = type => (type || "unclassified").replaceAll("_", " ");
const knownTypes = [...new Set(Object.values(TYPES).flat())];
const colour = s => `rgb(${STATUS_COLOURS[s].rgb.join(",")})`;
const blank = () => ({ manual: {}, overrides: {} });
const autoId = label => "auto:" + label;
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const safeStatus = s => Object.hasOwn(STATUS_COLOURS, s) ? s : "REVIEW";
const safeDiscipline = d => DISCIPLINES.includes(d) ? d : "Unassigned";
const safeType = t => knownTypes.includes(t) ? t : "unclassified";
const safeLinks = links => Array.isArray(links) ? links.filter(l => l && typeof l.title === "string" && typeof l.url === "string" && /^https?:\/\//i.test(l.url)).map(l => ({title:l.title,url:l.url})) : [];
function cleanPatch(p) {
  const out = {};
  if (!p || typeof p !== "object") return out;
  if (typeof p.label === "string") out.label = p.label;
  if (typeof p.type === "string") out.type = safeType(p.type);
  if (typeof p.discipline === "string") out.discipline = safeDiscipline(p.discipline);
  if (typeof p.status === "string") out.status = safeStatus(p.status);
  if (typeof p.owner === "string") out.owner = p.owner;
  if (typeof p.notes === "string") out.notes = p.notes;
  if (Array.isArray(p.links)) out.links = safeLinks(p.links);
  if (validPoint(p)) { out.x = p.x; out.y = p.y; }
  if (p.dismissed === true) out.dismissed = true;
  return out;
}
function cleanRecords(raw) {
  const out = blank();
  for (const [id, p] of Object.entries(raw?.manual || {})) {
    if (!/^manual:[a-zA-Z0-9-]+$/.test(id) || !validPoint(p)) continue;
    out.manual[id] = { ...cleanPatch(p), id, manual: true, label: typeof p.label === "string" ? p.label : "Untitled call-off", status: safeStatus(p.status), discipline: safeDiscipline(p.discipline), type: safeType(p.type), x:p.x, y:p.y };
  }
  for (const [id, p] of Object.entries(raw?.overrides || {})) {
    if (id.startsWith("auto:")) out.overrides[id] = cleanPatch(p);
  }
  return out;
}
async function fingerprint(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export default function AssetViewer({ context = null }) {
  const prefix = context ? `asset-viewer:${context.scope}:` : "asset-viewer:";
  const host = useRef(null);
  const lastBuffer = useRef(null);
  const activeLoad = useRef(false);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const [panning, setPanning] = useState(false);
  const [dragPreview, setDragPreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [hash, setHash] = useState("");
  const [extracted, setExtracted] = useState([]);
  const [records, setRecords] = useState(blank);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("select");
  const [hidden, setHidden] = useState([]);
  const [discFilter, setDiscFilter] = useState(DISCIPLINES);
  const [zoom, setZoom] = useState(100);
  const [restrict, setRestrict] = useState(true);
  const [regionMode, setRegionMode] = useState("auto");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const key = hash ? prefix + "v2:" + hash : "";
  useEffect(() => {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(records)); setStorageError(""); }
    catch { setStorageError("Could not save call-offs in this browser. Export JSON to retain your work."); }
  }, [key, records]);

  useEffect(() => {
    const cancel = e => {
      if (e.key !== "Escape") return;
      if (dragRef.current) { dragRef.current = null; setDragPreview(null); return; }
      if (mode !== "select") { setMode("select"); return; }
      setSelected(null);
      setLinkTitle(""); setLinkUrl("");
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [mode]);

  async function load(buffer, name, reextracting = false) {
    if (activeLoad.current) return;
    activeLoad.current = true; dragRef.current = null; panRef.current = null; setPanning(false); setDragPreview(null); setBusy(true); setError(""); setMode("select"); setSelected(null);
    try {
      const digest = reextracting ? hash : await fingerprint(buffer);
      const res = await extractFromPdf(buffer.slice(0), { restrictToDrawing: restrict, regionMode });
      if (!host.current) return;
      let saved = records;
      if (!reextracting && digest !== hash) {
        saved = blank();
        try {
          const raw = localStorage.getItem(prefix + "v2:" + digest);
          if (raw) saved = cleanRecords(JSON.parse(raw));
          else {
            // Preserve previous browser notes/status for matching auto labels only.
            const legacy = JSON.parse(localStorage.getItem(prefix + name) || "{}");
            for (const a of res.assets) if (Object.hasOwn(legacy, a.label)) {
              const { x, y, ...patch } = cleanPatch(legacy[a.label]);
              saved.overrides[autoId(a.label)] = patch;
            }
          }
        } catch { setError("Previous browser records could not be read. Check your saved JSON backups."); }
      }
      host.current.replaceChildren(res.canvas);
      lastBuffer.current = { buffer, name };
      setExtracted(res.assets); setRegion(res.region); setFileName(name); setHash(digest); setRecords(saved);
      setHidden([]); setDiscFilter(DISCIPLINES);
      if (!res.hasText) setError("This PDF has no searchable text. You can still add call-off circles manually.");
      else if (!res.assets.length) setError("No automatic candidates found. Use Add call-off to mark assets manually.");
    } catch (e) { setError("Could not read that PDF: " + e.message); }
    finally { activeLoad.current = false; setBusy(false); }
  }

  const onFile = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) { try { await load(await f.arrayBuffer(), f.name); } catch (err) { setError("Could not open PDF: " + err.message); } }
  };
  const reextract = () => lastBuffer.current && load(lastBuffer.current.buffer, lastBuffer.current.name, true);
  const assets = [
    ...extracted.map(a => ({ ...a, id: autoId(a.label), manual: false, discipline: "Unassigned", ...records.overrides[autoId(a.label)] })).filter(a => !a.dismissed),
    ...Object.values(records.manual),
  ];
  const sel = assets.find(a => a.id === selected);
  const visible = assets.filter(a => !hidden.includes(a.status) && discFilter.includes(a.discipline));
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, assets.filter(a => a.status === s).length]));
  const dismissedCount = Object.values(records.overrides).filter(a => a.dismissed).length;

  function update(id, patch) {
    const bucket = id.startsWith("manual:") ? "manual" : "overrides";
    setRecords(r => ({ ...r, [bucket]: { ...r[bucket], [id]: { ...r[bucket][id], ...patch } } }));
  }
  function selectAsset(id) { setSelected(id); setMode("select"); setLinkTitle(""); setLinkUrl(""); }
  function reveal(a) {
    setHidden(h => h.filter(s => s !== a.status));
    setDiscFilter(d => d.includes(a.discipline) ? d : [...d, a.discipline]);
  }
  function planClick(e) {
    if (busy || !fileName) return;
    if (mode === "select") return;
    const rect = host.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const point = { x:(e.clientX-rect.left)/rect.width, y:(e.clientY-rect.top)/rect.height };
    if (!validPoint(point)) return;
    if (mode === "add") {
      const id = "manual:" + crypto.randomUUID();
      const a = { ...point, id, manual: true, label: "Untitled call-off", type: "unclassified", discipline: "Unassigned", status: "REVIEW" };
      setRecords(r => ({ ...r, manual: { ...r.manual, [id]: a } }));
      reveal(a); selectAsset(id);
    }
  }
  // A background drag scrolls the viewer. Marker drags stop propagation.
  function startPan(e) {
    if (busy || !fileName || mode !== "select" || e.button !== 0 || !e.isPrimary ||
        dragRef.current || e.target.closest("button,input,select,textarea,a")) return;
    const v = e.currentTarget;
    // Leave the native scrollbar alone.
    const bounds = v.getBoundingClientRect();
    if (e.clientX >= bounds.left + v.clientWidth || e.clientY >= bounds.top + v.clientHeight) return;
    panRef.current = { id:e.pointerId, x:e.clientX, y:e.clientY, left:v.scrollLeft, top:v.scrollTop, moved:false };
    v.setPointerCapture(e.pointerId);
  }
  function movePan(e) {
    const p = panRef.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx,dy) < 4) return;
    p.moved = true;
    setPanning(true);
    e.currentTarget.scrollLeft = p.left - dx;
    e.currentTarget.scrollTop = p.top - dy;
  }
  function finishPan(e) {
    const p = panRef.current;
    if (!p || p.id !== e.pointerId) return;
    panRef.current = null;
    setPanning(false);
    if (!p.moved && e.type === "pointerup") selectAsset(null);
  }
  // Pointer capture keeps dragging active even outside the circle. Keep the
  // live preview separate from persisted records; commit only on release.
  function startDrag(e, asset) {
    if (busy || mode !== "select" || e.button !== 0 || !e.isPrimary || dragRef.current) return;
    const rect = host.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    e.stopPropagation();
    selectAsset(asset.id);
    dragRef.current = {
      id: asset.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - (rect.left + asset.x * rect.width),
      offsetY: e.clientY - (rect.top + asset.y * rect.height), moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function dragPoint(e, drag) {
    const rect = host.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    const clamp = n => Math.min(1, Math.max(0, n));
    return {
      x: clamp((e.clientX - rect.left - drag.offsetX) / rect.width),
      y: clamp((e.clientY - rect.top - drag.offsetY) / rect.height),
    };
  }

  function moveDrag(e) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 3) return;
    drag.moved = true;
    const point = dragPoint(e, drag);
    if (point) setDragPreview({ id: drag.id, ...point });
  }

  function endDrag(e) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= 3;
    const point = moved ? dragPoint(e, drag) : null;
    dragRef.current = null;
    setDragPreview(null);
    if (point) update(drag.id, point);
  }

  function cancelDrag(e) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragPreview(null);
  }

  function nudge(e, asset) {
    if (busy || mode !== "select" || dragRef.current) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = directions[e.key];
    const rect = host.current?.getBoundingClientRect();
    if (!dir || !rect?.width || !rect.height) return;
    e.preventDefault(); e.stopPropagation();
    const pixels = e.shiftKey ? 10 : 1;
    const clamp = n => Math.min(1, Math.max(0, n));
    selectAsset(asset.id);
    update(asset.id, {
      x: clamp(asset.x + dir[0] * pixels / rect.width),
      y: clamp(asset.y + dir[1] * pixels / rect.height),
    });
  }

  function removeSelected() {
    if (!sel || !window.confirm(sel.manual ? "Delete this manual call-off?" : "Dismiss this extracted candidate? You can restore dismissed candidates.")) return;
    if (sel.manual) setRecords(r => {
      const manual = { ...r.manual }; delete manual[sel.id]; return { ...r, manual };
    });
    else update(sel.id, { dismissed: true });
    selectAsset(null);
  }
  function restoreDismissed() {
    setRecords(r => ({ ...r, overrides: Object.fromEntries(Object.entries(r.overrides).map(([id, p]) => {
      const { dismissed, ...rest } = p; return [id, rest];
    })) }));
  }
  function changeDiscipline(discipline) {
    const type = TYPES[discipline].includes(sel.type) ? sel.type : "unclassified";
    update(sel.id, { discipline, type });
    setDiscFilter(d => d.includes(discipline) ? d : [...d, discipline]);
  }
  function addLink() {
    if (!sel || !linkUrl.trim()) return;
    try {
      const url = new URL(/^https?:\/\//i.test(linkUrl.trim()) ? linkUrl.trim() : "https://" + linkUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw Error();
      update(sel.id, { links: [...(sel.links || []), { title: linkTitle.trim() || url.href, url: url.href }] });
      setLinkTitle(""); setLinkUrl("");
    } catch { setError("Enter a valid web link."); }
  }
  function exportJson() {
    const out = { schema:2, fileName, fingerprint:hash, exported:new Date().toISOString(), records, assets };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type:"application/json" }));
    Object.assign(document.createElement("a"), { href:url, download:`${fileName || "assets"}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importJson(e) {
    const f = e.target.files[0]; e.target.value = "";
    if (!f || busy || !hash) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.schema === 2) {
        if (j.fingerprint !== hash) throw Error("This backup belongs to a different PDF or revision.");
        if (!j.records || typeof j.records !== "object") throw Error("Missing call-off records.");
        if (!window.confirm("Merge this backup with the current drawing's call-offs? Matching IDs will be replaced.")) return;
        const incoming = cleanRecords(j.records);
        setRecords(r => ({ manual:{...r.manual,...incoming.manual}, overrides:{...r.overrides,...incoming.overrides} }));
      } else {
        if (!Array.isArray(j.assets) || j.fileName !== fileName) throw Error("Legacy backup must match the open PDF filename.");
        const overrides = {};
        for (const a of j.assets) if (a && extracted.some(x => x.label === a.label)) {
          const {x,y,label,type,...patch} = cleanPatch(a); overrides[autoId(a.label)] = patch;
        }
        setRecords(r => ({ ...r, overrides:{...r.overrides,...overrides} }));
      }
      setError("");
    } catch (err) { setError("Could not import JSON: " + err.message); }
  }

  return (
    <div className="app">
      <div className="bar">
        {context && <Link className="viewerBack" href={context.backHref}>← Scheme workspace</Link>}
        <h1>{context?.title || "Scheme Plan Asset Viewer"}</h1>
        <label><button disabled={busy} onClick={e => e.currentTarget.nextSibling.click()}>Open PDF…</button>
          <input type="file" accept="application/pdf" onChange={onFile} hidden disabled={busy} /></label>
        <label className="note"><input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} style={{width:"auto"}} /> ignore title block &amp; notes</label>
        {restrict && <label className="note">Layout <select style={{width:"auto"}} value={regionMode} onChange={e => setRegionMode(e.target.value)}>
          <option value="auto">Auto detect</option><option value="standard">Standard</option><option value="wide">Wide plan (left 60%)</option><option value="strip">Long strip plan</option>
        </select></label>}
        {fileName && <>
          <button onClick={reextract} disabled={busy}>Re-extract</button>
          <button className={mode === "add" ? "calloffActive" : ""} aria-pressed={mode === "add"} disabled={busy} onClick={() => setMode(m => m === "add" ? "select" : "add")}>＋ Add call-off</button>
          {mode !== "select" && <button onClick={() => setMode("select")}>Cancel (Esc)</button>}
        </>}
        <span style={{flex:1}} />
        <button onClick={() => setZoom(z => Math.max(50,z-25))}>−</button><span className="note">{zoom}%</span><button onClick={() => setZoom(z => Math.min(1200,z+25))}>+</button>
        <span className="note">PDF and call-offs stay in this browser.</span>
      </div>
      <div className={"viewer" + (fileName && mode === "select" ? " panReady" : "") + (panning ? " panning" : "")} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={finishPan}>
        {!fileName && !busy && <p className="note">Open a PDF drawing you are permitted to use. You can add call-offs even when no automatic assets are detected.</p>}
        {busy && <p className="note">Reading plan…</p>}
        {mode === "add" && <div className="calloffHint" role="status">Click the drawing to place a new call-off circle.</div>}
        <div className={"stage" + (mode !== "select" ? " placing" : "")} style={{width:`${zoom}%`}} onClick={planClick}>
          <div ref={host} />
          {visible.map(a => {
            const moving = dragPreview?.id === a.id;
            const point = moving ? dragPreview : a;
            return (
              <button key={a.id} type="button" title={`${a.label || "Untitled call-off"} · ${STATUS_COLOURS[safeStatus(a.status)].label} · Drag to move`}
                aria-label={`Select or move ${a.label || "Untitled call-off"}`}
                className={"marker" + (a.id === selected ? " sel" : "") + (moving ? " dragging" : "")}
                style={{left:`${point.x*100}%`,top:`${point.y*100}%`,borderColor:colour(safeStatus(a.status)),pointerEvents:mode !== "select" ? "none" : undefined}}
                onPointerDown={e => startDrag(e, a)}
                onPointerMove={moveDrag} onPointerUp={endDrag}
                onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
                onKeyDown={e => nudge(e, a)}
                onClick={e => { e.stopPropagation(); if (e.detail === 0) selectAsset(a.id); }}
                disabled={busy || mode !== "select"} />
            );
          })}
        </div>
      </div>
      <aside className={"side calloffSide" + (sel ? " hasSelection" : "")}>
        {error && <div className="error" role="alert">{error}</div>}
        {storageError && <div className="error" role="alert">{storageError}</div>}
        <h2>{assets.length} call-offs</h2>
        {region && <p className="note">{region} · {assets.filter(a => a.manual).length} manual · {assets.filter(a => !a.manual).length} extracted. Verify all candidate labels and statuses.</p>}
        <div className="chips">
          {STATUS_ORDER.map(s => <button key={s} className={"chip" + (hidden.includes(s) ? " off" : "")} aria-pressed={!hidden.includes(s)} onClick={() => setHidden(h => h.includes(s) ? h.filter(x => x !== s) : [...h,s])}><span className="dot" style={{background:colour(s)}} />{STATUS_COLOURS[s].label} ({counts[s]})</button>)}
        </div>
        <section className="disciplineFilters" aria-label="Discipline filters">
          <div className="disciplineHeading"><strong>Disciplines ({visible.length} visible)</strong><button type="button" onClick={() => setDiscFilter(d => d.length === DISCIPLINES.length ? [] : DISCIPLINES)}>{discFilter.length === DISCIPLINES.length ? "Hide all" : "Show all"}</button></div>
          <div className="disciplineGrid">{DISCIPLINES.map(d => <label key={d}><input type="checkbox" checked={discFilter.includes(d)} onChange={e => setDiscFilter(old => e.target.checked ? [...new Set([...old,d])] : old.filter(x => x !== d))} />{d}</label>)}</div>
        </section>
        <div className="list" aria-label="Call-off list">
          {[...visible].sort((a,b) => a.label.localeCompare(b.label)).map(a => <button type="button" key={a.id} className={"row" + (a.id === selected ? " sel" : "")} onClick={() => selectAsset(a.id)} disabled={busy}><span className="dot" style={{background:colour(safeStatus(a.status))}} />{a.label || "Untitled call-off"}<small>{typeLabel(a.type)} · {a.manual ? "manual" : "auto"}</small></button>)}
        </div>
        {!!dismissedCount && <button disabled={busy} onClick={restoreDismissed}>Restore dismissed candidates ({dismissedCount})</button>}
        {sel ? (
          <section className="calloffPane" aria-label="Selected call-off">
            <div className="calloffPaneHeader"><strong>{sel.manual ? "Manual call-off" : "Extracted candidate"}</strong><button type="button" onClick={() => selectAsset(null)} aria-label="Close call-off editor">Done ×</button></div>
            <div className="calloffEditorScroll">
          <fieldset className="calloffEditor" disabled={busy}>
            <legend className="srOnly">Call-off details</legend>
            <label className="field">Asset reference / name<input value={sel.label} placeholder="e.g. whistle board WB01" onChange={e => update(sel.id,{label:e.target.value})} /></label>
            <label className="field">Discipline<select value={sel.discipline} onChange={e => changeDiscipline(e.target.value)}>{DISCIPLINES.map(d => <option key={d}>{d}</option>)}</select></label>
            <label className="field">Asset type<select value={sel.type} onChange={e => update(sel.id,{type:e.target.value})}>{[...new Set(["unclassified", ...TYPES[sel.discipline], sel.type])].map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
            <label className="field">Asset status<select value={safeStatus(sel.status)} onChange={e => { const status=e.target.value; update(sel.id,{status}); setHidden(h => h.filter(s => s !== status)); }}>{STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_COLOURS[s].label}</option>)}</select></label>
            <p className="note calloffDragHelp">Drag the circle on the drawing. For fine adjustment, focus the circle and use the arrow keys (Shift for larger steps).</p>
            <div className="chips"><button type="button" onClick={removeSelected}>{sel.manual ? "Delete call-off" : "Dismiss candidate"}</button></div>
            <label className="field">Owner<input value={sel.owner || ""} onChange={e => update(sel.id,{owner:e.target.value})} /></label>
            <label className="field">Notes, decisions, minutes<textarea rows={4} value={sel.notes || ""} onChange={e => update(sel.id,{notes:e.target.value})} /></label>
            <div className="field">Links to drawings and documents
              {(sel.links || []).map((l,i) => <div className="linkrow" key={i}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a><button type="button" onClick={() => update(sel.id,{links:sel.links.filter((_,j)=>j!==i)})}>✕</button></div>)}
              <input placeholder="Document title" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} /><input placeholder="https://…" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /><button type="button" onClick={addLink}>Add link</button>
            </div>
          </fieldset>
            </div>
          </section>
        ) : fileName && <p className="note">Select a circle or choose Add call-off to place one. Drag circles directly to reposition them.</p>}
        {fileName && <div className="chips" style={{marginTop:"auto"}}><button disabled={busy} onClick={exportJson}>Export JSON</button><label><button disabled={busy} onClick={e => e.currentTarget.nextSibling.click()}>Import JSON</button><input type="file" accept="application/json" onChange={importJson} hidden disabled={busy} /></label></div>}
      </aside>
    </div>
  );
}
