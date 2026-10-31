## TACZ 枪包工坊 · Blockbench MCP 插件

在 Blockbench 内运行 MCP 服务器，并为 **TACZ（永恒枪械工坊：零）** 枪包提供建模、弹药、配件与图标工具。

## 安装

1. 把 `mcp.js` 放进 Blockbench 的插件目录：
   - Windows `%APPDATA%\Blockbench\plugins\`
   - macOS `~/Library/Application Support/Blockbench/plugins/`
   - Linux `~/.config/Blockbench/plugins/`
2. **重启 Blockbench**（已运行的实例会把旧版本留在内存里）。
3. **设置 → 通用** 确认 MCP 服务器已启用，默认端点 `http://127.0.0.1:3000/bb-mcp`。

## 提供的工具

| 工具 | 用途 |
|---|---|
| `tacz_pack` | 建包骨架、校验、打包成 zip |
| `tacz_gun` | 建枪工程、打开、导出几何/UV/slot/HUD |
| `tacz_ammo` | 弹药模型、UV 图集、槽位图标 |
| `tacz_attachment` | 配件模型、UV 图集、槽位图标 |
| `tacz_icon_render` | 出 slot（64×64 等轴右、关阴影、枪口朝右）与 HUD（384×128 侧视、关阴影、枪口朝左） |
| `tacz_model_validate` | 组名、骨骼、UV、贴图尺寸自检 |
| `tacz_guide` | 内置建模/贴图/数据/校验速查 |
| `tacz_template_list` | 各类枪与弹药/配件模板 |

## 美术 / 数据分离

Blockbench 这一半**只做美术**：几何、UV、贴图、图标、`.bbmodel`。
`tacz_gun action="export" art_only=true` 不会写 index/data/display/lang。

所有 JSON 数据由 DeepSeek Harness 侧的 `tacz_item` 工具负责，两边互不覆盖。

## 安全

- **`risky_eval` 默认关闭。** 它允许连上本地 MCP 端口的程序在 Blockbench 内执行任意 JavaScript；TACZ 工具链完全不需要它。
- 只连三个端点：`127.0.0.1:3000`（本机）、Bing Images（搜参考图）、GitHub API（取官方基准）。
- 无遥测、无埋点、不上传工程数据。

## 许可

**GPL-3.0-only。** 本插件是 [jasonjgardner/blockbench-mcp-plugin](https://github.com/jasonjgardner/blockbench-mcp-plugin) 的 fork，原作者 Jason J. Gardner。
完整改动清单与来源 commit 见 `SOURCE.txt`；许可全文见仓库根 `LICENSES/GPL-3.0.txt`。

## 项目主页

https://github.com/xiaoou6630/tacz-gunpack-studio
