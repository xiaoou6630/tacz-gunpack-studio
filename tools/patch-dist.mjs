/**
 * Applies the Blockbench 5.2.2 compatibility patches to dist/mcp.js.
 *
 * Patch A — risky_eval migration. Blockbench 5.2.2 removed `Settings.set`.
 * The migration called it unguarded, so it threw inside the plugin `onload`
 * and the MCP server never started. Route the write through a helper that
 * uses `Settings.set` when present and falls back to
 * `Settings.stored[id].value` + `Settings.save()`.
 *
 * Patch B — animations on reopen. `openGunProject` rebuilt a project from
 * `*_geo.json` + the UV PNG only, so a reopened gun showed an empty Animate
 * tab while the pack shipped twelve clips. Read
 * `assets/<ns>/animations/<id>.animation.json` and import the clips with
 * Blockbench's own axis convention: rotation flips x and y, position flips
 * x, scale is untouched (mirrors `compileBedrockKeyframe`).
 *
 * Bun is not installed here, so the shipped bundle is patched in place.
 * Matching source edits: ui/settings.ts, lib/tacz/model.ts, server/tools/tacz.ts.
 *
 * Usage: node tools/patch-dist.mjs <path-to-mcp.js>
 */
import fs from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/patch-dist.mjs <path-to-mcp.js>");
  process.exit(2);
}

let text = fs.readFileSync(target, "utf8");
const before = text.length;
const log = [];

/** Applies one replacement; aborts if the anchor is missing. */
function apply(label, from, to) {
  if (text.includes(to)) {
    log.push(`${label}: already applied`);
    return;
  }
  const at = text.indexOf(from);
  if (at < 0) {
    console.error(`FAIL ${label}: anchor not found`);
    process.exit(1);
  }
  if (text.indexOf(from, at + 1) >= 0) {
    console.error(`FAIL ${label}: anchor is not unique`);
    process.exit(1);
  }
  text = text.slice(0, at) + to + text.slice(at + from.length);
  log.push(`${label}: applied`);
}

// ---------------------------------------------------------------- Patch A
const OLD_MIGRATION =
  'function gre(){if(typeof Settings>"u")return;let e="mcp_risky_eval_migrated_off";' +
  'if(Settings.get(e)===!0)return;if(Settings.get(Ws)===!0)Settings.set(Ws,!1),' +
  'console.info("[mcp] risky_eval was enabled by an older build; closed it. ' +
  'Re-enable it in Settings > General if you need arbitrary code execution.");' +
  'Settings.set(e,!0)}';

const NEW_MIGRATION =
  'function grw(e,t){try{if(typeof Settings.set=="function")return Settings.set(e,t),!0;' +
  'let n=Settings.stored;if(n&&n[e]&&typeof n[e]=="object")return n[e].value=t,' +
  'typeof Settings.save=="function"&&Settings.save(),!0}' +
  'catch(n){console.warn("[mcp] could not persist setting",e,n)}return!1}' +
  'function gre(){if(typeof Settings>"u")return;let e="mcp_risky_eval_migrated_off";' +
  'if(Settings.get(e)===!0)return;' +
  'if(Settings.get(Ws)===!0&&grw(Ws,!1))' +
  'console.info("[mcp] risky_eval was enabled by an older build; closed it. ' +
  'Re-enable it in Settings > General if you need arbitrary code execution.");' +
  'if(Settings.get(Ws)!==!0)grw(e,!0)}';

apply("A settings.set", OLD_MIGRATION, NEW_MIGRATION);

// ---------------------------------------------------------------- Patch B
const IMPORTER =
  'function bbImportAnimations(text){' +
  'const parsed=JSON.parse(text);const clips=parsed.animations;' +
  'if(!clips||typeof clips!=="object")throw Error("Not a Bedrock animation file: it has no animations object.");' +
  'const byName=new Map;for(const g of Group.all){if(!byName.has(g.name))byName.set(g.name,g)}' +
  'const imported=[];' +
  'for(const clipName of Object.keys(clips)){' +
  'const clip=clips[clipName]||{};' +
  'const anim=new Animation({name:"animation."+clipName,loop:clip.loop===!0?"loop":"once",' +
  // snapping is ticks per second and drives Timeline.snapTime on both import
  // and export. Blockbench's default 10 rounds 0.05/0.12/0.45 onto a 0.1 grid
  // and 24 rounds them onto 1/24, so a TaCZ clip comes back with different
  // times. 120 is a multiple of 24 and fine enough for every value TaCZ ships.
  'snapping:120,' +
  'length:typeof clip.animation_length==="number"?clip.animation_length:0});' +
  'const bones=clip.bones||{};' +
  'anim.add();anim.select();' +
  'for(const boneName of Object.keys(bones)){' +
  'const group=byName.get(boneName);if(!group)continue;' +
  'const animator=anim.getBoneAnimator(group);if(!animator)continue;' +
  'for(const channel of ["rotation","position","scale"]){' +
  'const value=bones[boneName][channel];if(value===void 0)continue;' +
  'const flip=p=>channel==="rotation"?[-p[0],-p[1],p[2]]:' +
  'channel==="position"?[-p[0],p[1],p[2]]:[p[0],p[1],p[2]];' +
  'const points=Array.isArray(value)?[[0,flip(value)]]:' +
  'Object.entries(value).map(entry=>[Number(entry[0]),flip(entry[1])]);' +
  'for(const pair of points){' +
  'const time=pair[0],point=pair[1];' +
  'const kf=animator.createKeyframe(null,time,channel,!1,!1);if(!kf)continue;' +
  // createKeyframe snaps time to the timeline grid (0.9 -> 0.9167 at 24fps),
  // which corrupts a TaCZ clip's timing. Restore the exact source time.
  'kf.time=time;' +
  // Keyframe.get/set take an axis letter ("x"/"y"/"z"), not a 0/1/2 index.
  'kf.set("x",point[0]);kf.set("y",point[1]);kf.set("z",point[2])}' +
  'if(typeof animator.addToTimeline==="function")animator.addToTimeline()}' +
  '}' +
  'anim.add();' +
  'if(typeof anim.addToTimeline==="function")anim.addToTimeline();' +
  'imported.push(anim.name)}' +
  'return imported}';
apply("B importer", "function BD(e){", `${IMPORTER}function BD(e){`);

apply(
  "B opener body",
  "ad(i);for(let c of Cube.all)c.applyTexture(a,!0);" +
    "return Canvas.updateAll(),DD({pack_dir:e.packDir,namespace:e.namespace,gun_id:e.gunId," +
    "type:e.type,display_name:e.displayName??e.gunId,texture_size:s,profile:{}})," +
    "{project:Project.name,groups:Group.all.length,cubes:Cube.all.length,texture_size:s}",
  "ad(i);for(let c of Cube.all)c.applyTexture(a,!0);" +
    "let an=e.animationText?bbImportAnimations(e.animationText):[];" +
    "return Canvas.updateAll(),DD({pack_dir:e.packDir,namespace:e.namespace,gun_id:e.gunId," +
    "type:e.type,display_name:e.displayName??e.gunId,texture_size:s,profile:{}})," +
    "{project:Project.name,groups:Group.all.length,cubes:Cube.all.length,texture_size:s,animations:an}",
);

apply(
  "B tool call site",
  'let x=fn(r.join(t,"data",h,"index","guns",`${e.gun_id}.json`),"tacz_gun"),' +
    'A=typeof x.type==="string"?x.type:e.type??"rifle",' +
    'E=BD({packDir:t,namespace:h,gunId:e.gun_id,type:A,displayName:e.display_name,' +
    'geometryText:new TextDecoder().decode(jd(g,"tacz_gun")),textureBytes:jd(y,"tacz_gun")??void 0});',
  'let x=fn(r.join(t,"data",h,"index","guns",`${e.gun_id}.json`),"tacz_gun"),' +
    'A=typeof x.type==="string"?x.type:e.type??"rifle",' +
    'ap=r.join(t,"assets",h,"animations",`${e.gun_id}.animation.json`),' +
    'anText=gr(ap,"tacz_gun")?new TextDecoder().decode(jd(ap,"tacz_gun")):void 0,' +
    'E=BD({packDir:t,namespace:h,gunId:e.gun_id,type:A,displayName:e.display_name,' +
    'geometryText:new TextDecoder().decode(jd(g,"tacz_gun")),textureBytes:jd(y,"tacz_gun")??void 0,' +
    'animationText:anText});',
);

// ---------------------------------------------------------------- Patch C
// The MCP panel renders `formatSessionId(session)`, which prefers
// `clientName` + `clientVersion` and falls back to `id.slice(0,8) + "..."`.
// Client info was only captured from the server's `oninitialized` hook, which
// fires on `notifications/initialized`. Clients that skip that notification
// (the DeepSeek Harness MCP client does) leave every session as a bare hash.
//
// The SDK already stores `_clientVersion` during the initialize request itself
// (`_oninitialize`), so read it once the session exists instead of waiting for
// a notification that may never arrive.
apply(
  "C client info",
  'onsessioninitialized:(nr)=>{console.log(`[MCP] Session initialized: ${nr.slice(0,8)}...`),' +
    'lt.add(nr),a.set(nr,Mn);let Js=gn.server;Js.oninitialized=()=>{' +
    'let ho=Js.getClientVersion();if(ho)lt.updateClientInfo(nr,ho.name,ho.version)}},',
  'onsessioninitialized:(nr)=>{console.log(`[MCP] Session initialized: ${nr.slice(0,8)}...`),' +
    'lt.add(nr),a.set(nr,Mn);let Js=gn.server;' +
    // oninitialized only fires on notifications/initialized, which some
    // clients never send. _oninitialize stores _clientVersion while handling
    // the initialize request itself, but it runs after this callback, so poll
    // briefly for it instead of waiting for a notification.
    'let pollClient=()=>{try{let ho=Js.getClientVersion();' +
    'if(ho&&ho.name){lt.updateClientInfo(nr,ho.name,ho.version);return!0}}catch{}return!1};' +
    'Js.oninitialized=()=>pollClient();' +
    'if(!pollClient()){let n=0,iv=setInterval(()=>{if(pollClient()||++n>20)clearInterval(iv)},50)}},',
);

fs.writeFileSync(target, text, "utf8");
for (const line of log) console.log(`  ${line}`);
console.log(`  chars ${before} -> ${text.length}`);
console.log(`  bytes ${fs.statSync(target).size}`);
