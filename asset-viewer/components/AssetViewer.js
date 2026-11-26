"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { extractFromPdf, STATUS_COLOURS, STATUS_ORDER } from "../lib/extract";

const colour = (s) => `rgb(${STATUS_COLOURS[s].rgb.join(",")})`;


export default function AssetViewer({ context = null }) {
  const storeKey = (name) => context ? `asset-viewer:${context.scope}:${name}` : `asset-viewer:${name}`;
  const host = useRef(null);
  const [fileName, setFileName] = useState("");
  const [assets, setAssets] = useState([]);
  const [data, setData] = useState({}); // per-asset notes, links, owner, status override
  const [selected, setSelected] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [zoom, setZoom] = useState(100);
  const [restrict, setRestrict] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const lastBuffer = useRef(null);

  // Save notes in this browser only
  useEffect(() => {
    if (fileName) localStorage.setItem(storeKey(fileName), JSON.stringify(data));
  }, [data, fileName]);

  async function load(buffer, name) {
    setBusy(true); setError(""); setSelected(null);
    try {
      lastBuffer.current = { buffer, name };
      const res = await extractFromPdf(buffer.slice(0), { restrictToDrawing: restrict });
      host.current.replaceChildren(res.canvas);
      setAssets(res.assets);
      setFileName(name);
      setData(JSON.parse(localStorage.getItem(storeKey(name)) || "{}"));
      if (!res.hasText) setError("This PDF has no text layer (probably a scan). Text extraction can't find assets here; it would need OCR or a vision model.");
      else if (!res.assets.length) setError("No assets matched. Check the label patterns in lib/extract.js.");
    } catch (e) {
      setError("Could not read that PDF: " + e.message);
    }
    setBusy(false);
  }

  const onFile = async (e) => {
    const f = e.target.files[0];
    if (f) load(await f.arrayBuffer(), f.name);
    e.target.value = "";
  };
  const loadSample = async (file) => load(await (await fetch(`/sample/${file}`)).arrayBuffer(), file);
  const reextract = () => lastBuffer.current && load(lastBuffer.current.buffer, lastBuffer.current.name);

  const update = (label, patch) => setData((d) => ({ ...d, [label]: { ...d[label], ...patch } }));
  const statusOf = (a) => data[a.label]?.status || a.status;
  const sel = assets.find((a) => a.label === selected);
  const selData = (sel && data[sel.label]) || {};

  function addLink() {
    if (!sel || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url; // only web links are accepted
    update(sel.label, { links: [...(selData.links || []), { title: linkTitle.trim() || url, url }] });
    setLinkTitle(""); setLinkUrl("");
  }

  function exportJson() {
    const out = { fileName, exported: new Date().toISOString(), assets: assets.map((a) => ({ ...a, status: statusOf(a), ...data[a.label] })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `${fileName || "assets"}.json` }).click();
    URL.revokeObjectURL(url);
  }

  async function importJson(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const next = {};
      for (const a of j.assets || []) { const { label, type, x, y, ...rest } = a; next[label] = rest; }
      setData((d) => ({ ...d, ...next }));
    } catch { setError("That file is not an exported asset JSON."); }
  }

  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, assets.filter((a) => statusOf(a) === s).length]));
  const visible = assets.filter((a) => !hidden.includes(statusOf(a)));

  return (
    <div className="app">
      <div className="bar">
        {context && <Link className="viewerBack" href={context.backHref}>← Scheme workspace</Link>}
        <h1>{context?.title || "Scheme Plan Asset Viewer"}</h1>
        <label><button onClick={(e) => e.currentTarget.nextSibling.click()}>Open PDF…</button>
          <input type="file" accept="application/pdf" onChange={onFile} hidden /></label>
        <button onClick={() => loadSample("scheme_plan.pdf")}>Sample plan</button>
        <button onClick={() => loadSample("scheme_plan_scanned.pdf")}>Scanned sample</button>
        <label className="note"><input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} style={{ width: "auto" }} /> ignore title block &amp; notes</label>
        {fileName && <button onClick={reextract}>Re-extract</button>}
        <span style={{ flex: 1 }} />
        <button onClick={() => setZoom((z) => Math.max(50, z - 25))}>−</button>
        <span className="note">{zoom}%</span>
        <button onClick={() => setZoom((z) => Math.min(300, z + 25))}>+</button>
        <span className="note">Your PDF stays in your browser. Notes are saved in this browser only.</span>
      </div>

      <div className="viewer">
        {!fileName && !busy && <p className="note">{context ? "Open the PDF corresponding to this drawing record. Samples are for testing only. The PDF is not uploaded or stored by this workspace." : "Open a vector scheme plan PDF, or try the sample plan. Use only drawings you are permitted to use."}</p>}
        {busy && <p className="note">Reading plan…</p>}
        <div className="stage" style={{ width: `${zoom}%` }}>
          <div ref={host} />
          {visible.map((a) => (
            <button key={a.label} title={`${a.label} (${STATUS_COLOURS[statusOf(a)].label})`}
              className={"marker" + (a.label === selected ? " sel" : "")}
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, borderColor: colour(statusOf(a)) }}
              onClick={() => setSelected(a.label)} />
          ))}
        </div>
      </div>

      <aside className="side">
        {error && <div className="error">{error}</div>}
        <h2>{assets.length ? `${assets.length} assets found` : "Assets"}</h2>
        <div className="chips">
          {STATUS_ORDER.map((s) => (
            <button key={s} className={"chip" + (hidden.includes(s) ? " off" : "")}
              onClick={() => setHidden((h) => (h.includes(s) ? h.filter((x) => x !== s) : [...h, s]))}>
              <span className="dot" style={{ background: colour(s) }} />{STATUS_COLOURS[s].label} ({counts[s]})
            </button>
          ))}
        </div>
        <div className="list">
          {visible.sort((a, b) => a.label.localeCompare(b.label)).map((a) => (
            <div key={a.label} className={"row" + (a.label === selected ? " sel" : "")} onClick={() => setSelected(a.label)}>
              <span className="dot" style={{ background: colour(statusOf(a)) }} />{a.label}<small>{a.type.replace("_", " ")}</small>
            </div>
          ))}
        </div>

        {sel ? (
          <>
            <h2>{sel.label}</h2>
            <label className="field">Status (override if the extractor got it wrong)
              <select value={statusOf(sel)} onChange={(e) => update(sel.label, { status: e.target.value })}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_COLOURS[s].label}</option>)}
              </select>
            </label>
            <label className="field">Owner
              <input value={selData.owner || ""} onChange={(e) => update(sel.label, { owner: e.target.value })} />
            </label>
            <label className="field">Notes, decisions, minutes
              <textarea rows={6} value={selData.notes || ""} onChange={(e) => update(sel.label, { notes: e.target.value })} />
            </label>
            <div className="field">Links to drawings and documents
              {(selData.links || []).map((l, i) => (
                <div className="linkrow" key={i}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>
                  <button onClick={() => update(sel.label, { links: selData.links.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <input placeholder="Title, e.g. SAMPLE-CAB-002 rev P01" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
              <input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <button onClick={addLink}>Add link</button>
            </div>
          </>
        ) : assets.length ? <p className="note">Click a marker or a row to open that asset.</p> : null}

        {assets.length > 0 && (
          <div className="chips" style={{ marginTop: "auto" }}>
            <button onClick={exportJson}>Export JSON</button>
            <label><button onClick={(e) => e.currentTarget.nextSibling.click()}>Import JSON</button>
              <input type="file" accept="application/json" onChange={importJson} hidden /></label>
          </div>
        )}
      </aside>
    </div>
  );
}
