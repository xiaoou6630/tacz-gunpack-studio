/**
 * Adds the one-time session-timeout migration to the shipped bundle.
 *
 * Upstream defaults `mcp_session_timeout` to 30 minutes. The DeepSeek Harness
 * MCP client has no session-recovery path (no 404 handling, no reconnect), so
 * an idle disconnect leaves it broken until DSH itself restarts. Raise the
 * default to the setting's maximum and lift existing installs off the old
 * value once, without touching a value the user chose deliberately.
 *
 * Usage: node tools/patch-dist-session-timeout.mjs <path-to-mcp.js>
 */
import fs from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/patch-dist-session-timeout.mjs <path-to-mcp.js>");
  process.exit(2);
}

let text = fs.readFileSync(target, "utf8");
const before = text.length;

if (text.includes("mcp_session_timeout_raised")) {
  console.log("already patched");
  process.exit(0);
}

// 1. Raise the registered default from 30 to 1440 (the declared max).
const OLD_DEFAULT =
  'new Setting("mcp_session_timeout",{name:tl("mcp.settings.session_timeout_name"),' +
  'description:tl("mcp.settings.session_timeout_desc"),type:"number",value:30,min:1,max:1440,';
const NEW_DEFAULT = OLD_DEFAULT.replace("value:30", "value:1440");
if (!text.includes(OLD_DEFAULT)) {
  console.error("default anchor not found");
  process.exit(1);
}
text = text.replace(OLD_DEFAULT, NEW_DEFAULT);

// 2. Call the migration at the end of settingsSetup(), and define it.
//
// Writing `Settings.stored[id].value` only changes the SAVED value; the live
// Setting object keeps its old `value`, and `Settings.get()` reads that. On
// the next save the live value overwrites `stored` again, so the migration
// must mutate the Setting object itself. settingsSetup() keeps them in `_g`.
const ANCHOR = "onChange:()=>bs()})),gre()}";
const REPLACEMENT =
  "onChange:()=>bs()})),gre(),grS()}" +
  "function grS(){" +
  'if(typeof Settings>"u")return;' +
  'let e="mcp_session_timeout_raised";' +
  "if(Settings.get(e)===!0)return;" +
  'let t=Number(Settings.get("mcp_session_timeout"));' +
  "if(Number.isFinite(t)&&t>30)return;" + // user chose a larger value: leave it
  // Mutate the live Setting so Settings.get() and the Settings dialog agree.
  'let s=_g.find(x=>x&&x.id==="mcp_session_timeout");' +
  "if(s){s.value=1440;" +
  'typeof Settings.save==="function"&&Settings.save();' +
  'console.info("[mcp] session timeout raised to 1440 minutes; DSH cannot recover a lost MCP session on its own.")}' +
  "grw(e,!0)}";
if (!text.includes(ANCHOR)) {
  console.error("migration anchor not found");
  process.exit(1);
}
text = text.replace(ANCHOR, REPLACEMENT);

fs.writeFileSync(target, text, "utf8");
console.log(`patched ${target}`);
console.log(`  default 30 -> 1440 : ${text.includes('value:1440,min:1,max:1440')}`);
console.log(`  migration inserted : ${text.includes("function grS()")}`);
console.log(`  chars ${before} -> ${text.length}`);
console.log(`  bytes ${fs.statSync(target).size}`);
