# TACZ 枪包工坊 · TACZ Gun Studio

> 一个仓库，两半插件：**美术在 Blockbench，数据在 DeepSeek Harness**。
> 用 AI 从零做出一把能被 TACZ（永恒枪械工坊：零）加载的枪，并导出可校验的枪包。

![TACZ](https://img.shields.io/badge/TACZ-gun%20pack%20studio-orange)
![Blockbench](https://img.shields.io/badge/Blockbench-5.0%2B-blue)
![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.5%2B-purple)

---

## 这是什么

TACZ 枪包 = 模型 + 贴图 + 图标 + 一堆 JSON。手工做一遍要反复对路径、对字段、对组名，很容易错在细节上。

本项目把它拆成两半，各管各的，互不覆盖：

| 半边 | 装在哪 | 管什么 | 许可 |
|---|---|---|---|
| **美术侧** | Blockbench | 几何、UV 图集、贴图、slot/HUD 图标、`.bbmodel` | GPL-3.0 |
| **数据侧** | DeepSeek Harness | index/data/display/lang、配方、标签、构建控制器、六个角色 | MIT |

核心约束：**美术侧永不写数据，数据侧永不建模。** 两边靠本地 HTTP MCP 端点通信，不共享文件所有权，所以不会互相踩。

---

## 安装（三步）

### 前置要求

- **Blockbench 5.0+**（桌面版）
- **DeepSeek Harness 0.2.1-rc.5 ~ 0.2.x**
- Node.js 20+（DSH 插件用）

### 1. Blockbench 装插件

在 Blockbench 里 **文件 → 插件 → 从 URL 安装**，填：

```
https://github.com/xiaoou6630/tacz-gunpack-studio/raw/main/packages/blockbench-mcp-tacz/dist/mcp.js
```

或者手动下载 `mcp.js` 放进插件目录：

| 系统 | 路径 |
|---|---|
| Windows | `%APPDATA%\Blockbench\plugins\` |
| macOS | `~/Library/Application Support/Blockbench/plugins/` |
| Linux | `~/.config/Blockbench/plugins/` |

**然后重启 Blockbench。**

### 2. DeepSeek Harness 装插件

在 DSH 里 **插件 → 添加插件**，填仓库地址：

```
https://github.com/xiaoou6630/tacz-gunpack-studio
```

镜像源选 **中国大陆镜像源**。装完**重启 DSH**，新建会话时选 **「TACZ 枪包工坊」**。

### 3. 接线（自动）

**不需要手动操作。** 插件加载时会自动把 Blockbench 的 MCP 端点写进当前 DSH profile，并备份原文件：

```
[dsh-tacz-gunpack] Blockbench MCP row installed into .../cordis.patch.yml (backup: ...bak-tacz-...)
```

所以装完 DSH、重启一次，`mcp__blockbench__*` 工具就该出现了。

如果端口改过、或者想重新接线，再手动跑：

```
tacz_install_mcp url="127.0.0.1:3001/custom" force=true
```

不想让它自动接线的话，给插件配置加 `autoInstallMcp: false`。

---

## 验证装好了

| 命令 | 期望 |
|---|---|
| `tacz_status` | 六个角色、已装载技能、`blockbench_tool_count` 非 0、`blockbench_mcp_url` 与你 Blockbench 设置一致 |
| `tacz_install_preset` | `registered: true` |
| 说「做个霰弹枪」 | 总监**先反问**口径/型号/是否要动画 |

---

## 功能

### 数据侧（DeepSeek Harness）

- **六个角色**：总监 + 建模 / 数据 / 审核 / 搜索 / 学习，各自独立可改写 `SKILL.md`
- **构建控制器** `tacz_build`：`INIT → RESEARCH → BLUEPRINT → GEOMETRY → DATA → REVIEW → PACKAGE → READY → DONE`，卡阶段、卡产物、卡人工验收
- **弹药与配件数据** `tacz_item`：index / display / data / lang / 配方 / `allow_attachments` 标签
- **交叉校验** `tacz_verify`：display 里每个引用都对着磁盘查一遍
- **官方基准** `tacz_spec`：优先本地，缺了从 `MCModderAnchor/TACZ@1.20.1` 取
- **自学习** `tacz_skill`：从审核缺陷提炼经验，改写技能，带版本可回滚

### 美术侧（Blockbench）

- `tacz_pack` / `tacz_gun`：建包、建枪、导出几何与 UV
- `tacz_ammo` / `tacz_attachment`：弹药和配件的模型、UV、图标
- `tacz_icon_render`：slot（64×64 等轴右、关阴影、枪口朝右）与 HUD（384×128 侧视、关阴影、枪口朝左）
- `tacz_model_validate`：组名、骨骼、UV、贴图尺寸自检

---

## 怎么用

跟它说需求就行：

```
给我做一把 KSG 泵动霰弹枪，12 号口径，14 发管式弹仓
```

总监会问清细节 → 派 researcher 找参考和参数 → 派 modeler 建模出图 → 派 data-smith 写数据 → 派 reviewer 审核 → 校验打包 → **你进游戏实测** → 通过才 `ack`。

阶段不能跳，`validation.ok=false` 不能打包，没有人工确认不能 `DONE`。

---

## 图标规格（官方口径）

| | 尺寸 | 视角 | 阴影 | 枪口朝向 |
|---|---|---|---|---|
| **slot** 槽位图 | 64×64 | 等轴视角右 | **关** | **朝右** |
| **HUD** 平面图 | 384×128（3:1） | 侧视 | **关** | **朝左** |

来源：官方 wiki `gun/display/03_hud`，并用官方默认枪包的 PNG 实测核对。

> 两张图都是**保留模型自身配色**的渲染，不是单色剪影。

---

## 目录结构

```
tacz-gunpack-studio/
├─ packages/
│  ├─ blockbench-mcp-tacz/       美术侧（GPL-3.0）
│  └─ dsh-tacz-gunpack/          数据侧（MIT）
├─ docs/                          枪包格式规范（已核对官方 wiki）
├─ LICENSES/                      两侧许可全文
├─ NOTICE.md                      双许可说明
├─ ABOUT.md                       项目说明
└─ README.md
```

---

## 安全说明

### `risky_eval` 默认关闭

它允许任何连上本地 MCP 端口的程序在 Blockbench 里执行**任意 JavaScript**。TACZ 工具链完全不需要它。

本插件做了两层保证：

1. **新装默认 `false`**（上游默认是 `true`）。
2. **升级强制关闭**：Blockbench 会把用户存过的旧值覆盖到默认值上，所以从旧版本升级过来的配置里 `risky_eval` 可能还是 `true`。插件首次加载时会检测并关闭它，然后写一个迁移标记，之后不再干预——你想开随时能在 **设置 → 通用** 里打开。

如果你需要执行自定义脚本，去 **设置 → 通用 → Risky Eval** 手动打开。

### 端点可改

Blockbench 侧的三个设置都在 **设置 → 通用**：

| 设置 | 默认 |
|---|---|
| `MCP Host` | `localhost` |
| `MCP Port` | `3000` |
| `MCP Endpoint` | `/bb-mcp` |

改了端口或路径之后，DSH 这边也要跟着改。两种方式：

- **插件配置**：给 `dsh-tacz-gunpack` 这一行加 `mcpUrl: "http://127.0.0.1:3001/custom"`
- **工具调用**：`tacz_install_mcp url="127.0.0.1:3001/custom" force=true`

`tacz_status` 会显示当前生效的 URL，方便你确认两边是否一致。

### 网络出口

只连三个地址：

| 目标 | 用途 | 发出去的内容 |
|---|---|---|
| `127.0.0.1:3000`（或你改的端点） | 本机 Blockbench | 工具调用 |
| Bing Images | 搜参考图 | **只有搜索词** |
| GitHub API | 取官方基准文件 | **只有仓库路径** |

**无遥测、无埋点、无远程执行、不上传工程数据。**

---

## 常见问题

**看不到 `mcp__blockbench__*` 工具？**
接线是自动的，先确认 Blockbench 正在运行、端口没改过。改过端口就跑 `tacz_install_mcp url="..." force=true`。然后开新会话。

**`tacz_status` 显示的 URL 和 Blockbench 设置不一致？**
profile 里的 `mcp-blockbench` 行是旧的。跑 `tacz_install_mcp url="..." force=true` 覆盖。

**升级后行为没变？**
Blockbench 和 DSH 都各重启一次，两者都会把旧版本留在内存。

**技能看起来还是旧的？**
插件加载时按字节比对自动刷新，旧版归档到 `<role>/versions/`。

**改枪界面里枪飞到天上？**
模型缺 `refit_*_view` 组。见 `docs/tacz-wiki-authority.md`。

**配件装不上？**
需要三样同时存在：`allow_attachment_types`、`allow_attachments` 标签、模型里的 `*_pos` 定位组。

---

## 许可

本项目**两半分开许可**，详见 [NOTICE.md](NOTICE.md)。

- **`packages/blockbench-mcp-tacz/` — GPL-3.0。** fork 自
  [jasonjgardner/blockbench-mcp-plugin](https://github.com/jasonjgardner/blockbench-mcp-plugin)，
  原作者 Jason J. Gardner。全文见 `LICENSES/GPL-3.0.txt`。
- **`packages/dsh-tacz-gunpack/` — MIT。** 原创，全文见 `LICENSES/MIT.txt`。
- **`docs/` — MIT。**

本项目**不包含**任何 TACZ 游戏资源、模型、贴图、音效或官方默认枪包。
`tacz_spec` 只在运行时从官方仓库取基准文件，缓存在本地，不随包分发。

---

## 致谢

- [TaCZ / Timeless and Classics Zero](https://github.com/MCModderAnchor/TACZ) — 模组本体与官方枪包规范
- [TaCZ Wiki](https://tacwiki.mcma.club/zh/gunpack) — 枪包格式文档，本项目规范的主要依据
- [jasonjgardner/blockbench-mcp-plugin](https://github.com/jasonjgardner/blockbench-mcp-plugin) — Blockbench MCP 插件上游
- [DeepSeek Harness](https://github.com/deepseek-ai) — Agent Teams 与插件运行时
