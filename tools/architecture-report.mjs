/**
 * Prints the current architecture of the two plugins: what each side owns,
 * which tools it exposes, how the two talk to each other, and which host
 * versions each side actually requires.
 *
 * Usage: node tools/architecture-report.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

function toolsIn(source) {
  const names = new Set();
  for (const m of source.matchAll(/name:\s*["'](tacz_[a-z_]+)["']/g)) names.add(m[1]);
  for (const m of source.matchAll(/name:\s*["'](bbmodel_[a-z_]+)["']/g)) names.add(m[1]);
  return [...names].sort();
}

console.log("=".repeat(60));
console.log("架构盘点");
console.log("=".repeat(60));

const dshSource = read("packages/dsh-tacz-gunpack/index.mjs");
const bbSource = read("packages/blockbench-mcp-tacz/dist/mcp.js");

console.log("");
console.log("数据侧 packages/dsh-tacz-gunpack (MIT)");
console.log("  运行在  : DeepSeek Harness");
console.log("  工具    :", toolsIn(dshSource).join(", ") || "(none)");
console.log("  写什么  : index/data/display/lang, 配方, 标签, 构建状态");

console.log("");
console.log("美术侧 packages/blockbench-mcp-tacz (GPL-3.0)");
console.log("  运行在  : Blockbench");
console.log("  工具    :", toolsIn(bbSource).join(", ") || "(none)");
console.log("  写什么  : geo_models, textures, slot/HUD 图标, .bbmodel");

console.log("");
console.log("通信");
const install = read("packages/dsh-tacz-gunpack/lib/mcp-install.mjs");
const url = /DEFAULT_MCP_URL\s*=\s*["'`]([^"'`]+)/.exec(install);
console.log("  方式    : 本地 HTTP MCP (streamable-http)");
console.log("  默认端点:", url ? url[1] : "(see mcp-install.mjs)");
console.log("  谁发起  : DSH 作为 MCP client，Blockbench 作为 server");

console.log("");
console.log("版本要求");
const pkg = JSON.parse(read("package.json"));
const dshPkg = JSON.parse(read("packages/dsh-tacz-gunpack/package.json"));
const bbPkg = JSON.parse(read("packages/blockbench-mcp-tacz/package.json"));
console.log("  DSH 包  :", dshPkg.name, dshPkg.version, JSON.stringify(dshPkg.engines));
console.log("  BB 包   :", bbPkg.name, bbPkg.version);
const min = /min_version:\s*["']([^"']+)["']/.exec(bbSource);
console.log("  BB 声明 :", min ? `min_version ${min[1]}` : "(none)");

console.log("");
console.log("Blockbench API 依赖（决定真实最低版本）");
const apis = [
  ["Settings.get", "5.0"],
  ["Settings.stored", "5.2"],
  ["Settings.save", "5.2"],
  ["Settings.set", "≤5.1 (5.2 已移除)"],
  ["AnimationCodec", "5.0"],
  ["getClientVersion", "SDK"],
];
for (const [api, since] of apis) {
  console.log(`  ${bbSource.includes(api) ? "used " : "-    "} ${api.padEnd(20)} ${since}`);
}

console.log("");
console.log("关键结论");
console.log("  - Settings.set 只在 writeSetting() 的 fallback 分支里出现，");
console.log("    5.2.2 上走 Settings.stored + Settings.save 分支，所以两个大版本都能跑。");
console.log("  - 但 min_version 仍写着 5.0.0，而导入动画用到的");
console.log("    createKeyframe(values,time,channel,undo,select) 签名与 snapping");
console.log("    行为在 5.x 各版本间并不保证一致，实测基准是 5.2.2。");
