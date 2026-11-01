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

### 架构一览

```
┌─────────────────────────┐        ┌─────────────────────────┐
│  DeepSeek Harness       │        │  Blockbench 5.2+        │
│  数据侧（MIT）           │        │  美术侧（GPL-3.0）       │
│                         │        │                         │
│  tacz_build   构建控制器 │        │  tacz_pack   建包/校验   │
│  tacz_verify  交叉校验   │        │  tacz_gun    建枪/导出   │
│  tacz_item    弹药配件   │        │  tacz_ammo   弹药美术    │
│  tacz_spec    官方基准   │        │  tacz_attachment 配件美术│
│  tacz_skill   自学习     │        │  tacz_icon_render 图标   │
│  tacz_reference 参考图   │        │  tacz_model_validate     │
│                         │        │  tacz_texture_init       │
│  写 JSON                │        │  写 geo/PNG/bbmodel      │
└───────────┬─────────────┘        └───────────▲─────────────┘
            │                                  │
            │  MCP client  ─── HTTP ─── MCP server
            │  http://127.0.0.1:3000/bb-mcp
            ▼                                  │
     DSH 的 Agent Teams 六个角色 ──────────────┘
```

- **DSH 是 MCP client，Blockbench 是 MCP server**，走 `streamable-http`。
- 端点可改（`mcp_host` / `mcp_port` / `mcp_endpoint`），DSH 侧用 `mcpUrl` 或 `tacz_install_mcp` 跟随。
- 两个插件**不共享文件所有权**，也不互相 import。

### 版本兼容

| 组件 | 要求 | 说明 |
|---|---|---|
| Blockbench | **5.2+**（基准 5.2.2） | 见下方说明 |
| DeepSeek Harness | `>=0.2.1-rc.5 <0.3.0` | 写在 `engines.dsh` |
| Node.js | `>=20` | DSH 插件用 |

Blockbench 侧对版本敏感的地方（都已做兼容或已实测）：

| API | 5.0–5.1 | 5.2+ | 本插件做法 |
|---|---|---|---|
| `Settings.set` | 有 | **已移除** | `writeSetting()` 双路径：有就用，没有就写 `Settings.stored[id].value` + `Settings.save()` |
| `createKeyframe` | 未实测 | `(values, time, channel, undo, select)` | 按 5.2.2 签名调用 |
| `Timeline.snapTime` | 未实测 | `snapping` 被 clamp 到 1–120 | 导入时设 `snapping: 120` |
| `getClientVersion` | 有 | 有 | 轮询等待，不依赖 `notifications/initialized` |

---

## 安装

> 全程约 3 分钟。**先装 Blockbench 那一半，再装 DSH 那一半** —— 顺序反了 DSH 会自动接线失败。

### 前置要求

| 组件 | 最低版本 | 说明 |
|---|---|---|
| **Blockbench** | **5.2.0**（实测 5.2.2） | 桌面版，需开启插件目录写入权限 |
| **DeepSeek Harness** | **0.2.1-rc.5**（`<0.3.0`） | 写死在 `engines.dsh` |
| **Node.js** | 20+ | 仅 DSH 插件运行时需要 |

> 为什么不是 Blockbench 5.0+：`Settings.set` 在 5.2 被移除（本插件已双路径兼容），
> 但动画导入依赖 `createKeyframe(values, time, channel, undo, select)` 的签名和
> `snapping` 的 1–120 上限，这些在 5.x 各版本间不保证一致。5.0/5.1 **未实测**，
> 所以不声称支持。

---

### 第 1 步：Blockbench 装插件

**方式 A — 从 URL 安装（推荐）**

在 Blockbench 里点 **文件 → 插件 → 从 URL 安装**，粘贴：

```
https://github.com/xiaoou6630/tacz-gunpack-studio/raw/main/packages/blockbench-mcp-tacz/dist/mcp.js
```

**方式 B — 手动放文件**

下载 [dist/mcp.js](packages/blockbench-mcp-tacz/dist/mcp.js)，放进对应目录：

| 系统 | 插件目录 |
|---|---|
| Windows | `%APPDATA%\Blockbench\plugins\` |
| macOS | `~/Library/Application Support/Blockbench/plugins/` |
| Linux | `~/.config/Blockbench/plugins/` |

**装完必须完全退出 Blockbench 再打开。** 插件只在启动时加载一次。

> 5.2.2 只加载 `installed_plugins` 里登记过的本地插件，**不扫描 plugins 目录**。
> 如果是方式 B 且插件面板里没出现，用 **文件 → 插件 → 从文件加载** 再选一次 `mcp.js`。

---

### 第 2 步：DeepSeek Harness 装插件

在 DSH 里点 **插件 → 添加插件**，填仓库地址：

```
https://github.com/xiaoou6630/tacz-gunpack-studio
```

- 国内网络勾选 **中国大陆镜像源**。
- 装完**完全退出 DSH 再打开**。
- 新建会话时在模式选择里挑 **「TACZ 枪包工坊」**。

> 装的是仓库根目录（`package.json` 在根），不是 `packages/` 子目录。

---

### 第 3 步：接线（自动，无需手动操作）

插件加载时会把 Blockbench 的 MCP 端点写进当前 DSH profile，并自动备份原文件：

```
[dsh-tacz-gunpack] Blockbench MCP row installed into .../cordis.patch.yml
                   (backup: ...bak-tacz-...)
```

**这一步的前提是 Blockbench 已经在跑。** 如果 DSH 先装、Blockbench 后开，接线时探测不到端口，
手动补一次即可：

```
tacz_install_mcp force=true
```

改过端口或路径的话：

```
tacz_install_mcp url="127.0.0.1:3001/custom" force=true
```

不想自动接线：插件配置加 `autoInstallMcp: false`。

---

### 第 4 步：验证

在 DSH 新会话里跑：

| 检查 | 命令 | 期望 |
|---|---|---|
| 插件状态 | `tacz_status` | 六个角色；`blockbench_tool_count` **≥ 9**；`blockbench_mcp_url` 与 Blockbench 设置一致 |
| 预设注册 | `tacz_install_preset` | `registered: true` |
| 美术侧连通 | `tacz_template_list` | 返回 7 类枪的模板 |
| 行为正确 | 说「做个霰弹枪」 | 总监**先反问**口径/型号/是否要动画 |

Blockbench 侧另看：**设置 → 通用** 里应出现 `MCP Host` / `MCP Port` / `MCP Endpoint` 三项。

---

### 装不上怎么排查

| 现象 | 原因 | 解法 |
|---|---|---|
| Blockbench 插件面板里没有 MCP | 文件没进 `installed_plugins` | **文件 → 插件 → 从文件加载** 选 `mcp.js` |
| 端口 3000 没监听 | `onload` 抛异常中断 | 查 Blockbench 控制台；确认版本 ≥ 5.2 |
| `mcp__blockbench__*` 工具不出现 | 接线没执行或 DSH 没重启 | 跑 `tacz_install_mcp force=true`，重启 DSH |
| 工具调用报 `Session not found` | Blockbench 重启过，旧 session 失效 | **重启 DSH**（不是重启 Blockbench） |
| 动画面板显示 0 | 工程里没有 `animations[]` | `tacz_gun action="open"` 重新打开，它会读 `*.animation.json` |

---

## 引用的 API

**这一节是可核查的清单，不是宣传。** 每一项都能在源码里 grep 到。

### Blockbench 侧（`packages/blockbench-mcp-tacz/`）

上游 fork 自 [jasonjgardner/blockbench-mcp-plugin](https://github.com/jasonjgardner/blockbench-mcp-plugin)。
完整变更声明见 [`SOURCE.txt`](packages/blockbench-mcp-tacz/SOURCE.txt)（GPL-3.0 §5(a) 要求）。

**调用的 Blockbench API：**

| 类别 | API |
|---|---|
| 插件生命周期 | `BBPlugin.register`、`onload` / `onunload` / `oninstall` / `onuninstall` |
| 设置 | `Settings.get`、`Settings.save`、`Settings.stored`、`Settings.set`（仅 5.0–5.1） |
| 原生模块权限 | `requireNativeModule("net" \| "fs" \| "process")` |
| 工程 | `newProject`、`Project`、`Formats`、`Format` |
| 几何 | `Group`、`Cube`、`Outliner`、`Canvas`、`Texture` |
| 动画 | `Animation`、`AnimationCodec.codecs.bedrock`、`Animator`、`animator.createKeyframe`、`animator.addToTimeline`、`Keyframe.get/set`（**间接**：设置 `Animation.snapping` 让 Blockbench 内部走 `Timeline.snapTime`，本插件不直接调用它） |
| 导入导出 | `Codecs.bedrock`、`Blockbench.read`、`Blockbench.writeFile`、`Blockbench.export` |
| UI | `Setting`、`Panel`、`BarItems`、`Blockbench.addCSS`、`Blockbench.showQuickMessage`、`tl()` |
| MCP 服务器 | `WebStandardStreamableHTTPServerTransport`（`server/net.ts` 直接 `new` 它）、`McpServer`、`server.getClientVersion`、`oninitialized` |

**对上游的修改（全部）：**

| 项 | 改了什么 |
|---|---|
| 新增工具 | `tacz_pack` `tacz_gun` `tacz_ammo` `tacz_attachment` `tacz_icon_render` `tacz_model_validate` `tacz_guide` `tacz_template_list` `tacz_texture_init` |
| 新增模块 | `lib/tacz/items.ts`、`lib/tacz/model.ts`、`lib/tacz/templates.ts`、`lib/tacz/constants.ts` |
| `risky_eval` | 默认 `true` → **`false`**，并加一次性迁移关掉旧安装里的 `true` |
| `mcp_session_timeout` | 默认 `30` → **`1440`** 分钟，并加一次性迁移 |
| 会话显示 | 从 `getClientVersion()` 取客户端名，面板不再只显示哈希 |
| `tacz_gun open` | 额外读取 `assets/<ns>/animations/<id>.animation.json` 并导入动画 |
| 图标渲染 | 支持 flat/iso、目标尺寸、水平翻转 |
| 枪械模板 | 补 `refit_*_view` 定位组 |
| 文案 | TACZ 工作流 prompt 与 about 页重写 |

**版本敏感行为**（详见 [`docs/`](docs/)）：

- `Settings.set` 在 5.2 被移除 → `writeSetting()` 回退到 `Settings.stored[id].value` + `Settings.save()`
- `Timeline.snapTime` 把 `snapping` **clamp 到 1–120** → 导入动画时把 `Animation.snapping` 设为 120（本插件不直接调 `snapTime`，是设 `snapping` 让 Blockbench 内部用它）
- `createKeyframe` 签名是 **`(values, time, channel, undo, select)`** → 传错参数会静默失败

### 数据侧（`packages/dsh-tacz-gunpack/`）

原创，MIT。**调用的 DSH 插件 API：**

| API | 用途 |
|---|---|
| `ctx.tools.register` | 注册 10 个 `tacz_*` 工具 |
| `ctx.agentPresets.register` | 注册「TACZ 枪包工坊」模式 |
| `ctx.effect` | 工具随插件卸载自动注销 |
| `ctx.get` | 读取工作目录、会话等服务 |
| `ctx.logger` | 日志 |

**不调用**（避免夸大）：`ctx.mcp`、`ctx.plugin`、任何模型 provider 私有接口。

---

## 缓存友好与工具披露（现状说明）

网上流传「DeepSeek 有个隐藏参数能极大提升缓存命中」，这个说法需要拆开讲清楚。

**DSH 里真实存在的机制**（在 `app.asar` 里可查）：

| 机制 | 位置 | 说明 |
|---|---|---|
| `additional_tools` 消息 | LLM 适配层 | `type: "additional_tools"`、`role: "developer"`，中途新增工具而不重写整个 tools 数组 |
| `toolUpdate: "addition-only"` | provider 能力表 | 工具更新模式，只有声明支持时才启用 |
| `supportsAdditionalTools` | provider compat gate | **默认 `withhold`（不启用）**，需 provider 显式声明 |
| `cache_control` / `ephemeral` | Anthropic 兼容层 | 提示词缓存标记 |

**关键事实：** 本机当前用的是 **`trae` provider**（`dsh-connect-trae@4.6.11`），
在它的 `lib/index.js` 里搜 `supportsAdditionalTools`、`toolUpdate`、`additional_tools`
**均为 0 次命中** —— 它没有声明这些能力，所以 DSH 走的是普通工具列表更新，
**拿不到 `addition-only` 的缓存优势**。

**要真正启用，需要：**

1. provider 在能力表里声明 `supportsAdditionalTools: true`（或 `supportsToolSearch: true`）
2. 模型侧支持 `developer` 角色的 `additional_tools` 消息

这两条都**不在本插件的控制范围**，属于 provider / 模型能力。本插件不声称能用上它。

> 本插件确实在降低 token 消耗，但靠的是另一件事：**确定性状态机**。
> `tacz_build` 把进度落盘到 `.tacz/builds/<gun>.json`，会话中断可 `resume`，
> 不需要把整段历史重新塞进上下文。这比缓存命中更直接。

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
├─ examples/ksg/                  真实案例：KSG 工程文件 + 动画 + 状态机 + display
├─ docs/                          枪包格式规范（已核对官方 wiki）
├─ LICENSES/                      两侧许可全文
├─ NOTICE.md                      双许可说明
├─ ABOUT.md                       项目说明
├─ CONTRIBUTORS.md                贡献者与 AI 署名说明
└─ README.md
```

> `examples/ksg/` 是**真做出来并通过校验**的枪，文档里的 `<gun>` 示例都以它为准。
> 含 Blockbench 工程（226 cubes）、12 段动画、状态机、display 和调研简报。

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

**导入 `.animation.json` 后动画面板显示 0？**
Blockbench 的动画面板导入读的是 **bbmodel 里已合并的 `animations[]`**，不是裸 Bedrock
动画文件。TACZ 游戏侧用的是 `assets/<ns>/animations/<id>.animation.json`，两种格式要转换。

`tacz_gun action="open"` 会**自动**读取该文件并把 12 段动画导入当前工程（需要插件 1.10.1-tacz.2+）。
如果工程是从旧版本打开的，重新 `open` 一次即可。

手动合并也可以用 [`tools/merge-bedrock-animation.mjs`](tools/merge-bedrock-animation.mjs)：

```
node tools/merge-bedrock-animation.mjs <model>.bbmodel <id>.animation.json
```

转换规则（rotation 的 x/y 取反、position 的 x 取反）直接来自 Blockbench 自己的
`compileBedrockKeyframe`，并做过往返验证。

**Blockbench 5.2.2 上插件不加载 / MCP 端口 3000 没起来？**
5.2.2 移除了 `Settings.set`。旧构建的 `risky_eval` 迁移在 `onload` 里调用它会抛异常，
整个插件加载中断，MCP 服务器随之不启动。1.10.1-tacz.2 起改用版本安全的写法
（`Settings.set` 存在就用，否则写 `Settings.stored[id].value` + `Settings.save()`）。
另外 5.2.2 只加载 `installed_plugins` 里登记过的本地插件，不扫描 `plugins/` 目录，
所以升级后需要在 **文件 → 插件 → 从文件加载** 重新装一次。

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

## 贡献者

- [@xiaoou6630](https://github.com/xiaoou6630)
- **DeepSeek**（DeepSeek Harness · `deepseek-v4.1-flash`）

**关于 GitHub 侧栏只显示 1 位贡献者：** GitHub 的 Contributors 侧栏由服务端计算，只统计
**提交邮箱绑定到真实 GitHub 账号**的提交。`deepseek` / `deepseek-ai` 都是 **Organization**
（组织不能作为提交作者），`noreply@deepseek.com` 也未绑定任何账号，因此无法计入。
详见 [CONTRIBUTORS.md](CONTRIBUTORS.md)，其中记录了实测证据和 `anthropics/claude-code`、
`google-gemini/gemini-cli` 等仓库的对照做法。

## 致谢

- [TaCZ / Timeless and Classics Zero](https://github.com/MCModderAnchor/TACZ) — 模组本体与官方枪包规范
- [TaCZ Wiki](https://tacwiki.mcma.club/zh/gunpack) — 枪包格式文档，本项目规范的主要依据
- [jasonjgardner/blockbench-mcp-plugin](https://github.com/jasonjgardner/blockbench-mcp-plugin) — Blockbench MCP 插件上游
- [DeepSeek Harness](https://github.com/deepseek-ai) — Agent Teams 与插件运行时
