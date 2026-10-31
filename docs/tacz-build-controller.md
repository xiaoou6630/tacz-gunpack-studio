# TACZ build controller

一个目标生成一整套枪包，靠的不是“更自由的 Lead”，而是一个确定性的 controller：agent 只产 artifact，controller 重读 artifact、跑 gate、推进状态；失败就 `BLOCKED`，人能 `resume`。

入口：`tacz_build`。状态文件：`<project>/.tacz/builds/<gun>.json`。

## 1. 状态机

```text
INIT → RESEARCH → BLUEPRINT → GEOMETRY → DATA → REVIEW → PACKAGE → READY → DONE
```

| Stage | Owner | 必须存在的 artifact / gate |
|---|---|---|
| `INIT` | lead | `gunpack.meta.json` 已存在，namespace 已记录 |
| `RESEARCH` | researcher | `refs/<slug>/design-brief.json` + 同目录 `manifest.json`；brief 有非空 `parts` |
| `BLUEPRINT` | modeler | `models/<gun>-blueprint.json`，有非空 `parts` 和 `bones` |
| `GEOMETRY` | modeler | `models/<gun>.bbmodel`；display/geo/UV/slot 存在；`tacz_verify.ok=true` |
| `DATA` | data-smith | index/data/display 存在；`tacz_verify.ok=true` |
| `REVIEW` | reviewer | `reviews/<gun>.json`：`ok=true`、`blockers=[]`、`pack_hash` 等于当前 pack fingerprint |
| `PACKAGE` | lead | `output/<gun>.zip` 非空；`tacz_verify.ok=true` |
| `READY` | human | 人工进游戏验持握/开火/换弹/动画/图标 |
| `DONE` | human | `tacz_build action="ack" confirmed=true` |

`REVIEW` 的 `pack_hash` 是关键：reviewer 看过哪一版，就只能接受那一版。modeler 之后改了 geo/贴图，hash 变了，review 自动失效。

## 2. 命令

```text
tacz_build action="init" project_root=... pack_dir=... gun_id=ksg type=shotgun
tacz_build action="status" gun_id=ksg
tacz_build action="advance" gun_id=ksg stage=INIT owner=lead
tacz_build action="advance" gun_id=ksg stage=RESEARCH owner=researcher
tacz_build action="advance" gun_id=ksg stage=BLUEPRINT owner=modeler
tacz_build action="advance" gun_id=ksg stage=GEOMETRY owner=modeler
tacz_build action="advance" gun_id=ksg stage=DATA owner=data-smith
tacz_build action="advance" gun_id=ksg stage=REVIEW owner=reviewer
tacz_build action="advance" gun_id=ksg stage=PACKAGE owner=lead
tacz_build action="resume" gun_id=ksg
tacz_build action="ack" gun_id=ksg confirmed=true note="in-game ok"
```

- `advance` 只接受当前 stage 和合法 owner；owner 不对直接报错。
- gate 不过：state 变 `blocked`，`blocked_reason` 写清楚；修好后 `resume`。
- `status` 返回当前 gate 的每个 check + pack fingerprint。
- `ack` 只能在 `READY` 后执行；没有人工确认不能 `DONE`。

## 3. Blueprint 格式

`models/<gun>-blueprint.json`：

```json
{
  "gun_id": "ksg",
  "parts": [
    { "name": "receiver", "bone": "receiver", "cubes": [
      { "from": [-2, 4, -8], "to": [2, 6, 8], "uv": [0, 0] }
    ] }
  ],
  "bones": [
    { "name": "root", "parent": null, "pivot": [0, 0, 0] },
    { "name": "receiver", "parent": "root", "pivot": [0, 5, 0] }
  ],
  "palette": ["#1b1b1b", "#3a3a3a"]
}
```

这是给确定性 compiler 的输入，不是给 modeler 自由发挥的自然语言。`parts[].cubes` 可以先留空，但 `parts` 和 `bones` 必须存在。

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

这套设计借鉴 AutoForge/智铸的 `CONTROL_RESULT`、review binding、checkpoint/resume 和 human gate；映射见 [why-not-one-shot.md](why-not-one-shot.md) 第 7 节。
