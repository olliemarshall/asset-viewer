"use client";
import { useEffect, useRef, useState } from "react";
import { findSymbolMatches } from "../lib/symbol-match";

// Category names refer to asset families; actual symbol images are selected
// locally by an authorised user, not distributed with the application.
const FAMILIES = [
  ["signal","Signal / indicator"],["whistle_board","Whistle board"],["speed_board","Speed sign"],
  ["notice_board","Notice board"],["points","Points / switches"],["track_circuit","Track circuit"],
  ["axle_counter","Axle counter"],["treadle","Treadle"],["wheel_sensor","Wheel sensor"],
  ["aws","AWS equipment"],["tpws","TPWS equipment"],["level_crossing_equipment","Level crossing equipment"],
  ["location_case","Location case"],["pole","Pole"],["telephone","Telephone"],["other","Other apparatus"],
];
const clamp=n=>Math.max(0,Math.min(1,n));
const box=(a,b)=>({left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)});

export default function SymbolFinder({targetCanvas,region,onClose,onMatches}){
  const canvas=useRef(null), drag=useRef(null), doc=useRef(null), cancel=useRef(null);
  const mounted=useRef(true);
  const [source,setSource]=useState("");
  const [page,setPage]=useState(15);
  const [pageCount,setPageCount]=useState(0);
  const [selection,setSelection]=useState(null);
  const [zoom,setZoom]=useState(180);
  const [assetType,setAssetType]=useState("whistle_board");
  const [symbolRef,setSymbolRef]=useState("");
  const [minSize,setMinSize]=useState(12),[maxSize,setMaxSize]=useState(36);
  const [threshold,setThreshold]=useState(87);
  const [busy,setBusy]=useState(false),[searching,setSearching]=useState(false);
  const [progress,setProgress]=useState(0),[error,setError]=useState("");
  const [whole,setWhole]=useState(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancel.current?.abort();};},[]);
  useEffect(()=>{const handler=e=>{if(e.key==="Escape"&&!busy){e.stopPropagation();onClose();}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[busy,onClose]);
  function copySource(){
    if(!targetCanvas||busy)return;
    const c=canvas.current;
    c.width=targetCanvas.width;c.height=targetCanvas.height;c.getContext("2d").drawImage(targetCanvas,0,0);
    setSource("drawing");setZoom(180);setSelection(null);setError("");
  }

  async function renderPage(pdf,n){
    const p=await pdf.getPage(n);
    const v=p.getViewport({scale:3});
    if(!mounted.current||!canvas.current)return;
    const c=canvas.current;
    c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);
    await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
    if(mounted.current){setSelection(null);setSource("reference");setPage(n);}
  }
  async function openReference(e){
    const file=e.target.files[0];e.target.value="";
    if(!file||busy)return;
    setBusy(true);setError("");
    try{
      const pdfjs=await import("pdfjs-dist/build/pdf");
      pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.js";
      const loaded=await pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
      doc.current=loaded;
      setPageCount(loaded.numPages);
      await renderPage(loaded,Math.min(15,loaded.numPages));
      setZoom(180);
    }catch(err){setError("Could not open reference PDF: "+err.message);}
    finally{if(mounted.current)setBusy(false);}
  }
  async function changePage(n){
    if(!doc.current||busy)return;
    const next=Math.max(1,Math.min(doc.current.numPages,n));
    setBusy(true);setError("");
    try{await renderPage(doc.current,next);}catch(err){setError(err.message);}
    finally{if(mounted.current)setBusy(false);}
  }
  function point(e){
    const r=canvas.current.getBoundingClientRect();
    return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};
  }
  function start(e){
    if(busy||!source||e.button!==0||!e.isPrimary)return;
    e.preventDefault();
    const p=point(e);drag.current=p;setSelection(box(p,p));e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e){if(drag.current)setSelection(box(drag.current,point(e)));}
  function end(e){if(drag.current){setSelection(box(drag.current,point(e)));drag.current=null;}}
  async function search(){
    if(!selection||busy||!targetCanvas)return;
    setBusy(true);setSearching(true);setError("");setProgress(0);
    const controller=new AbortController();cancel.current=controller;
    try{
      const c=canvas.current;
      const x=Math.floor(selection.left*c.width),y=Math.floor(selection.top*c.height);
      const w=Math.ceil(selection.right*c.width)-x,h=Math.ceil(selection.bottom*c.height)-y;
      if(w<5||h<5||w*h>1000000)throw new Error("Select a small rectangle around one complete symbol.");
      const template=c.getContext("2d").getImageData(x,y,w,h);
      const target=targetCanvas.getContext("2d").getImageData(0,0,targetCanvas.width,targetCanvas.height);
      const result=await findSymbolMatches(target,template,{minSize:Number(minSize),maxSize:Number(maxSize),
        threshold:Number(threshold)/100,region:whole?undefined:region,signal:controller.signal,onProgress:setProgress});
      if(mounted.current)onMatches({...result,type:assetType,ref:symbolRef.trim()});
    }catch(err){if(mounted.current)setError(err.message);}
    finally{if(mounted.current){setBusy(false);setSearching(false);}cancel.current=null;}
  }
  return <div className="symbolBackdrop" role="presentation" onPointerDown={e=>e.stopPropagation()}>
    <section className="symbolDialog" role="dialog" aria-modal="true" aria-label="Experimental graphical symbol search">
      <header className="symbolHeader"><div><strong>Find similar graphical symbols</strong><p>Experimental • local processing • engineer review required</p></div><button disabled={busy} onClick={onClose}>Close ×</button></header>
      <div className="symbolLayout">
        <div className="symbolSource">
          <div className="chips">
            <label className="symbolUpload"><button disabled={busy} onClick={e=>e.currentTarget.nextSibling.click()}>Open reference PDF…</button><input type="file" accept="application/pdf" hidden onChange={openReference}/></label>
            <button disabled={busy} onClick={copySource}>Use current drawing</button>
          </div>
          {source==="reference"&&<div className="symbolPage"><button disabled={busy||page===1} onClick={()=>changePage(page-1)}>‹</button><label>Page <input type="number" min={1} max={pageCount} key={page} defaultValue={page} disabled={busy} onKeyDown={e=>{if(e.key==="Enter")changePage(Number(e.currentTarget.value)||1);}} onBlur={e=>{const n=Number(e.target.value);if(n&&n!==page)changePage(n);}} /></label><span>of {pageCount}</span><button disabled={busy||page===pageCount} onClick={()=>changePage(page+1)}>›</button></div>}
          <div className="symbolZoom"><label>Reference zoom <input type="range" min={100} max={600} step={25} value={zoom} disabled={busy} onChange={e=>setZoom(Number(e.target.value))}/></label><span>{zoom}%</span></div>
          {!source&&<p className="note">Open an authorised copy of the symbol reference, or use an example from the current scheme plan. The file is not uploaded.</p>}
          <div className="symbolReferenceScroll" style={{display:source?"block":"none"}}>
            <div className="symbolReferenceStage" style={{width:zoom+"%"}}>
              <canvas ref={canvas} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setSelection(null);}} />
              {selection&&<div className="symbolSelection" style={{left:selection.left*100+"%",top:selection.top*100+"%",width:(selection.right-selection.left)*100+"%",height:(selection.bottom-selection.top)*100+"%"}}/>}
            </div>
          </div>
          <p className="note">Drag a tight rectangle around one symbol; exclude text, table borders and unrelated nearby lines where possible.</p>
        </div>
        <div className="symbolOptions">
          <h2>Recognition settings</h2>
          <label className="field">Asset type<select value={assetType} disabled={busy} onChange={e=>setAssetType(e.target.value)}>{FAMILIES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
          <label className="field">Standard / symbol reference (optional)<input disabled={busy} value={symbolRef} placeholder="e.g. A.2.13" onChange={e=>setSymbolRef(e.target.value)}/></label>
          <div className="symbolSizes"><label className="field">Min symbol size (px)<input type="number" min={8} max={100} value={minSize} disabled={busy} onChange={e=>setMinSize(e.target.value)}/></label><label className="field">Max symbol size (px)<input type="number" min={8} max={100} value={maxSize} disabled={busy} onChange={e=>setMaxSize(e.target.value)}/></label></div>
          <p className="note">Approximate longest dimension in the rendered target canvas ({targetCanvas?.width} × {targetCanvas?.height} px). Try a narrow range first.</p>
          <label className="field">Match strictness: {threshold}%<input type="range" min={80} max={97} step={1} value={threshold} disabled={busy} onChange={e=>setThreshold(Number(e.target.value))}/></label>
          <label className="symbolCheck"><input type="checkbox" checked={whole} disabled={busy} onChange={e=>setWhole(e.target.checked)}/>Search whole page, including tables and notes</label>
          <p className="note">Search compares shape across sizes and orientations. Results are unverified suggestions, not evidence that equipment exists. Some symbols will be missed or confused.</p>
          {error&&<p className="error" role="alert">{error}</p>}
          {searching&&<><progress max={1} value={progress}/><button onClick={()=>cancel.current?.abort()}>Cancel search</button></>}
          <button className="calloffActive" disabled={!selection||busy} onClick={search}>{searching?"Searching…":"Search drawing"}</button>
        </div>
      </div>
    </section>
  </div>;
}
