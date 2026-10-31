# TACZ 枪包规范速查（已验证）

只记录官方 jar/GitHub 与本地 DP-12 构建都验证过的规则；不确定项标 `待核实`。

## 1. 目录

```text
<gunpack>/
├─ gunpack.meta.json                  { "namespace": "<ns>" }
├─ assets/<ns>/
│  ├─ gunpack_info.json
│  ├─ geo_models/gun/<id>_geo.json
│  ├─ textures/gun/uv/<id>.png        128×128（或 ≤1024 的 2 次幂）
│  ├─ textures/gun/slot/<id>.png      64×64
│  ├─ display/guns/<id>_display.json
│  ├─ animations/<name>.animation.json
│  ├─ scripts/<name>.lua
│  └─ lang/{zh_cn,en_us}.json
└─ data/<ns>/
   ├─ index/guns/<id>.json
   └─ data/guns/<id>_data.json
```

## 2. display 引用解析

| 字段 | 值示例 | 文件 |
|---|---|---|
| `model` | `ns:gun/dp12_geo` | `assets/ns/geo_models/gun/dp12_geo.json` |
| `texture` | `ns:gun/uv/dp12` | `assets/ns/textures/gun/uv/dp12.png` |
| `slot` | `ns:gun/slot/dp12` | `assets/ns/textures/gun/slot/dp12.png` |
| `animation` | `ns:dp12` | `assets/ns/animations/dp12.animation.json` |
| `state_machine` | `ns:dp12_state_machine` | `assets/ns/scripts/dp12_state_machine.lua` |
| `sounds.*` | `ns:dp12/dp12_shoot` | 枪包 sounds 树（按声音页核对） |

注意：动画文件名带 `.animation`，display 里**不写**后缀。`use_default_animation` 是可选的回退来源（`rifle`/`pistol`），不是动画能否加载的必需字段。

## 3. 骨骼 / 分组

- 枪口 -Z，+Y 上，+X 右；16 units/block。
- 必须保留 `camera`、`root`、`AKM`、`positioning`、`views`、`lefthand`/`righthand` 及 locators。
- `root` 不能是空叶子；AK 模板是 `root → bone2 → AKM`，其他模板按实际骨链保留。
- 动画需要转动的部件各自有骨骼：bolt、magazine、safety、trigger、pump、barrels、hammer。
- 官方 `static_idle` 手动摆 `lefthand`/`righthand`；不摆会停在绑定位置。

## 4. 动画片段

`static_idle`、`static_semi`、`static_bolt_caught`、`draw`、`put_away`、`shoot`、`bolt`（泵动/栓动，不是 `bolt_action`）、`reload_tactical`、`reload_empty`、`inspect`、`inspect_empty`。

Bedrock 1.8.0；名字必须与官方 `default_state_machine.lua` 的 `runAnimation(...)` 一致。

## 5. 数据

- `index.name` 是 lang key；`display`/`data` 指向 `<ns>:<id>_display` / `<ns>:<id>_data`。
- `ammo_amount > 0`，`rpm` 1–1200，`bolt`/`fire_mode` 合法，reload 结构存在。
- 管式/双管枪没有自定义 Lua 时，`reload.type: manual` 不会补弹；用 `magazine` 或写状态机。
- 单枪规格（DP-12 容量 16、12ga 精度等）放 design brief，不写进角色技能。
- data/display/lang 被手工改过后，modeler 的纯几何重导出必须用 `tacz_gun export preserve_docs=true`，否则会覆盖数据。

## 6. 验收

1. `tacz_verify`（引用 + 残留）`ok:true`
2. `tacz_pack action="validate"` 0 error
3. `tacz_pack action="package"` 到 `output/<gun>.zip`
4. `models/<gun>.bbmodel` 已归档
5. 实机验证：持握、开火、换弹、动画、图标

## 7. 官方基准

本地 `TACZ_SOURCE`/`vendor/TACZ`/工作目录/缓存优先；全落空才用 `tacz_spec` 从 `MCModderAnchor/TACZ@1.20.1` 取。详见 [tacz-baseline-source.md](tacz-baseline-source.md)。
