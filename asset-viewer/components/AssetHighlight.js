"use client";
import {useEffect,useState} from "react";

export function validRegion(b){
  return b && [b.left,b.top,b.right,b.bottom].every(Number.isFinite) &&
    b.left>=0&&b.top>=0&&b.right<=1&&b.bottom<=1&&
    b.right-b.left>=0.00001&&b.bottom-b.top>=0.00001;
}
export function centeredRegion(x,y,w,h){
  const b={left:Math.max(0,x-w/2),top:Math.max(0,y-h/2),right:Math.min(1,x+w/2),bottom:Math.min(1,y+h/2)};
  return validRegion(b)?b:null;
}
// Raster ink only inside an engineer-defined / matcher-suggested region.
// White background is removed, source geometry is not changed.
export function makeInkMask(canvas,b){
  if(!canvas||!validRegion(b))return null;
  const x=Math.floor(b.left*canvas.width),y=Math.floor(b.top*canvas.height);
  const w=Math.max(1,Math.ceil(b.right*canvas.width)-x),h=Math.max(1,Math.ceil(b.bottom*canvas.height)-y);
  const scale=Math.min(1,384/Math.max(w,h));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext("2d",{willReadFrequently:true});
  if(!ctx)return null;
  ctx.drawImage(canvas,x,y,w,h,0,0,c.width,c.height);
  const image=ctx.getImageData(0,0,c.width,c.height),p=image.data;
  let ink=0;
  for(let i=0;i<p.length;i+=4){
    const darkness=255-Math.min(p[i],p[i+1],p[i+2]);
    const a=Math.round(p[i+3]*Math.min(1,Math.max(0,(darkness-22)/150)));
    p[i]=p[i+1]=p[i+2]=255;p[i+3]=a;ink+=a;
  }
  if(ink<255)return null;
  ctx.putImageData(image,0,0);
  return c.toDataURL("image/png");
}
export default function AssetHighlight({canvas,region,label,selected,onSelect,disabled}){
  const [mask,setMask]=useState(null);
  useEffect(()=>{try{setMask(makeInkMask(canvas,region));}catch{setMask(null);}},[canvas,region.left,region.top,region.right,region.bottom]);
  const url=mask?"url("+mask+")":undefined;
  return <button type="button" className={"assetInkHit"+(selected?" selected":"")+(!mask?" emptyMask":"")}
    style={{left:region.left*100+"%",top:region.top*100+"%",width:(region.right-region.left)*100+"%",height:(region.bottom-region.top)*100+"%"}}
    aria-label={"Inspect "+label} title={label+" · highlighted region (verify geometry)"} disabled={disabled}
    onClick={e=>{e.stopPropagation();onSelect();}}>
    {mask&&<span className="assetInkGlow" style={{maskImage:url,WebkitMaskImage:url}}/>}
  </button>;
}
