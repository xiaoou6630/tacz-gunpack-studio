# 第三方声明 / Third-party notices

本仓库包含两个**分开许可**的部分。

## packages/blockbench-mcp-tacz/ — GPL-3.0-only

`mcp.js` 是 **blockbench-mcp** 的构建产物，fork 自：

- 上游：https://github.com/jasonjgardner/blockbench-mcp-plugin
- 原作者：Jason J. Gardner
- 许可：**GNU General Public License v3.0 only**（GPL-3.0-only）

本 fork 新增 TACZ 枪包工具（`tacz_pack`、`tacz_gun`、`tacz_ammo`、
`tacz_attachment`、`tacz_icon_render`、`tacz_model_validate`、`tacz_guide`、
`tacz_template_list`、`tacz_texture_init`），并把 `risky_eval` 默认值改为
`false`。完整改动清单与来源 commit 见 `packages/blockbench-mcp-tacz/SOURCE.txt`。

因为上游是 GPL-3.0-only，这一部分保持 GPL-3.0-only。再分发时（无论是否修改）你必须：

1. 随附 GPL-3.0 全文（`LICENSES/GPL-3.0.txt`）；
2. 向接收者提供对应源码；
3. 保留本声明并说明你的改动；
4. 把整个衍生作品继续以 GPL-3.0 授权。

## packages/dsh-tacz-gunpack/ — MIT

DeepSeek Harness 插件（`dsh-tacz-gunpack`）为原创作品，以 **MIT** 许可发布，
全文见 `LICENSES/MIT.txt`。

它通过本地 HTTP MCP 端点与 Blockbench 插件通信，**不链接也不嵌入** GPL 代码，
因此不构成该 GPL 作品的衍生作品，可独立以 MIT 分发。

## docs/ — MIT

`docs/` 下的文档为本项目撰写，以 MIT 发布。内容为公开可查的 TACZ 枪包格式规则，
不包含任何 TACZ 源码或资源的复制。

## 不包含的资源

本仓库**不**分发任何 TACZ 游戏资源、模型、贴图、音效或官方默认枪包。
`tacz_spec` 可能在运行时从 `MCModderAnchor/TACZ@1.20.1` 拉取官方基准文件；
那些文件仍属 TACZ 项目自身许可，仅缓存在本地，不随本仓库分发。
