import test from "node:test";
import assert from "node:assert/strict";
import {findSymbolMatches} from "../lib/symbol-match.js";

function raster(w,h,draw){
  const data=new Uint8ClampedArray(w*h*4).fill(255);
  const ink=(x,y,colour=[0,0,0])=>{const i=(y*w+x)*4;data.set(colour,i);};
  draw(ink);return{width:w,height:h,data};
}
function shape(ink,x,y,colour){
  for(let i=0;i<15;i++){ink(x+i,y,colour);ink(x,y+i,colour);ink(x+14,y+i,colour);ink(x+i,y+14,colour);}
  for(let i=2;i<13;i++)ink(x+i,y+i,colour);
}
test("two identical synthetic shapes, one in red, and an unrelated line",async()=>{
  const template=raster(19,19,ink=>shape(ink,2,2));
  const target=raster(100,60,ink=>{shape(ink,15,10);shape(ink,67,33,[220,0,0]);for(let i=5;i<90;i++)ink(i,55);});
  const out=await findSymbolMatches(target,template,{minSize:15,maxSize:15,threshold:.95});
  assert.equal(out.matches.length,2);
  assert.deepEqual(out.matches.map(m=>Math.round(m.x*100)).sort((a,b)=>a-b),[23,75]);
});
test("empty template rejected",async()=>{
  const empty=raster(20,20,()=>{});
  await assert.rejects(findSymbolMatches(empty,empty),/complete, distinct symbol/);
});
test("search area excludes the second symbol",async()=>{
  const template=raster(19,19,ink=>shape(ink,2,2));
  const target=raster(100,60,ink=>{shape(ink,15,10);shape(ink,67,33);});
  const out=await findSymbolMatches(target,template,{minSize:15,maxSize:15,threshold:.95,region:{left:0,right:.5,top:0,bottom:1}});
  assert.equal(out.matches.length,1);
});
