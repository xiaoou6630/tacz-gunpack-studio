# 做枪的流程是怎么被管住的

## 为什么要有流程

让 AI 自由发挥做一把枪，会遇到这些问题：

- 它说"做完了"，其实少了个文件
- 你中途关掉会话，进度全丢
- 审核说"没问题"，但模型其实改过了
- 它自己打包交付，你进游戏才发现装不上

所以这里用了一个"卡流程"的工具 `tacz_build`：**AI 只负责产出文件，工具负责检查文件、推进进度。**

进度存在 `.tacz/builds/<枪名>.json`，随时可以接着做。

---

## 九个阶段，不能跳

```
建目录 → 调研 → 画施工图 → 建模 → 写数据 → 审核 → 打包 → 你试 → 完成
```

| 阶段 | 谁负责 | 必须交出来的东西 |
|---|---|---|
| **建目录** | 总监 | 枪包目录、`gunpack.meta.json`、命名空间 |
| **调研** | 调研员 | `refs/<型号>/design-brief.json`（真实尺寸、口径、部件清单）+ 同目录的参考图清单 |
| **画施工图** | 建模 | blueprint JSON：有哪些部件、挂哪根骨骼 |
| **建模** | 建模 | `.bbmodel` 工程 + 导出的 geo + UV 贴图 + 槽位图 + display |
| **写数据** | 数据 | index / data / display 三份 JSON |
| **审核** | 审核 | `reviews/<枪名>.json`，结论通过且绑定当前文件指纹 |
| **打包** | 总监 | `output/<枪名>.zip`，且交叉校验通过 |
| **你试** | **你** | 进游戏试持握、开火、换弹、动画、图标 |
| **完成** | **你** | 明确确认通过 |

**每一关都会真的去磁盘上查文件，不看 AI 说了什么。**

---

## 审核为什么要绑定指纹

这是整套流程里最关键的一环。

审核报告里有个字段叫 `pack_hash`，记录的是"我审的是哪一版"。工具在放行时会重新算一遍当前文件的指纹：

- 对得上 → 审核有效
- 对不上 → 审核**自动失效**，退回重审

这样就不会出现"审核说没问题，但模型后来改了贴图"的情况。

---

## 常用操作

```
# 开一个新枪的流程
tacz_build action="init" gun_id=ksg pack_dir=... type=shotgun

# 看现在到哪一步了
tacz_build action="status" gun_id=ksg

# 只检查当前这关能不能过，不推进
tacz_build action="gate" gun_id=ksg

# 推进一关（必须是对应负责人）
tacz_build action="advance" gun_id=ksg stage=GEOMETRY owner=modeler

# 卡住了，修好之后重试
tacz_build action="resume" gun_id=ksg

# 模型改过了，退回建模阶段重做
tacz_build action="reopen" gun_id=ksg stage=GEOMETRY note="换了枪管"

# 你进游戏试完，确认通过
tacz_build action="ack" gun_id=ksg confirmed=true note="游戏内正常"
```

几个容易踩的点：

- **`advance` 必须报当前阶段和对应负责人**，报错了直接拒绝
- **`gate` 是只读的**，跑完不改任何东西，适合"我现在能不能过"的预检
- **`reopen` 只能往回退**，往前推用 `advance`
- **`ack` 只能在"你试"之后执行**，没有你的确认，流程永远到不了"完成"

---

## 施工图（blueprint）到底写什么

`models/<枪名>-blueprint.json`，这个名字容易让人以为是"模型"，其实不是。

**它是施工单，不是模型。**

```json
{
  "gun_id": "ksg",
  "parts": [
    {
      "name": "机匣",
      "bone": "receiver",
      "cubes": [],
      "description": "黑色低饱和蓝灰机匣，Z 约 -2.0 到 +6.25，宽约 ±1.625"
    }
  ],
  "bones": [
    { "name": "root", "parent": null, "pivot": [0, 0, 0] }
  ]
}
```

三条规则：

1. **`cubes` 永远留空。** 写进去的几何没有任何代码会读，也不等于建模。
2. **尺寸写在 `description` 里**，用自然语言，给建模的人看。
3. **`parts` 和 `bones` 必须非空**，工具只检查这两项。

> 参考实物：[`examples/ksg/ksg-blueprint.json`](../examples/ksg/ksg-blueprint.json)
> —— 20 个部件、47 根骨骼，`cubes` 全空，几何描述写在 `description`。

---

## 审核报告写什么

`reviews/<枪名>.json`：

```json
{
  "ok": true,
  "blockers": [],
  "majors": [],
  "minors": [],
  "pack_hash": "<交叉校验返回的指纹>",
  "summary": "形状、贴图、数据、图标都通过；实机待验"
}
```

- `ok=true` 只在 `blockers` 为空时成立
- 发现阻塞问题就 `ok=false`，并把问题列进 `blockers`，流程会停在审核阶段
- `pack_hash` 必须和当前文件指纹一致，否则不放行

---

## 和"让 AI 自己随便做"的区别

| 放任 AI 自己做 | 卡流程之后 |
|---|---|
| AI 说完成了，其实没完成 | 工具去磁盘上查，不听它说 |
| 你中途关掉，进度全丢 | 进度存盘，随时接着做 |
| 审核口头说过了 | 审核绑定文件指纹，改一字节就失效 |
| 模型改完，旧审核还算数 | 指纹不匹配，自动拦住 |
| AI 自己就打 zip 交付 | 打包没通过，不许进下一步 |
| 没人试过就宣布完成 | 必须你本人确认才算完 |

这套做法借鉴的是工程上通用的"产物驱动 + 门禁 + 可恢复"，不是某个具体项目的代码。
设计取舍见 [为什么不能一键生成](why-not-one-shot.md)。
