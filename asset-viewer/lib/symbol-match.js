// Experimental, colour-independent image template matcher. No external
// services, uploaded PDFs, or bundled reference-standard symbol images.
const INK = 195;
function binary(image) {
  const mask = new Uint8Array(image.width * image.height);
  for (let i=0;i<mask.length;i++) {
    const j=i*4;
    mask[i] = image.data[j+3] > 127 && Math.min(image.data[j],image.data[j+1],image.data[j+2]) < INK ? 1 : 0;
  }
  return mask;
}

function cropInk(image) {
  const mask=binary(image), w=image.width, h=image.height;
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(mask[y*w+x]) {
    x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y);
  }
  if(x1-x0<3 || y1-y0<3) throw new Error("Select a complete, distinct symbol, not an empty area or a single line.");
  const width=x1-x0+1,height=y1-y0+1;
  const pixels=new Uint8Array(width*height);
  for(let y=0;y<height;y++) pixels.set(mask.subarray((y+y0)*w+x0,(y+y0)*w+x0+width),y*width);
  return {pixels,width,height};
}

function orientation(t, turns, flip) {
  const width=turns%2?t.height:t.width, height=turns%2?t.width:t.height;
  const pixels=new Uint8Array(width*height);
  for(let y=0;y<t.height;y++) for(let x=0;x<t.width;x++){
    const fx=flip?t.width-1-x:x;
    const [u,v]=turns===0?[fx,y]:turns===1?[t.height-1-y,fx]:turns===2?[t.width-1-fx,t.height-1-y]:[y,t.width-1-fx];
    pixels[v*width+u]=t.pixels[y*t.width+x];
  }
  return {pixels,width,height};
}

function resized(t,width,height) {
  const mask=new Uint8Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){
    const x0=Math.floor(x*t.width/width),x1=Math.min(t.width,Math.ceil((x+1)*t.width/width));
    const y0=Math.floor(y*t.height/height),y1=Math.min(t.height,Math.ceil((y+1)*t.height/height));
    let ink=0,total=0;
    for(let v=y0;v<y1;v++) for(let u=x0;u<x1;u++){ink+=t.pixels[v*t.width+u];total++;}
    mask[y*width+x]=ink/total>=0.24?1:0;
  }
  return mask;
}

function sample(list,max) {
  if(list.length<=max)return list;
  return Array.from({length:max},(_,i)=>list[Math.floor(i*list.length/max)]);
}

function variant(t,longSide) {
  const factor=longSide/Math.max(t.width,t.height);
  const w=Math.round(t.width*factor), h=Math.round(t.height*factor);
  if(w<4||h<4||w*h>10000)return null;
  const mask=resized(t,w,h), on=[], off=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(mask[i])on.push([x,y]);
    // Avoid sampling background right at a stroke edge: tolerate a one-pixel shift.
    else if(x>0&&x<w-1&&y>0&&y<h-1&&!mask[i-1]&&!mask[i+1]&&!mask[i-w]&&!mask[i+w])off.push([x,y]);
  }
  if(on.length<7||off.length<5)return null;
  const anchor=on.reduce((best,p)=>Math.hypot(p[0]-w/2,p[1]-h/2)<Math.hypot(best[0]-w/2,best[1]-h/2)?p:best,on[0]);
  return {w,h,anchor,on:sample(on,64),off:sample(off,40)};
}

function dilate(mask,w,h){
  const out=new Uint8Array(mask.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    out[i]=mask[i] || (x>0&&mask[i-1]) || (x+1<w&&mask[i+1]) || (y>0&&mask[i-w]) || (y+1<h&&mask[i+w]) ? 1:0;
  }
  return out;
}

// Return hypotheses only. Score is a heuristic shape-similarity score,
// not a calibrated probability or verification of engineering equipment.
export async function findSymbolMatches(target,template,{minSize=12,maxSize=36,region={left:0,top:0,right:1,bottom:1},threshold=0.87,onProgress=()=>{},signal}={}){
  if(!Number.isFinite(minSize)||!Number.isFinite(maxSize)||minSize<8||maxSize>100||minSize>maxSize)throw new Error("Choose a symbol size between 8 and 100 canvas pixels.");
  const w=target.width,h=target.height;
  if(w*h>16000000)throw new Error("Drawing is too large for this experimental search.");
  const reference=cropInk(template);
  const mask=binary(target),near=dilate(mask,w,h);
  const x0=Math.max(0,Math.floor(w*region.left)),x1=Math.min(w,Math.ceil(w*region.right));
  const y0=Math.max(0,Math.floor(h*region.top)),y1=Math.min(h,Math.ceil(h*region.bottom));
  const anchors=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(mask[y*w+x])anchors.push(y*w+x);
  if(anchors.length>1000000)throw new Error("This drawing area has too much ink for the experimental matcher. Use a smaller extraction area.");
  const sizes=[minSize,Math.round(minSize+(maxSize-minSize)/3),Math.round(minSize+2*(maxSize-minSize)/3),maxSize];
  const variants=[], seen=new Set();
  for(let flip of [false,true])for(let turn=0;turn<4;turn++)for(let size of new Set(sizes)){
    const v=variant(orientation(reference,turn,flip),size);
    if(!v)continue;
    const signature=JSON.stringify(v);
    if(!seen.has(signature)){seen.add(signature);variants.push(v);}
  }
  if(!variants.length)throw new Error("Symbol is too simple or too small to match reliably. Try a tighter crop or a larger target size.");
  // Keep the strongest hypothesis for each small spatial cell, then suppress overlaps.
  const cells=new Map(),cellSize=Math.max(3,Math.floor(minSize/3));
  let done=0;
  for(const v of variants){
    const on=v.on.map(([x,y])=>y*w+x),off=v.off.map(([x,y])=>y*w+x);
    const [ax,ay]=v.anchor;
    for(let k=0;k<anchors.length;k++){
      if(k%20000===0){
        if(signal?.aborted)throw new Error("Search cancelled.");
        onProgress((done+k/Math.max(1,anchors.length))/variants.length);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const a=anchors[k], x=a%w-ax,y=Math.floor(a/w)-ay;
      if(x<x0||y<y0||x+v.w>x1||y+v.h>y1)continue;
      const base=y*w+x;
      let hits=0,exact=0,clear=0;
      for(const p of on){hits+=near[base+p];exact+=mask[base+p];}
      if(hits/on.length<0.85||exact/on.length<0.40)continue;
      for(const p of off)clear+=1-mask[base+p];
      const score=0.48*hits/on.length+0.22*exact/on.length+0.30*clear/off.length;
      if(score<threshold||clear/off.length<0.70)continue;
      const cx=x+v.w/2,cy=y+v.h/2;
      const key=Math.floor(cx/cellSize)+":"+Math.floor(cy/cellSize);
      const match={x:cx/w,y:cy/h,width:v.w/w,height:v.h/h,score};
      if(!cells.has(key)||score>cells.get(key).score)cells.set(key,match);
    }
    done++;
  }
  onProgress(1);
  const candidates=[...cells.values()].sort((a,b)=>b.score-a.score), matches=[];
  for(const m of candidates){
    if(matches.some(p=>Math.abs(p.x-m.x)<Math.max(p.width,m.width)*0.65&&Math.abs(p.y-m.y)<Math.max(p.height,m.height)*0.65))continue;
    matches.push(m);
    if(matches.length===150)break;
  }
  return {matches,truncated:matches.length===150};
}
