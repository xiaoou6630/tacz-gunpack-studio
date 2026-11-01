/**
 * Patches dist/mcp.js so `tacz_model_validate` measures texture quality.
 *
 * Why: the structural checks only ask "will it load?". A model whose atlas was
 * created but never painted, and whose faces all collapsed onto `uv: [0,0]`,
 * passes every one of them and renders as grey mush. That is exactly what
 * happened to danuvia_43m: 14 colours over 2% of the atlas, 96 cubes, and all
 * 576 faces sampling one pixel.
 *
 * The source implementation lives in lib/tacz/quality.ts and is wired into
 * validateCurrentModel in lib/tacz/validate.ts. Bun is unavailable on this
 * machine, so the shipped bundle is patched in place with the same logic.
 *
 * Thresholds are measured, not guessed (broken vs good vs official):
 *   uv unique     1%   vs 100%   (min 70%)
 *   colours      14    vs 430    (min 64, official 400+)
 *   coverage      2%   vs 74%    (min 20%)
 *   cubes        96    vs 226    (min 120, official 273-761)
 *
 * Usage: node tools/patch-dist-quality.mjs <path-to-mcp.js>
 */
import fs from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/patch-dist-quality.mjs <path-to-mcp.js>");
  process.exit(2);
}
let text = fs.readFileSync(target, "utf8");
const before = text.length;

if (text.includes("function bbQualityGates(")) {
  console.log("already patched");
  process.exit(0);
}

// The importer is inserted just before the validation function, then called
// from its return statement so the extra issues join the existing arrays.
const GATES = `function bbQualityGates(){
const t=[],r={};
const x=Texture.all[0]||null;
if(x&&x.canvas&&x.canvas.width>0){
  try{
    let cv=x.canvas,ct=cv.getContext("2d",{willReadFrequently:!0});
    if(ct){
      let d=ct.getImageData(0,0,cv.width,cv.height).data,tot=cv.width*cv.height,step=Math.max(1,Math.floor(tot/65536)),cols=new Set,covered=0,sampled=Math.ceil(tot/step);
      for(let p=0;p<tot;p+=step){let o=p*4;if(d[o+3]===0)continue;covered++;cols.add((d[o]<<16)|(d[o+1]<<8)|d[o+2])}
      let pct=Math.round((covered/sampled)*100);
      r.distinct_colors=cols.size;r.coverage_percent=pct;
      if(cols.size<64)t.push({code:"TEXTURE_FLAT",severity:"error",message:"The atlas has only "+cols.size+" distinct colours (minimum 64). Official packs use 400+. This is what an unpainted atlas looks like: run tacz_texture_init, then paint shading and detail."});
      if(pct<20)t.push({code:"TEXTURE_EMPTY",severity:"error",message:"Only "+pct+"% of the atlas carries pixels (minimum 20%). Most faces have nowhere to sample from, so the model renders as a flat silhouette."});
    }
  }catch(err){}
}
let rects=new Set(),faces=0,collapsed=0;
for(const cube of Cube.all){
  for(const face of Object.values(cube.faces)){
    let uv=face&&face.uv;
    if(!uv||uv.length!==4)continue;
    let v=uv.map(n=>Math.round(Number(n))).join(",");
    rects.add(v);faces++;
    if(Number(uv[0])===0&&Number(uv[1])===0&&Number(uv[2])===0&&Number(uv[3])===0)collapsed++;
  }
}
r.uv_faces=faces;r.uv_unique_percent=faces===0?0:Math.round((rects.size/faces)*100);
if(faces>0&&r.uv_unique_percent<70)t.push({code:"UV_OVERLAP",severity:"error",message:(faces-rects.size)+" of "+faces+" faces share a UV rectangle ("+r.uv_unique_percent+"% unique, minimum 70%). Overlapping faces sample the same texels, which is why the surface reads as one flat colour. Run tacz_texture_init and let Auto UV assign each face its own rectangle."});
r.cubes=Cube.all.length;
if(Cube.all.length>0&&Cube.all.length<120)t.push({code:"DETAIL_LOW",severity:"warning",message:Cube.all.length+" cubes is LOD-grade detail (official high-poly guns use 273-761). Fine for a blockout; add detail before shipping."});
return{issues:t,stats:r,collapsed}}
`;

const ANCHOR = "function sU(e={}){";
if (!text.includes(ANCHOR)) {
  console.error("validation function anchor not found");
  process.exit(1);
}
text = text.replace(ANCHOR, `${GATES}${ANCHOR}`);

// Join the quality issues into the result, and expose the measurements.
const OLD_RETURN =
  "return{ok:t.length===0,format:n,groups:Group.all.length,cubes:Cube.all.length," +
  "texture:s?{name:s.name,width:s.width,height:s.height}:null,errors:t,warnings:r}}";
const NEW_RETURN =
  "let q={issues:[],stats:{}};try{q=bbQualityGates()}catch(eq){}" +
  "for(const qi of q.issues){qi.severity===\"error\"?t.push(qi):r.push(qi)}" +
  "return{ok:t.length===0,format:n,groups:Group.all.length,cubes:Cube.all.length," +
  "texture:s?{name:s.name,width:s.width,height:s.height}:null,quality:q.stats,errors:t,warnings:r}}";
if (!text.includes(OLD_RETURN)) {
  console.error("validation return anchor not found");
  process.exit(1);
}
text = text.replace(OLD_RETURN, NEW_RETURN);

fs.writeFileSync(target, text, "utf8");
console.log(`patched ${target}`);
console.log(`  gates inserted : ${text.includes("function bbQualityGates(")}`);
console.log(`  wired into return : ${text.includes("q=bbQualityGates()")}`);
console.log(`  chars ${before} -> ${text.length}`);
console.log(`  bytes ${fs.statSync(target).size}`);
