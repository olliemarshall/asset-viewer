"use client";
import Link from "next/link";
import SymbolFinder from "./SymbolFinder";
import CalloffMasterLink from "./CalloffMasterLink";
import AssetHighlight,{validRegion,centeredRegion} from "./AssetHighlight";
import { useEffect, useRef, useState } from "react";
import { extractFromPdf, STATUS_COLOURS, STATUS_ORDER } from "../lib/extract";

const DISCIPLINES = ["Unassigned", "Signalling", "Track", "E&P", "Civils", "Telecoms", "Other"];
const TYPES = {
  Unassigned: ["unclassified"],
  Signalling: ["signal", "points", "track_circuit", "location_case", "wheel_sensor", "track_equipment", "whistle_board", "speed_board", "level_crossing_equipment", "treadle", "axle_counter", "sawd_detector", "sawd_annunciator", "aws", "tpws", "notice_board", "pole", "telephone", "cable", "other"],
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
  if (validRegion(p.highlight)) out.highlight = {left:p.highlight.left,top:p.highlight.top,right:p.highlight.right,bottom:p.highlight.bottom};
  if(p.highlight===null)out.highlight=null;
  if (p.source === "symbol") out.source = "symbol";
  if (typeof p.symbolRef === "string") out.symbolRef = p.symbolRef;
  if (Number.isFinite(p.similarity) && p.similarity >= 0 && p.similarity <= 1) out.similarity = p.similarity;
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

function SidebarSection({title,open,onToggle,children,action,className=""}) {
  return <section className={"sidebarSection "+className}>
    <div className="sidebarSectionHeader">
      <button type="button" className="sidebarSectionToggle" aria-expanded={open} onClick={onToggle}>
        <span className={"sidebarChevron"+(open?" expanded":"")} aria-hidden="true">›</span><span>{title}</span>
      </button>
      {action}
    </div>
    {open&&<div className="sidebarSectionBody">{children}</div>}
  </section>;
}

function cleanExtracted(raw) {
  const byLabel=new Map();
  for(const item of Array.isArray(raw)?raw:[]){
    if(!validPoint(item)||typeof item.label!=="string"||!item.label.trim())continue;
    byLabel.set(item.label,{label:item.label,type:safeType(item.type),status:safeStatus(item.status),x:item.x,y:item.y});
  }
  return [...byLabel.values()];
}

export default function AssetViewer({ context = null, initialPdf = null, onScratchChange = null, sharedStore = null }) {
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
  const [savedVersion,setSavedVersion]=useState(sharedStore?.snapshot?.version||0);
  const [baseline,setBaseline]=useState(null);
  const [saving,setSaving]=useState(false);
  const saveLock=useRef(false);
  const [saveMessage,setSaveMessage]=useState("");
  const [saveError,setSaveError]=useState("");
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [displayMode,setDisplayMode]=useState("glow");
  const [highlightStart,setHighlightStart]=useState(null);
  const [highlightPreview,setHighlightPreview]=useState(null);
  const [renderedCanvas,setRenderedCanvas]=useState(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [assetSearch,setAssetSearch]=useState("");
  const canEdit=!context?.shared||!!sharedStore?.canEdit;
  const [selected, setSelected] = useState(null);
  const [sections,setSections]=useState({suggestions:true,status:false,disciplines:false,assets:true,editor:true,classification:true,notes:false,links:false});
  const toggleSection=key=>setSections(old=>({...old,[key]:!old[key]}));
  const openSection=key=>setSections(old=>old[key]?old:{...old,[key]:true});
  const [mode, setMode] = useState("select");
  const [hidden, setHidden] = useState([]);
  const [discFilter, setDiscFilter] = useState(DISCIPLINES);
  const [zoom, setZoom] = useState(100);
  const [restrict, setRestrict] = useState(true);
  const [regionMode, setRegionMode] = useState("auto");
  const [region, setRegion] = useState("");
  const [regionBounds,setRegionBounds]=useState(null);
  const [symbolOpen,setSymbolOpen]=useState(false);
  const [symbolMatches,setSymbolMatches]=useState([]);
  const [symbolNotice,setSymbolNotice]=useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const key = hash ? prefix + "v2:" + hash : "";
  const payload={records,extracted};
  const serialized=JSON.stringify(payload);
  const hasScratchChanges=sharedStore?baseline!==null&&serialized!==baseline:!!(Object.keys(records.manual).length||Object.keys(records.overrides).length);
  async function saveShared(){
    if(!sharedStore||!canEdit||!fileName||busy||dragRef.current||saveLock.current||baseline===null)return;
    saveLock.current=true;setSaving(true);setSaveError("");setSaveMessage("");
    try {
      const table=sharedStore.db.from("drawing_calloff_sets");
      const result=savedVersion
        ?await table.update({payload,version:savedVersion+1}).eq("drawing_id",sharedStore.drawingId).eq("version",savedVersion).select("version,updated_at").maybeSingle()
        :await table.insert({drawing_id:sharedStore.drawingId,payload}).select("version,updated_at").single();
      if(result.error){
        if(result.error.code==="23505")throw Error("Another engineer has saved this drawing. Your changes have not been written. Reopen the drawing to load the latest version.");
        throw result.error;
      }
      if(!result.data)throw Error("The saved version changed or your edit access was revoked. Your changes have not been written. Reopen to load the latest version.");
      setSavedVersion(result.data.version);setBaseline(serialized);setSaveMessage("Saved shared draft · v"+result.data.version);
    }catch(e){setSaveError(e.message||"Could not save the call-offs.");}
    finally{saveLock.current=false;setSaving(false);}
  }
  useEffect(()=>{
    if(context?.shared)onScratchChange?.(hasScratchChanges||saving);
  },[context?.shared,onScratchChange,hasScratchChanges,saving]);
  useEffect(()=>{
    if(!context?.shared||(!hasScratchChanges&&!saving))return;
    const warn=e=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[context?.shared,hasScratchChanges,saving]);
  useEffect(() => {
    if (!key || context?.shared) return;
    try { localStorage.setItem(key, JSON.stringify(records)); setStorageError(""); }
    catch { setStorageError("Could not save call-offs in this browser. Export JSON to retain your work."); }
  }, [key, records]);

  useEffect(() => {
    const cancel = e => {
      if (e.key !== "Escape") return;
      if (dragRef.current) { dragRef.current = null; setDragPreview(null); return; }
      if (mode !== "select") { setMode("select");setHighlightStart(null);setHighlightPreview(null); return; }
      setSelected(null);
      setLinkTitle(""); setLinkUrl("");
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [mode]);

  async function load(buffer, name, reextracting = false) {
    if (activeLoad.current) return;
    activeLoad.current = true; setHighlightStart(null);setHighlightPreview(null);setSymbolMatches([]);setSymbolNotice("");setSymbolOpen(false);dragRef.current = null; panRef.current = null; setPanning(false); setDragPreview(null); setBusy(true); setError(""); setMode("select"); setSelected(null);
    try {
      const digest = reextracting ? hash : await fingerprint(buffer);
      const res = await extractFromPdf(buffer.slice(0), { restrictToDrawing: restrict, regionMode });
      if (!host.current) return;
      let saved = records;
      if (!reextracting && digest !== hash) {
        saved = blank();
        try {
          const raw = context?.shared ? null : localStorage.getItem(prefix + "v2:" + digest);
          if (raw) saved = cleanRecords(JSON.parse(raw));
          else if (!context?.shared) {
            // Preserve previous browser notes/status for matching auto labels only.
            const legacy = JSON.parse(localStorage.getItem(prefix + name) || "{}");
            for (const a of res.assets) if (Object.hasOwn(legacy, a.label)) {
              const { x, y, ...patch } = cleanPatch(legacy[a.label]);
              saved.overrides[autoId(a.label)] = patch;
            }
          }
        } catch { setError("Previous browser records could not be read. Check your saved JSON backups."); }
      }
      let candidates=cleanExtracted(res.assets);
      if(sharedStore&&!reextracting){
        if(sharedStore.snapshot){
          const stored=sharedStore.snapshot.payload;
          if(!stored||!Array.isArray(stored.extracted)||!stored.records)throw Error("Saved call-off data is invalid. Contact an administrator.");
          saved=cleanRecords(stored.records);candidates=cleanExtracted(stored.extracted);
        }
        setBaseline(JSON.stringify({records:saved,extracted:candidates}));
      }else if(sharedStore&&reextracting){
        // Preserve saved candidates and positions, and append only newly detected labels.
        const combined=new Map(extracted.map(a=>[a.label,a]));
        for(const a of candidates)if(!combined.has(a.label))combined.set(a.label,a);
        candidates=[...combined.values()];
      }
      host.current.replaceChildren(res.canvas);setRenderedCanvas(res.canvas);
      lastBuffer.current = { buffer, name };
      setExtracted(candidates); setRegion(res.region);setRegionBounds(res.regionBounds); setFileName(name); setHash(digest); setRecords(saved);
      if(!reextracting&&sharedStore?.initialCalloffId)setSelected(sharedStore.initialCalloffId);
      setHidden([]); setDiscFilter(DISCIPLINES);
      if (!res.hasText) setError("This PDF has no searchable text. You can still add call-off circles manually.");
      else if (!res.assets.length) setError("No automatic candidates found. Use Add call-off to mark assets manually.");
    } catch (e) { setError("Could not read that PDF: " + e.message); }
    finally { activeLoad.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (initialPdf) load(initialPdf.buffer, initialPdf.name);
  }, [initialPdf?.buffer, initialPdf?.name]);

  const onFile = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) { try { await load(await f.arrayBuffer(), f.name); } catch (err) { setError("Could not open PDF: " + err.message); } }
  };
  const reextract = () => canEdit&&!saving&&lastBuffer.current && load(lastBuffer.current.buffer, lastBuffer.current.name, true);
  const assets = [
    ...extracted.map(a => ({ ...a, id: autoId(a.label), manual: false, discipline: "Unassigned", ...records.overrides[autoId(a.label)] })).filter(a => !a.dismissed),
    ...Object.values(records.manual),
  ];
  const sel = assets.find(a => a.id === selected);
  const visible = assets.filter(a => !hidden.includes(a.status) && discFilter.includes(a.discipline));
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, assets.filter(a => a.status === s).length]));
  const dismissedCount = Object.values(records.overrides).filter(a => a.dismissed).length;

  function update(id, patch) {
    if(!canEdit||saving)return;
    // Moving a call-off does not move the underlying PDF ink. Rebind its shape.
    if(validPoint(patch)&&!Object.hasOwn(patch,"highlight"))patch={...patch,highlight:null};
    const bucket = id.startsWith("manual:") ? "manual" : "overrides";
    setRecords(r => ({ ...r, [bucket]: { ...r[bucket], [id]: { ...r[bucket][id], ...patch } } }));
  }
  function selectAsset(id) { setSelected(id); if(id){openSection("editor");setSidebarOpen(true);}setHighlightStart(null);setHighlightPreview(null); setMode("select"); setLinkTitle(""); setLinkUrl(""); }
  function reveal(a) {
    setHidden(h => h.filter(s => s !== a.status));
    setDiscFilter(d => d.includes(a.discipline) ? d : [...d, a.discipline]);
  }
  function planClick(e) {
    if (busy || saving || !canEdit || !fileName) return;
    if (mode === "select") return;
    const rect = host.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const point = { x:(e.clientX-rect.left)/rect.width, y:(e.clientY-rect.top)/rect.height };
    if (!validPoint(point)) return;
    if (mode === "highlight" && sel) {
      if(!highlightStart){setHighlightStart(point);return;}
      const b={left:Math.min(point.x,highlightStart.x),top:Math.min(point.y,highlightStart.y),right:Math.max(point.x,highlightStart.x),bottom:Math.max(point.y,highlightStart.y)};
      if(!validRegion(b))return;
      update(sel.id,{x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,highlight:b});setHighlightStart(null);setHighlightPreview(null);setMode("select");setDisplayMode("glow");return;
    }
    if (mode === "add") {
      const id = "manual:" + crypto.randomUUID();
      const a = { ...point, id, manual: true, label: "Untitled call-off", type: "unclassified", discipline: "Unassigned", status: "REVIEW" };
      setRecords(r => ({ ...r, manual: { ...r.manual, [id]: a } }));
      reveal(a); selectAsset(id);
    }
  }
  function previewHighlight(e){
    if(mode!=="highlight"||!highlightStart)return;
    const r=host.current?.getBoundingClientRect();if(!r?.width||!r.height)return;
    const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
    setHighlightPreview({left:Math.min(x,highlightStart.x),top:Math.min(y,highlightStart.y),right:Math.max(x,highlightStart.x),bottom:Math.max(y,highlightStart.y)});
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
    if(!canEdit||saving)return;
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
    if (busy || saving || !canEdit || mode !== "select" || dragRef.current) return;
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

  function receiveSymbols(result) {
    openSection("suggestions");
    const matches=result.matches.map(m=>({...m,id:"suggestion:"+crypto.randomUUID(),type:result.type,symbolRef:result.ref}));
    setSymbolMatches(matches);
    setSymbolNotice(matches.length
      ? matches.length+" graphical candidates"+(result.truncated?" (search capped at 150)":"")+". Click a dashed circle to add it for review."
      : "No graphical candidates at these settings. Try a tighter crop or a different size range.");
    setSymbolOpen(false);
    setMode("select");
  }
  function acceptSymbols(matches) {
    if(!canEdit||saving||!matches.length)return;
    const additions={};
    for(const m of matches){
      const id="manual:"+crypto.randomUUID();
      additions[id]={id,manual:true,source:"symbol",label:"Unlabelled "+typeLabel(m.type),type:safeType(m.type),
        discipline:"Signalling",status:"REVIEW",x:m.x,y:m.y,symbolRef:m.symbolRef,similarity:m.score,highlight:centeredRegion(m.x,m.y,m.width,m.height)};
    }
    setRecords(r=>({...r,manual:{...r.manual,...additions}}));
    const accepted=new Set(matches.map(m=>m.id));
    setSymbolMatches(old=>old.filter(m=>!accepted.has(m.id)));
    reveal({status:"REVIEW",discipline:"Signalling"});
    selectAsset(Object.keys(additions)[0]);
    setSymbolNotice("Added "+matches.length+" graphical candidate"+(matches.length===1?"":"s")+" for engineer review.");
  }
  function removeSelected() {
    if (!canEdit || saving || !sel || !window.confirm(sel.manual ? "Delete this manual call-off?" : "Dismiss this extracted candidate? You can restore dismissed candidates.")) return;
    if (sel.manual) setRecords(r => {
      const manual = { ...r.manual }; delete manual[sel.id]; return { ...r, manual };
    });
    else update(sel.id, { dismissed: true });
    selectAsset(null);
  }
  function restoreDismissed() {
    if(!canEdit||saving)return;
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
    if (!canEdit || saving || !sel || !linkUrl.trim()) return;
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
    <div className={"app swViewer"+(sidebarOpen?"":" sidebarClosed")}>
      <div className="bar swViewerToolbar">
        {context?.backHref && <Link className="viewerBack" href={context.backHref}>← Scheme workspace</Link>}
        <h1>{context?.title || "Scheme Plan Asset Viewer"}</h1>
        {!context?.shared && <label><button disabled={busy} onClick={e => e.currentTarget.nextSibling.click()}>Open PDF…</button>
          <input type="file" accept="application/pdf" onChange={onFile} hidden disabled={busy} /></label>}
        {canEdit&&<button aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(v=>!v)} disabled={busy||saving}>Extraction settings</button>}
        {canEdit&&settingsOpen&&<div className="viewerSettings">
        <label className="note"><input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} style={{width:"auto"}} /> ignore title block &amp; notes</label>
        {restrict && <label className="note">Layout <select style={{width:"auto"}} value={regionMode} onChange={e => setRegionMode(e.target.value)}>
          <option value="auto">Auto detect</option><option value="standard">Standard</option><option value="wide">Wide plan (left 60%)</option><option value="strip">Long strip plan</option>
        </select></label>}</div>}
        {fileName && canEdit && <>
          <button onClick={reextract} disabled={busy||saving}>Re-extract</button>
          <button disabled={busy||saving} onClick={()=>{setMode("select");setSymbolOpen(true);}}>Find symbols (beta)</button>
          <button className={mode === "add" ? "calloffActive" : ""} aria-pressed={mode === "add"} disabled={busy||saving} onClick={() => {setDisplayMode("circles");setHighlightStart(null);setHighlightPreview(null);setMode(m => m === "add" ? "select" : "add");}}>＋ Add call-off</button>
          {mode !== "select" && <button onClick={() => {setMode("select");setHighlightStart(null);setHighlightPreview(null);}}>Cancel (Esc)</button>}
        </>}
        <span style={{flex:1}} />
        <button onClick={() => setZoom(z => Math.max(50,z-25))}>−</button><span className="note">{zoom}%</span><button onClick={() => setZoom(z => Math.min(1200,z+25))}>+</button>
        <button onClick={()=>setZoom(100)} title="Fit drawing width">Fit width</button>
        <label className="viewerDisplay">Display <select aria-label="Drawing display mode" value={displayMode} onChange={e=>{setMode("select");setHighlightStart(null);setHighlightPreview(null);setDisplayMode(e.target.value);}}><option value="glow">Asset highlights</option><option value="circles">Call-off circles</option><option value="original">Original PDF</option></select></label>
        <button aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(v=>!v)}>{sidebarOpen?"Hide sidebar":"Show sidebar"}</button>
        {sharedStore&&<div className="viewerSaveGroup">
          <span role="status" className="note">{saving?"Saving…":hasScratchChanges?"Unsaved changes":savedVersion?"Shared draft · v"+savedVersion:"Not saved yet"}{!canEdit?" · Read only":""}</span>
          {canEdit&&<button className="swPrimary" disabled={busy||saving||!fileName||baseline===null||(!hasScratchChanges&&!!savedVersion)} onClick={saveShared}>{saving?"Saving…":"Save call-offs"}</button>}
        </div>}
        {!context?.shared&&<span className="note">Local prototype</span>}
        {saveError&&<div className="viewerSaveError error" role="alert">{saveError}</div>}
      </div>
      <div className={"viewer" + (fileName && mode === "select" ? " panReady" : "") + (panning ? " panning" : "")} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={finishPan}>
        {!fileName && !busy && <p className="note">{context?.shared ? "Opening stored PDF… If loading fails, close the viewer and reopen the drawing." : "Open a PDF drawing you are permitted to use. You can add call-offs even when no automatic assets are detected."}</p>}
        {busy && <p className="note">Reading plan…</p>}
        {mode === "add" && <div className="calloffHint" role="status">Click the drawing to place a new call-off circle.</div>}
        {mode==="highlight"&&<div className="calloffHint" role="status">{highlightStart?"Click the opposite corner of the equipment.":"Click the first corner of a tight rectangle around the equipment."}</div>}
        <div className={"stage" + (mode !== "select" ? " placing" : "")} style={{width:`${zoom}%`}} onClick={planClick} onPointerMove={previewHighlight}>
          <div ref={host} />
          {highlightPreview&&mode==="highlight"&&<div className="assetRegionPreview" style={{left:highlightPreview.left*100+"%",top:highlightPreview.top*100+"%",width:(highlightPreview.right-highlightPreview.left)*100+"%",height:(highlightPreview.bottom-highlightPreview.top)*100+"%"}}/>}
          {displayMode==="glow"&&mode==="select"&&visible.filter(a=>validRegion(a.highlight)).map(a=><AssetHighlight key={a.id} canvas={renderedCanvas} region={a.highlight} label={a.label||"Untitled call-off"} selected={a.id===selected} disabled={busy||saving} onSelect={()=>selectAsset(a.id)}/>)}
          {displayMode!=="original"&&visible.filter(a=>displayMode==="circles"||!validRegion(a.highlight)).map(a => {
            const moving = dragPreview?.id === a.id;
            const point = moving ? dragPreview : a;
            return (
              <button key={a.id} type="button" title={`${a.label || "Untitled call-off"} · ${STATUS_COLOURS[safeStatus(a.status)].label} ${canEdit?" · Drag to move":""}`}
                aria-label={`Select or move ${a.label || "Untitled call-off"}`}
                className={"marker" + (a.id === selected ? " sel" : "") + (moving ? " dragging" : "")}
                style={{left:`${point.x*100}%`,top:`${point.y*100}%`,borderColor:colour(safeStatus(a.status)),pointerEvents:mode !== "select" ? "none" : undefined}}
                onPointerDown={e => startDrag(e, a)}
                onPointerMove={moveDrag} onPointerUp={endDrag}
                onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
                onKeyDown={e => nudge(e, a)}
                onClick={e => { e.stopPropagation(); if (e.detail === 0) selectAsset(a.id); }}
                disabled={busy || saving || mode !== "select"} />
            );
          })}
          {displayMode!=="original"&&mode==="select"&&symbolMatches.map(m=><button type="button" key={m.id} className="marker symbolCandidate" title={`${typeLabel(m.type)} • shape score ${Math.round(m.score*100)}% • click to add for review`}
            aria-label={`Add suggested ${typeLabel(m.type)} for review`} style={{left:m.x*100+"%",top:m.y*100+"%"}}
            onClick={e=>{e.stopPropagation();acceptSymbols([m]);}}/>)}
        </div>
      </div>
      <aside hidden={!sidebarOpen} className={"side calloffSide" + (sel ? " hasSelection" : "")}>
        {error && <div className="error" role="alert">{error}</div>}
        {storageError && <div className="error" role="alert">{storageError}</div>}
        <div className="viewerSidebarTitle"><div><h2>Call-offs <span>{assets.length}</span></h2><p className="note">{sharedStore?"Shared draft · engineering verification required":"Local drawing register"}</p></div></div>
        {saveMessage&&!hasScratchChanges&&<p className="note" role="status">{saveMessage}</p>}
        {sharedStore?.initialCalloffId&&fileName&&!busy&&!assets.some(a=>a.id===sharedStore.initialCalloffId)&&<p className="note">The linked call-off is missing from this saved drawing draft. Inspect the master asset association.</p>}
        {sharedStore&&!savedVersion&&<p className="note">Automatic candidates are not saved until an editor saves the call-off draft.</p>}
        {symbolNotice&&<SidebarSection title={`Graphical review${symbolMatches.length?" ("+symbolMatches.length+")":""}`} open={sections.suggestions} onToggle={()=>toggleSection("suggestions")}><div className="symbolNotice"><p>{symbolNotice}</p>
          {!!symbolMatches.length&&<><p className="note">Dashed circles are temporary suggestions. Check for duplicates or non-equipment graphics.</p><div className="chips"><button onClick={()=>{if(window.confirm("Add all "+symbolMatches.length+" suggestions as unverified call-offs? Check them for duplicates and false matches."))acceptSymbols(symbolMatches);}}>Add all for review</button><button onClick={()=>{setSymbolMatches([]);setSymbolNotice("");}}>Clear suggestions</button></div></>}
          {!symbolMatches.length&&<button onClick={()=>setSymbolNotice("")}>Dismiss</button>}
        </div></SidebarSection>}
        {region && <p className="note">{region} · {assets.filter(a => a.manual).length} manual · {assets.filter(a => !a.manual).length} extracted. Verify all candidate labels and statuses.</p>}
        <SidebarSection title="Asset status filters" open={sections.status} onToggle={()=>toggleSection("status")}><div className="chips">
          {STATUS_ORDER.map(s => <button key={s} className={"chip" + (hidden.includes(s) ? " off" : "")} aria-pressed={!hidden.includes(s)} onClick={() => setHidden(h => h.includes(s) ? h.filter(x => x !== s) : [...h,s])}><span className="dot" style={{background:colour(s)}} />{STATUS_COLOURS[s].label} ({counts[s]})</button>)}
        </div></SidebarSection>
        <SidebarSection title={`Disciplines (${discFilter.length}/${DISCIPLINES.length})`} open={sections.disciplines} onToggle={()=>toggleSection("disciplines")}
          action={<button type="button" onClick={() => setDiscFilter(d => d.length === DISCIPLINES.length ? [] : DISCIPLINES)}>{discFilter.length === DISCIPLINES.length ? "Hide all" : "Show all"}</button>}>
          <div className="disciplineGrid">{DISCIPLINES.map(d => <label key={d}><input type="checkbox" checked={discFilter.includes(d)} onChange={e => setDiscFilter(old => e.target.checked ? [...new Set([...old,d])] : old.filter(x => x !== d))} />{d}</label>)}</div>
        </SidebarSection>
        <SidebarSection title={`Individual assets (${visible.length})`} open={sections.assets} onToggle={()=>toggleSection("assets")}><input className="assetSearch" aria-label="Search visible assets" placeholder="Find an asset…" value={assetSearch} onChange={e=>setAssetSearch(e.target.value)}/><div className="list" aria-label="Call-off list">
          {[...visible].filter(a=>[a.label,typeLabel(a.type),a.discipline].some(v=>String(v||"").toLowerCase().includes(assetSearch.trim().toLowerCase()))).sort((a,b) => a.label.localeCompare(b.label)).map(a => <button type="button" key={a.id} className={"row" + (a.id === selected ? " sel" : "")} onClick={() => selectAsset(a.id)} disabled={busy}><span className="dot" style={{background:colour(safeStatus(a.status))}} />{a.label || "Untitled call-off"}<small>{typeLabel(a.type)} · {a.source==="symbol"?"symbol":a.manual ? "manual" : "auto"}</small></button>)}
        </div>
        {canEdit && !!dismissedCount && <button disabled={busy||saving} onClick={restoreDismissed}>Restore dismissed candidates ({dismissedCount})</button>}
        </SidebarSection>
        {sel ? (
          <SidebarSection className="selectedAssetSection" title={`Review · ${sel.label||"Untitled call-off"}`} open={sections.editor} onToggle={()=>toggleSection("editor")}
            action={<button type="button" onClick={() => selectAsset(null)} aria-label="Close call-off editor">Done ×</button>}>
            <div className="calloffEditorScroll">
          <fieldset className="calloffEditor" disabled={busy||saving}>
            <legend className="srOnly">Call-off details</legend>
            <span className="note">{sel.source==="symbol"?"Graphical candidate":sel.manual?"Manual call-off":"Extracted candidate"}</span>
            <SidebarSection title="Asset classification" open={sections.classification} onToggle={()=>toggleSection("classification")}>
            {sel.source==="symbol"&&<p className="note">Graphical match{sel.symbolRef?" · "+sel.symbolRef:""}{Number.isFinite(sel.similarity)?" · shape score "+Math.round(sel.similarity*100)+"%":""}. This score is not a probability. Verify the equipment, name and status.</p>}
            <label className="field">Asset reference / name<input readOnly={!canEdit} value={sel.label} placeholder="e.g. whistle board WB01" onChange={e => update(sel.id,{label:e.target.value})} /></label>
            <label className="field">Discipline<select disabled={!canEdit} value={sel.discipline} onChange={e => changeDiscipline(e.target.value)}>{DISCIPLINES.map(d => <option key={d}>{d}</option>)}</select></label>
            <label className="field">Asset type<select disabled={!canEdit} value={sel.type} onChange={e => update(sel.id,{type:e.target.value})}>{[...new Set(["unclassified", ...TYPES[sel.discipline], sel.type])].map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
            <label className="field">Asset status<select disabled={!canEdit} value={safeStatus(sel.status)} onChange={e => { const status=e.target.value; update(sel.id,{status}); setHidden(h => h.filter(s => s !== status)); }}>{STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_COLOURS[s].label}</option>)}</select></label>
            </SidebarSection>
            <p className="note">Blue glow is a graphical selection aid, not engineering or asset status.</p><p className="note">{validRegion(sel.highlight)?"Graphical region attached. Check that it contains only the intended asset.":"No graphical region attached; shown as a circle."}</p>
            {canEdit&&<div className="chips"><button type="button" onClick={()=>{setDisplayMode("glow");setHighlightStart(null);setHighlightPreview(null);setMode("highlight");}}> {validRegion(sel.highlight)?"Redefine highlight":"Define asset highlight"}</button>{validRegion(sel.highlight)&&<button type="button" onClick={()=>update(sel.id,{highlight:null})}>Clear highlight</button>}</div>}
            {canEdit&&<p className="note calloffDragHelp">Switch to circles to reposition markers. Moving a marker clears its graphical region.</p>}
            <div className="chips"><button type="button" disabled={!canEdit} onClick={removeSelected}>{sel.manual ? "Delete call-off" : "Dismiss candidate"}</button></div>
            <SidebarSection title="Owner and notes" open={sections.notes} onToggle={()=>toggleSection("notes")}>
            <label className="field">Owner<input readOnly={!canEdit} value={sel.owner || ""} onChange={e => update(sel.id,{owner:e.target.value})} /></label>
            <label className="field">Notes, decisions, minutes<textarea readOnly={!canEdit} rows={4} value={sel.notes || ""} onChange={e => update(sel.id,{notes:e.target.value})} /></label>
            </SidebarSection>
            <SidebarSection title={`Linked documents (${(sel.links||[]).length})`} open={sections.links} onToggle={()=>toggleSection("links")}>
            <div className="field">Links to drawings and documents
              {(sel.links || []).map((l,i) => <div className="linkrow" key={i}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a><button type="button" disabled={!canEdit} onClick={() => update(sel.id,{links:sel.links.filter((_,j)=>j!==i)})}>✕</button></div>)}
              <input disabled={!canEdit} placeholder="Document title" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} /><input disabled={!canEdit} placeholder="https://…" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /><button type="button" disabled={!canEdit} onClick={addLink}>Add link</button>
            </div>
            </SidebarSection>
          </fieldset>
          {sharedStore&&<CalloffMasterLink key={sel.id} store={{...sharedStore,onOpenAsset:sharedStore.onOpenAsset?asset=>{if(!saving&&(!hasScratchChanges||window.confirm("Discard unsaved drawing call-off changes and open the master asset?")))sharedStore.onOpenAsset(asset);}:undefined,onOpenRecord:sharedStore.onOpenRecord?record=>{if(!saving&&(!hasScratchChanges||window.confirm("Discard unsaved drawing call-off changes and open the engineering record?")))sharedStore.onOpenRecord(record);}:undefined}} calloff={sel} version={savedVersion} dirty={hasScratchChanges} disabled={busy||saving}/>}
            </div>
          </SidebarSection>
        ) : fileName && <p className="note">{canEdit?"Select a circle or choose Add call-off to place one.":"Select a circle to inspect its details."}</p>}
        {fileName && !context?.shared && <div className="chips" style={{marginTop:"auto"}}><button disabled={busy} onClick={exportJson}>Export JSON</button><label><button disabled={busy} onClick={e => e.currentTarget.nextSibling.click()}>Import JSON</button><input type="file" accept="application/json" onChange={importJson} hidden disabled={busy} /></label></div>}
      </aside>
      {symbolOpen&&<SymbolFinder targetCanvas={host.current?.querySelector("canvas")} region={regionBounds||undefined} onClose={()=>setSymbolOpen(false)} onMatches={receiveSymbols}/>}
    </div>
  );
}
