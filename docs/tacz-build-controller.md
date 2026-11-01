# TACZ build controller

一个目标生成一整套枪包，靠的不是“更自由的 Lead”，而是一个确定性的 controller：agent 只产 artifact，controller 重读 artifact、跑 gate、推进状态；失败就 `BLOCKED`，人能 `resume`。

入口：`tacz_build`。状态文件：`<project>/.tacz/builds/<gun>.json`。

## 1. 状态机

```text
INIT → RESEARCH → BLUEPRINT → GEOMETRY → DATA → REVIEW → PACKAGE → READY → DONE
```

| Stage | Owner | 必须存在的 artifact / gate |
|---|---|---|
| `INIT` | lead | `gunpack.meta.json` 已存在且 namespace 非空；`pack_dir` 在 `project_root` 之内 |
| `RESEARCH` | researcher | `refs/<slug>/design-brief.json` + 同目录 `manifest.json`；brief 有非空 `parts`，`gun_id` 匹配 |
| `BLUEPRINT` | modeler | blueprint JSON 有非空 `parts` 和 `bones` |
| `GEOMETRY` | modeler | `models/<gun>.bbmodel`；`geo_models/gun/<gun>_geo.json`、`textures/gun/uv/<gun>.png`、`textures/gun/slot/<gun>.png`、`display/guns/<gun>_display.json` 存在；`tacz_verify.ok=true` |
| `DATA` | data-smith | `index/guns/<gun>.json`、`data/guns/<gun>_data.json`、`display/guns/<gun>_display.json` 存在；`tacz_verify.ok=true` |
| `REVIEW` | reviewer | `reviews/<gun>.json`：`ok=true`、`blockers=[]`、`pack_hash` 等于当前 pack fingerprint；`tacz_verify.ok=true` |
| `PACKAGE` | lead | `output/<gun>.zip` 非空；`tacz_verify.ok=true` |
| `READY` | human | 人工进游戏验持握/开火/换弹/动画/图标 |
| `DONE` | human | `tacz_build action="ack" confirmed=true` |

**blueprint 文件名的容错**：`gateFor()` 按这个顺序找，命中即用 ——
`models/<gun>-blueprint.json`、`models/<gun>.blueprint.json`、`docs/<gun>-blueprint.json`。

**review 文件的容错**：先找 `reviews/<gun>.json` 和 `reviews/<gun>-review.json`，
都没有再到 `refs/*/review.json` 或 `refs/*/review-<gun>.json`。

`REVIEW` 的 `pack_hash` 是关键：reviewer 看过哪一版，就只能接受那一版。modeler 之后改了 geo/贴图，hash 变了，review 自动失效。

## 2. 命令

`tacz_build` 的 `action` 实际支持七个：

```text
tacz_build action="init" project_root=... pack_dir=... gun_id=ksg type=shotgun
tacz_build action="status" gun_id=ksg
tacz_build action="gate" gun_id=ksg                       # 只跑当前阶段的 gate，不推进
tacz_build action="advance" gun_id=ksg stage=INIT owner=lead
tacz_build action="advance" gun_id=ksg stage=RESEARCH owner=researcher
tacz_build action="advance" gun_id=ksg stage=BLUEPRINT owner=modeler
tacz_build action="advance" gun_id=ksg stage=GEOMETRY owner=modeler
tacz_build action="advance" gun_id=ksg stage=DATA owner=data-smith
tacz_build action="advance" gun_id=ksg stage=REVIEW owner=reviewer
tacz_build action="advance" gun_id=ksg stage=PACKAGE owner=lead
tacz_build action="resume" gun_id=ksg                     # gate 失败修好后重跑
tacz_build action="reopen" gun_id=ksg stage=GEOMETRY      # 回到更早阶段，note=原因
tacz_build action="ack" gun_id=ksg confirmed=true note="in-game ok"
```

- `advance` 只接受**当前** stage 和合法 owner；stage 不对或 owner 不对直接报错。
- `gate` 是只读的：跑一遍检查、返回结果，不动状态文件。适合“我现在能不能过”的预检。
- `gate` 不过时 `advance` 会把 state 变 `blocked`，`blocked_reason` 写清楚；修好后 `resume`。
- `reopen` 只能往回走，不能往前（往前用 `advance`）。用于模型改了、旧 review 失效这类情况。
- `status` 返回当前 gate 的每个 check + pack fingerprint。
- `ack` 只能在 `READY` 后执行；没有人工确认不能 `DONE`。

## 3. Blueprint 格式

`models/<gun>-blueprint.json`：

```json
{
  "gun_id": "ksg",
  "parts": [
    {
      "name": "receiver",
      "bone": "receiver",
      "cubes": [],
      "description": "黑色低饱和蓝灰机匣，Z≈-2.0..+6.25，宽约 ±1.625"
    }
  ],
  "bones": [
    { "name": "root", "parent": null, "pivot": [0, 0, 0] },
    { "name": "receiver", "parent": "root", "pivot": [0, 5, 0] }
  ],
  "palette": ["#1b1b1b", "#3a3a3a"]
}
```

这是 **modeler 的施工清单 + reviewer 的对照依据**，不是代码输入。
**没有任何模块会把 blueprint 编译成几何** —— modeler 拿到它之后，仍然是在 Blockbench 里建模。

`parts[].cubes` **永远留空**。gate 只检查 `parts` 和 `bones` 非空，没有任何代码读 `cubes`；
把 `from`/`to` 写进去不代表建模，几何只在 Blockbench 里建。
详见 [why-not-one-shot.md](why-not-one-shot.md) 第 1 节。

> 实物参考：[`examples/ksg/ksg-blueprint.json`](../examples/ksg/ksg-blueprint.json)
> —— 20 个部件、47 根骨骼，`cubes` 全为空，几何写在 `description` 里。

## 4. Review artifact

`reviews/<gun>.json`：

```json
{
  "ok": true,
  "blockers": [],
  "majors": [],
  "minors": [],
  "pack_hash": "<tacz_verify 返回的 fingerprint>",
  "summary": "形状/贴图/数据/图标通过；实机待验"
}
```

`ok=true` 只在 blockers 为空时成立；发现 blocker 时 `ok=false` 并列出 `blockers`，controller 会停在 `REVIEW`/`BLOCKED`。

## 5. 为什么不是“Lead 自由做”

| 自由 Lead | controller |
|---|---|
| agent 说“完成了” | controller 重读 geo/display/zip |
| 用户一停就丢进度 | `.tacz/builds/<gun>.json` 可 resume |
| review 口头通过 | review 绑定 pack hash |
| 改完模型旧 review 还算 | hash 不匹配即失效 |
| agent 自己打包 | 只有 PACKAGE gate 过才 READY |
| 无人工确认 | READY 后必须 `ack confirmed=true` |

这套机制是**产物驱动 + 门禁 + 可恢复**，借鉴的是工程控制论意义上的通用做法，不是某个具体项目的代码。设计取舍见 [why-not-one-shot.md](why-not-one-shot.md) 第 5 节。
