# 示例：KSG（Kel-Tec KSG 泵动霰弹枪）

一套**真实做出来并通过校验**的枪械工程文件，用来说明各阶段产物长什么样。
文档里凡是提到 `<gun>`、`ksg`、示例 JSON 的地方，都以这里的实物为准。

> 这不是模板，是案例。照抄结构，不要照抄尺寸 —— KSG 的比例是这一把枪的。

---

## 文件清单

| 文件 | 属于哪个阶段 | 是什么 |
|---|---|---|
| `design-brief.json` | RESEARCH | 调研简报：口径、容量、真实尺寸、参考图清单、部件拆分 |
| `ksg-blueprint.json` | BLUEPRINT | 施工清单：20 个部件 + 47 根骨骼，**不含几何** |
| `ksg.bbmodel` | GEOMETRY | Blockbench 工程本体：226 个方块、4 个组、256×256 UV 图集、贴图内嵌 |
| `ksg.animation.json` | GEOMETRY | 动画文件：Bedrock 1.8.0，12 个片段 |
| `ksg_state_machine.lua` | DATA | 状态机：泵动霰弹枪的换弹/上膛逻辑 |
| `ksg_display.json` | DATA | display 字段：model / texture / slot / hud / 动画 / 状态机 / 声音 / LOD |

---

## 1. design-brief.json

调研阶段的产物。gate 要求它有**非空 `parts`** 和同目录的 `manifest.json`（这里省略了 manifest，
真实项目里它记录每张参考图的来源 URL 和许可）。

它决定了后面所有阶段的口径：这是 12 号霰弹、双管弹仓、泵动、无托布局。

---

## 2. ksg-blueprint.json

**这是施工清单，不是代码输入。** 没有任何模块会把它编译成模型。

```json
{
  "gun_id": "ksg",
  "parts": [
    { "name": "Receiver / action housing", "bone": "receiver",
      "description": "黑色低饱和蓝灰聚合物机匣，Z≈-2.0..+6.25…", "cubes": [] }
  ],
  "bones": [
    { "name": "root", "parent": null, "pivot": [0,0,0] }
  ],
  "palette": ["#1b1b1b", "#3a3a3a"]
}
```

注意 `cubes` 是**空的** —— 实际这个文件里 20 个部件的 `cubes` 全为空，
几何信息写在 `description` 的自然语言描述里，由 modeler 在 Blockbench 里实现。

gate 只检查两件事：`parts` 非空、`bones` 非空。

它的真实用途：

- **modeler** 照着它知道有哪些部件、每个挂哪根骨骼；
- **reviewer** 照着它知道这枪该有的部件齐不齐。

---

## 3. ksg.bbmodel

Blockbench 工程。用 **文件 → 打开** 直接载入。

| 字段 | 值 |
|---|---|
| format_version | 5.0 |
| model_format | bedrock |
| resolution | 256×256 |
| elements | 226 |
| outliner 组 | 56 |
| textures | 1 张内嵌 base64（`ksg_uv`） |
| **animations** | **12 段**（已合并，见下） |

> 226 个方块，对比官方 ak47 高模 761、m870 273 —— 属于中等密度。
> 官方 LOD 是 25–50 cubes，这个工程另有独立 LOD 文件（未收录在此）。

### 动画已经合并进工程

**动画面板里直接能看到 12 段**，不需要额外导入。打开工程后按 `Ctrl`/`Cmd` + `T`
切到 **Animate** 标签即可。

> 早期的版本里 `ksg.bbmodel` 的 `animations` 是空的，动画只存在于独立的
> `ksg.animation.json`。Blockbench 的动画面板导入**读不了**裸 Bedrock 动画文件
> （它会提示“模型没有动画”），所以那些动画用
> [`tools/merge-bedrock-animation.mjs`](../../tools/merge-bedrock-animation.mjs) 转换合并进来了。

12 段清单：

```
animation.static_idle          loop  1.8s
animation.static_bolt_caught   loop  0.0417s
animation.shoot                once  0.8s
animation.bolt                 once  0.6s
animation.reload_intro_empty   once  1.8s
animation.reload_intro         once  0.4s
animation.reload_loop          once  0.5s
animation.reload_end           once  0.35s
animation.reload_empty         once  3.6s
animation.reload_tactical      once  2.65s
animation.inspect               once  3s
animation.inspect_empty         once  3s
```

---

## 4. ksg.animation.json

Bedrock 格式 1.8.0，12 个动画片段：

```
static_idle  static_bolt_caught  shoot  bolt
reload_intro_empty  reload_intro  reload_loop  reload_end
reload_empty  reload_tactical  inspect  inspect_empty
```

骨骼是 `AKM` / `lefthand` / `righthand` / `pump` / `trigger` / `camera` / `tube_selector` / `loading_gate_L`。

**注意片段名必须和状态机里的 `runAnimation(...)` 对得上**，这是最常见的“动画不播”原因。
`bolt` 这个名字是泵动/栓动专用（**不是** `bolt_action`）。

### 为什么单独留这个文件

它是 TACZ 枪包真正需要分发的文件（游戏读的是
`assets/<ns>/animations/<id>.animation.json`，不是 `.bbmodel`）。
保留它有两个作用：

1. 让你看到**游戏侧原始格式**长什么样；
2. 它和 bbmodel 里的 12 段是同一份数据的两种表示，可以拿来对照。

如果你改了 bbmodel 里的动画，记得同步回这个文件（游戏不读 bbmodel）。

---

## 5. ksg_state_machine.lua

泵动霰弹枪的状态机。管式/双管枪如果没有自定义 Lua，
`reload.type: manual` **不会**补弹 —— 必须像这样写状态机，或者用 `magazine` 类型。

---

## 6. ksg_display.json

display 字段的完整示例。几个容易错的点：

```json
{
  "model": "keltec:gun/ksg_geo",           // 枪带 _geo 后缀
  "texture": "keltec:gun/uv/ksg",
  "slot": "keltec:gun/slot/ksg",           // 64×64，枪口朝右
  "hud": "keltec:gun/hud/ksg",             // 384×128，枪口朝左
  "animation": "keltec:ksg",               // 这里不写 .animation 后缀
  "state_machine": "keltec:ksg_state_machine",  // 不写 .lua 后缀
  "use_default_animation": "rifle",        // 可选回退，不是必需
  "lod": { "model": "keltec:gun/lod/ksg", "texture": "keltec:gun/lod/ksg" }
}
```

对照：

| 引用 | 磁盘上的文件 |
|---|---|
| `model: keltec:gun/ksg_geo` | `assets/keltec/geo_models/gun/ksg_geo.json` |
| `texture: keltec:gun/uv/ksg` | `assets/keltec/textures/gun/uv/ksg.png` |
| `animation: keltec:ksg` | `assets/keltec/animations/ksg.animation.json` |
| `state_machine: keltec:ksg_state_machine` | `assets/keltec/scripts/ksg_state_machine.lua` |

> 弹药不一样：弹药模型是 `geo_models/ammo/<id>.json`，**不带** `_geo`。

---

## 这个示例的校验状态

**本目录不是完整枪包**，只收录了文档和建模工程文件，没有收 PNG 和导出的 geo JSON。
所以直接对这里的文件跑 `verifyPack()` 会报 6 条“missing” —— 那是预期内的，
因为 display 引用的贴图、图标、geo、LOD 都不在这个目录里。

完整包（含全部 PNG 与 geo）当时的状态是：

```
ok        : true
checked   : 10 个引用
errors    : 0
warnings  : 1 条（sounds 的 6 个 key 未做文件系统校验，属预期）
fingerprint: 0ee9c56e…
```

要真正校验，得先把 `ksg.bbmodel` 在 Blockbench 里导出成 `geo_models/gun/ksg_geo.json`
和对应的 UV / slot / HUD PNG，再跑 `tacz_verify`。

---

## 想拿它当起点

1. 复制 `ksg.bbmodel`，另存为你的 `<gun>.bbmodel`，改几何和贴图。
2. 照着 `ksg-blueprint.json` 的结构写你自己的施工清单（`parts` / `bones` 非空即可）。
3. 动画和状态机可以复用结构，但**片段名、骨骼名要跟你的模型一致**。
4. display 照抄字段结构，把 namespace 和 `<gun>` 换掉。

**不要**把 KSG 的尺寸直接套到别的枪上 —— 长度、宽度、导轨齿型都是按 KSG 的真实尺寸算的。
