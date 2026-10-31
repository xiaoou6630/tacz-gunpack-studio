# 为什么不做一键生成（以及那个“确定性”到底确定在哪）

## 1. 先说清楚：没有“编译器”

`tacz_build` 的 BLUEPRINT 阶段要求 modeler 产出 `models/<gun>-blueprint.json`，
但**没有任何代码把它编译成几何**。检查 `packages/dsh-tacz-gunpack/lib/` 全部模块：

| 模块 | 干什么 |
|---|---|
| `build-state.mjs` | 状态机、gate、blocked/resume、人工确认 |
| `verify-pack.mjs` | 交叉校验引用 + 算包指纹 |
| `official-spec.mjs` | 解析官方基准 |
| `items.mjs` / `roles.mjs` / `skills.mjs` / … | 弹药配件数据、角色、技能 |

没有 `compileBlueprint()`，也没有任何东西消费 `blueprint.parts[].cubes`。

所以 blueprints 的真实作用是**两份东西的交接契约**：

1. **给 modeler 自己的施工清单** —— 写清楚有哪些部件、每个部件挂哪根骨骼、大致尺寸。
2. **给 reviewer 的对照依据** —— 审核时能看出“这枪该有的部件齐不齐”。

它**不是**代码输入。modeler 拿到 blueprint 之后，仍然是在 Blockbench 里手工/工具建几何。

> 如果文档别处让你以为 blueprint 会被自动编译成模型，那是错的。

---

## 2. “确定性”确定在哪

真正确定的是**流程和验收**，不是几何形状。

| 环节 | 确定性 | 靠什么 |
|---|---|---|
| 阶段推进 | **确定** | `BUILD_STAGES` 数组 + `NEXT_STAGE` 映射，只能按序走 |
| 谁能推进 | **确定** | `STAGE_OWNERS`，owner 不匹配直接抛错 |
| 产物是否合格 | **确定** | `gateFor(state)` 逐项读磁盘，不看 agent 的话 |
| review 是否还有效 | **确定** | `review.pack_hash` 必须等于当前 `verifyPack().fingerprint` |
| 失败后能否续 | **确定** | 状态落盘 `.tacz/builds/<gun>.json`，`resume` 重跑 gate |
| 能否算完工 | **确定** | 只有 `ack confirmed=true` 才进 `DONE` |
| 几何好不好看 | **不确定** | 审美判断，留给人 |

一句话：**机械劳动（对路径、写 JSON、跑校验、卡流程）确定化；审美（比例、手感、配色）留给人。**

---

## 3. 为什么不做一键生成

### 理由一：枪的形状是审美，不是参数

一把枪“像不像”取决于：

- 机匣和枪管的**比例关系**
- 导轨的**齿型与节奏**
- 贴图的**明暗交界**和饱和度
- 第一人称下的**手位和视差**

这些没法从 JSON 参数算出来。全自动出来的东西，形状对了，但看着是“方块拼的”。

### 理由二：TACZ 的失败模式几乎都在细节

实际踩过的坑：

| 症状 | 真实原因 |
|---|---|
| 改枪界面枪飞到天上 | 模型缺 `refit_*_view` 组 |
| 配件装不上 | `allow_attachment_types` / `allow_attachments` 标签 / `*_pos` 定位组，三缺一 |
| 动画不播 | display 里写了 `.animation` 后缀，或片段名和状态机的 `runAnimation()` 对不上 |
| 弹药模型 404 | 弹药路径是 `geo_models/ammo/<id>.json`，**不带** `_geo`，但枪是 `gun/<id>_geo.json` |
| slot 图糊 | 拿 384×128 的 HUD 当 64×64 用，或者没关阴影 |

这些靠“生成器猜”是猜不中的，必须逐条对照官方基准。

### 理由三：美术和数据必须能分开改

data-smith 改 display 字段之后，modeler 重导出几何**不能**把 JSON 冲掉。
所以导出必须带 `preserve_docs=true` / `art_only=true`。

如果做成一个“一键生成”，两边就会互相覆盖，而且没人知道是哪一步覆盖的。

---

## 4. 那到底自动化了什么

| 自动化 | 工具 |
|---|---|
| 建包骨架、校验、打包 | `tacz_pack` |
| 建枪工程、导出 geo/UV/slot/HUD | `tacz_gun` |
| 弹药/配件模型与图标 | `tacz_ammo` / `tacz_attachment` |
| 按官方口径出图标 | `tacz_icon_render`（slot 64×64 等轴右关阴影枪口右；HUD 384×128 侧视关阴影枪口左） |
| 写 index/data/display/lang/配方/标签 | `tacz_item` |
| 交叉校验所有引用 | `tacz_verify` |
| 卡阶段、卡产物、卡人工验收 | `tacz_build` |
| 取官方基准 | `tacz_spec` |
| 从审核缺陷提炼经验并改写技能 | `tacz_skill` |

人负责：**决定做哪把枪、形状像不像、手感对不对、进游戏验收。**

---

## 5. 和“自由 Lead”比，controller 到底解决了什么

| 自由 Lead 的问题 | controller 的做法 |
|---|---|
| agent 说“完成了”，其实没完成 | `gateFor()` 重新读磁盘上的文件，不看 agent 的总结 |
| 用户中途停掉，进度全丢 | 状态写在 `.tacz/builds/<gun>.json`，随时 `resume` |
| review 口头说“过了” | `review.pack_hash` 绑死版本，改一个字节就失效 |
| 模型改完，旧 review 还算数 | 同上，hash 不匹配 → gate 不过 |
| agent 自己就打 zip 交付 | 只有 PACKAGE gate 过了才进 READY |
| 没人真进游戏试过就宣布完成 | READY 之后必须人工 `ack confirmed=true` |

这套机制借鉴的是**工程控制论意义上的“产物驱动 + 门禁 + 可恢复”**，不是某个具体项目的代码。
`docs/tacz-build-controller.md` 里逐阶段列了每个 gate 的具体检查项，以那份为准。
