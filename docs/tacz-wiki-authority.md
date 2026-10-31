# TACZ Wiki 权威规则对照（枪包工坊实现基线）

来源：<https://tacwiki.mcma.club/zh/gunpack> 全站（53 页），并以官方默认枪包
`tacz_default_gun` 的磁盘实况交叉验证。

本文件记录**实现必须遵守的硬事实**，以及与早期实现不一致、已修正的点。

---

## 1. 图标（`gun/display/03_hud`）

| | slot 槽位图 | hud 平面图 |
|---|---|---|
| 尺寸 | 64×64（正方形） | 3:1，推荐 180×60 / 192×64 / **384×128** |
| 相机 | **等轴视角右（2:1）** | **侧视** |
| 着色 | **关闭软件内阴影着色** | **关闭软件内阴影着色** |
| 枪口朝向 | **朝右** | **朝左** |
| 对齐 | 居中 | 长枪对齐中线；手枪等短枪**向右对齐** |
| 路径 | `textures/gun/slot/<id>.png` | `textures/gun/hud/<id>.png` |
| 字段 | `slot` | `hud`（可选 `hud_empty`） |

- 两张图都是 **render（保留模型自身配色）**，不是单色剪影。
- 官方 ak47 slot 有 592 色、hud 有 18 色；m870 slot 438 色、hud 80 色。
  所以「slot 纯色 / hud 纯色」都不成立 —— **纯色是误读，正确做法是关闭阴影**。
- `hud_empty`：弹匣打空时替换的平面图；为空则对 `hud` 叠加红色着色。

对应实现：`lib/tacz/constants.ts` 的 `TACZ_SLOT_STYLE` / `TACZ_HUD_STYLE`。

```ts
TACZ_SLOT_STYLE = { angle: "iso",  flipX: false, flat: true, style: "render", size: 64 }
TACZ_HUD_STYLE  = { angle: "side", flipX: true,  flat: true, style: "render", size: [384,128] }
```

---

## 2. 弹药（`ammo/ammo`、`ammo/display`）

### 目录与命名

```
assets/<ns>/geo_models/ammo/<id>.json        ← 注意：没有 _geo 后缀
assets/<ns>/textures/ammo/uv/<id>.png
assets/<ns>/textures/ammo/slot/<id>.png
assets/<ns>/geo_models/shell/<id>_shell.json
assets/<ns>/textures/shell/<id>_shell.png
assets/<ns>/geo_models/ammo_entity/<id>_entity_geo.json
assets/<ns>/textures/ammo_entity/<id>_entity.png
assets/<ns>/display/ammo/<id>_display.json
data/<ns>/index/ammo/<id>.json
```

官方包实况：`geo_models/ammo/12g.json`、`geo_models/shell/12g_shell.json`、
`textures/ammo/slot/12g.png`。**弹药堆模型确实不带 `_geo`**，与枪
（`gun/ak47_geo.json`）和配件（`attachment/silencer_geo.json`）不同。

### index 字段

```json
{ "name": "<ns>.ammo.<id>.name", "display": "<ns>:<id>_display", "stack_size": 36, "sort": 24 }
```

### display 字段

```json
{
  "model": "<ns>:ammo/<id>",
  "texture": "<ns>:ammo/uv/<id>",
  "slot": "<ns>:ammo/slot/<id>",
  "shell":   { "model": "<ns>:shell/<id>_shell", "texture": "<ns>:shell/<id>_shell" },
  "entity":  { "model": "<ns>:ammo_entity/<id>_entity_geo", "texture": "<ns>:ammo_entity/<id>_entity" },
  "tracer_color": "#FF3030",
  "transform": { "scale": { "thirdperson": [0.75,0.75,0.75], "ground": [0.75,0.75,0.75], "fixed": [1.5,1.5,1.5] } }
}
```

**`tracer_color` 属于 display，不属于 index。** 早期实现放在 index，已修正。
`tracer_color` 必须是 `#RRGGBB`，其它写法会被静默忽略并回退白色。

---

## 3. 配件（`attachment/attachment`、`attachment/data`、`attachment/display`）

### 目录

```
assets/<ns>/geo_models/attachment/<id>_geo.json
assets/<ns>/geo_models/attachment/lod/<id>.json
assets/<ns>/textures/attachment/uv/<id>.png
assets/<ns>/textures/attachment/slot/<id>.png
assets/<ns>/textures/attachment/lod/<id>.png
assets/<ns>/display/attachments/<id>_display.json
data/<ns>/index/attachments/<id>.json
data/<ns>/data/attachments/<id>_data.json
```

wiki 正文把模型目录写作 `models/attachment/`，但**官方包实际是
`geo_models/attachment/`**（81 个文件），与枪的 `geo_models/gun/` 一致。
以磁盘实况为准。

### index

```json
{ "name": "<ns>.attachment.<id>.name", "display": "<ns>:<id>_display", "data": "<ns>:<id>_data", "type": "scope", "sort": 10 }
```

### `type` 合法值（= `allow_attachment_types` 槽位）

`scope` · `stock` · `muzzle` · `grip` · `laser` · `extended_mag`

- **`bayonet` 不是 type**：官方 `bayonet_m9` 的 type 是 `muzzle`。
- `ammo_mod` 是 **tag 概念**，不是槽位 type。
- 手枪通常省略 `stock`；最少可只保留 `scope` + `extended_mag`。

### display 必填/常用字段

`slot`（必填）、`model`、`texture`、`lod`、`sounds`、`scope`/`sight`、
`zoom`、`views`、`views_fov`、`fov`、`adapter`、`laser`、`show_mount`、
`show_muzzle`、`muzzle_flash_offset`、`text_show`。

- `scope` 与 `sight` 互斥：`scope`=筒状放大（ACOG/LPVO），`sight`=红点/全息。
- 纯数据配件（弹药改装、弹匣）**不写 `model`/`texture`**。
- 装卸音效优先复用官方通用键：
  `attachment_general_a` / `attachment_general_b` /
  `attachment_general_uninstall` / `muzzle_general` /
  `scope_general_c` / `scope_general_e` /
  `extended_mag_install` / `extended_mag_uninstall` /
  `bayonet_install` / `bayonet_uninstall`。
  早期默认值写成 `tacz:attachment_install`（不存在），已修正为
  `tacz:attachments/attachment_general_b`。

### 配件 data 三个乘区

```
最终属性 = [基础值 + Σ addend] × [1 + Σ percent] × Π multiplier
```

常用词条：`weight`、`ads`、`inaccuracy`、`aim_inaccuracy`、
`sneak_inaccuracy`、`lie_inaccuracy`、`move_inaccuracy`、`ammo_speed`、
`pierce`、`rpm`、`silence`、`extended_mag_level`、`ignite`、`explosion`、
`recoil`、`damage`、`armor_ignore`、`head_shot`、`knockback`、
`recoil_push`、`melee`。

旧写法 `ads_addend` / `recoil_modifier` 仍可用，新配件应用新写法。

---

## 4. 枪械组名（`gun/03_sp_group_name`）

### 硬性要求

`root` · `magazine`（`mag_standard` / `mag_extended_1` / `mag_extended_2` /
`mag_extended_3`，允许扩容时**四个全放**）· `constraint` · `camera`

### 视觉定位组（`gun/05_gun_position`）

必放五个：`iron_view`、`idle_view`、`ground`、`thirdperson_hand`、`fixed`。

配件界面视角（**缺了就「改枪飞天」**）：

`refit_view`（初始）· `refit_muzzle_view` · `refit_stock_view` ·
`refit_scope_view` · `refit_extended_mag_view` · `refit_grip_view` ·
`refit_laser_view`

### 配件定位组

`stock_pos` · `muzzle_pos` · `grip_pos` · `scope_pos` · `laser_pos`

### 其他特殊组

`additional_magazine` · `bullet_in_mag` · `sight` / `sight_folded` ·
`muzzle_default` · `stock_default` · `attachment_adapter` ·
`muzzle_flash` · `shell` · `handguard_default` · `mount` ·
`_illuminated` 后缀发光组 · `text_show` 文本组

### 手臂定位组（`gun/04_hand_pos`）

`lefthand_pos` / `righthand_pos`。Steve 手模型 Position 偏移 (+4,0,-2) /
(-8,0,-2)，Size (4,12,4)；Alex 用 Size (3,12,4)，偏移 (-7,0,-2)。

---

## 5. 配件槽与标签

### 枪械允许槽

`data/<ns>/data/guns/<gun>_data.json` 的 `allow_attachment_types`：

```json
"allow_attachment_types": ["scope", "stock", "muzzle", "extended_mag", "laser"]
```

### 专属/通用配件标签

- 专属：`data/<ns>/tacz_tags/attachments/allow_attachments/<gun>.json`
  → `["#tacz:scope", "#tacz:muzzle_shotgun"]`
- 通用：`data/tacz/tacz_tags/attachments/<tag>.json` → 具体配件 ID 列表
- 官方实况：`data/tacz/tacz_tags/attachments/allow_attachments/` 有 51 个文件，
  另有 `intrinsic/`。

### 原厂配件 / 专属属性

- `builtin_attachments`：虚拟原厂配件，三种写法（完整 / 简写 / 数组简写）。
- `exclusive_attachments`：枪+配件组合的独有属性修正，叠加在配件原始数据之上。

---

## 6. 配方

- 类型：`tacz:gun_smith_table_crafting`
- 路径：`data/<ns>/recipes/{gun,ammo,attachments}/<id>.json`
- 结构：`materials`（`{item:{tag|item}, count}`）+ `result`
- `result`：`{type: "gun"|"ammo"|"attachment", id, count?, group?}`
- 工作台配方过滤：`EnableDefaultGunSmithTableFilter` 默认 true，
  白名单来自 `recipe_filters/default.json`（官方 `^.*$`）。
  过滤器是**并集 merge**语义，包内加白名单只会放宽不会收窄。

---

## 7. 已修正的历史错误

| 错误 | 正确做法 |
|---|---|
| slot 用 `flat` 单色剪影 | slot 用 render + **关闭阴影**，枪口**朝右** |
| hud 枪口朝右 | hud 枪口**朝左** |
| hud 用 `style:"flat"` 单色 | hud 用 render + 关闭阴影，保留模型配色 |
| `tracer_color` 写进 ammo index | 写进 ammo **display** |
| 弹药模型 `ammo/<id>_geo.json` | `ammo/<id>.json`（无 `_geo`） |
| 默认配件音效 `tacz:attachment_install` | `tacz:attachments/attachment_general_b` |
| `bayonet` 当作配件 type | `bayonet_m9` 的 type 是 `muzzle` |
| 缺 `refit_*_view` 组 | 七个 refit 组必须存在，否则改枪界面模型飞出镜头 |
| 弹药模板只有 `root` | 补 `fixed` / `thirdperson_hand` / `ground` |
| 瞄具模板只有 `root` | 补 `scope_body` / `ocular_ring` / `ocular` / `division` / `scope_view` |
| 配件 display 只有 4 个字段 | 支持 `zoom`/`scope`/`sight`/`views`/`views_fov`/`fov`/`adapter`/`lod`/`laser`/`show_mount`/`show_muzzle`/`muzzle_flash_offset`/`text_show` |
| 校验器在 index 检查 tracer_color | 在 display 检查，且必须是 `#RRGGBB` |

---

## 8. 抓取方式

wiki 站点可直接 HTTP 抓取（`urllib` / `Invoke-WebRequest` 均 200）。
页面为 VitePress 静态站，正文在 HTML 中；去掉 `<script>`/`<style>` 后
按标签切行即可读。控制台直出中文会乱码，**应写入 UTF-8 文件后用 read 读取**。

路径规律：
- 章节首页：`/zh/gunpack/<section>/`（无 `.html`）
- 具体页：`/zh/gunpack/<section>/<page>.html`
- 导航链接可从任一页的 `href="/zh/gunpack..."` 提取，无需 sitemap
  （站点无 `sitemap.xml`）。
