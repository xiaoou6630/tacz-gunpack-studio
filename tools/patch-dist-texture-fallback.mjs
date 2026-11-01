/**
 * Patches dist/mcp.js so the atlas pass degrades sensibly when cube names carry
 * no part information.
 *
 * Bedrock geometry has no `name` field for cubes. A project reopened from
 * `*_geo.json` therefore names every cube after its bone — usually `AKM`. The
 * old fallback matched none of the material rules and returned plain `steel`
 * for every cube, so `tacz_texture_init` painted the whole gun one flat grey.
 *
 * The fallback now cycles through steel / steel_dark / polymer / wood by cube
 * index, so a blockout built from bone-named cubes is still readable.
 *
 * The green seen in danuvia_43m (#3bbb2f, 90% of the atlas) was NOT produced
 * here: that colour is absent from TACZ_MATERIALS, so it came from a later
 * whole-atlas fill by the modeler. The modeler skill now forbids that; this
 * patch covers the other half of the failure.
 *
 * Usage: node tools/patch-dist-texture-fallback.mjs <path-to-mcp.js>
 */
import fs from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/patch-dist-texture-fallback.mjs <path-to-mcp.js>");
  process.exit(2);
}
let text = fs.readFileSync(target, "utf8");
const before = text.length;

if (text.includes("bbMaterialFallback")) {
  console.log("already patched");
  process.exit(0);
}

// The bundle renames functions, so match the rule body rather than a name.
const BODY =
  "(e){let t=e.toLowerCase();" +
  'if(/(stock|wood|handguard|grip)/.test(t))return t.includes("grip")?"polymer":"wood";' +
  'if(/(mag|bolt|barrel|muzzle|receiver|tube|steel)/.test(t))return t.includes("muzzle")||t.includes("mag")?"steel_dark":"steel";' +
  'if(/(sight|scope|rail)/.test(t))return"steel_dark";' +
  'if(/(glass|lens)/.test(t))return"glass";' +
  'if(/(accent|warhead|tip)/.test(t))return"accent";' +
  'return"steel"}';

if (!text.includes(BODY)) {
  console.error("materialForName anchor not found");
  process.exit(1);
}

const NEW_BODY =
  "(e,t=0){let r=e.toLowerCase();" +
  'if(/(stock|wood|handguard|grip)/.test(r))return r.includes("grip")?"polymer":"wood";' +
  'if(/(mag|bolt|barrel|muzzle|receiver|tube|steel)/.test(r))return r.includes("muzzle")||r.includes("mag")?"steel_dark":"steel";' +
  'if(/(sight|scope|rail)/.test(r))return"steel_dark";' +
  'if(/(glass|lens)/.test(r))return"glass";' +
  'if(/(accent|warhead|tip)/.test(r))return"accent";' +
  // Bone-named cubes: vary by index so the blockout is not one flat colour.
  'return bbMaterialFallback(t)}' +
  'function bbMaterialFallback(t){let n=["steel","steel_dark","polymer","wood"];return n[t%n.length]}';

text = text.replace(BODY, NEW_BODY);

// Pass the loop index at the call site so the fallback can vary.
// Minified shape: `for(let X of Cube.all){X.applyTexture(...)...;let M=FN(X.name),C=PAL[M]??PAL.steel;`
const CALL = /([A-Za-z0-9_$]+)\.name\),([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)\[([A-Za-z0-9_$]+)\]??\4\.steel;/;
const callMatch = CALL.exec(text);
if (!callMatch) {
  console.error("call site not found — index will stay 0, fallback will be uniform steel");
  fs.writeFileSync(target, text, "utf8");
  console.log(`patched ${target} (rule only)`);
  console.log(`  chars ${before} -> ${text.length}`);
  process.exit(0);
}

// Introduce a counter before the loop and advance it at the call site.
const LOOP_HEAD = "for(let ";
const loopIdx = text.indexOf(LOOP_HEAD + callMatch[1] + " of Cube.all)");
if (loopIdx >= 0) {
  text =
    text.slice(0, loopIdx) +
    "let bbCubeIndex=0;" +
    text.slice(loopIdx);
  const oldCall = callMatch[0];
  const newCall = oldCall.replace(
    `${callMatch[1]}.name),`,
    `${callMatch[1]}.name,bbCubeIndex++),`,
  );
  text = text.replace(oldCall, newCall);
  console.log("  index threaded through the atlas loop");
}

fs.writeFileSync(target, text, "utf8");
console.log(`patched ${target}`);
console.log(`  fallback cycles steel/steel_dark/polymer/wood`);
console.log(`  chars ${before} -> ${text.length}`);
console.log(`  bytes ${fs.statSync(target).size}`);
