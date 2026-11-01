# 官方 Wiki 定下的规矩（附我们踩过的坑）

来源：<https://tacwiki.mcma.club/zh/gunpack> 全站 53 页，
并用官方默认枪包 `tacz_default_gun` 的磁盘实况逐条核对过。

这份只写**必须照做**的硬规则，以及我们早期做错、后来改对的点。

---

## 一、两种图标

游戏里会用到两种图标，规格完全不同，**别搞混**：

| | 槽位图（slot） | 平面图（HUD） |
|---|---|---|
| 尺寸 | 64×64 正方形 | 3:1，推荐 180×60 / 192×64 / **384×128** |
| 相机角度 | **等轴视角，朝右** | **侧视** |
| 阴影 | **关掉** | **关掉** |
| 枪口朝向 | **朝右** | **朝左** |
| 对齐 | 居中 | 长枪对中线；手枪这类短枪**靠右对齐** |
| 存放路径 | `textures/gun/slot/<枪名>.png` | `textures/gun/hud/<枪名>.png` |
| display 字段 | `slot` | `hud`（打空时另有 `hud_empty`） |

**一个流传很广的误解**：有人说图标要做成"纯色剪影"。这是误读。

官方 ak47 的槽位图有 592 种颜色，HUD 有 18 种；m870 槽位图 438 色，HUD 80 色。
**它们都是保留模型自己配色的渲染图，只是关掉了阴影。**

`hud_empty` 是弹匣打空时替换用的。如果留空，游戏会在原 HUD 上叠一层红色。

---

## 二、弹药

### 文件怎么命名

```
assets/<命名空间>/geo_models/ammo/<弹药名>.json          ← 注意：没有 _geo
assets/<命名空间>/textures/ammo/uv/<弹药名>.png
assets/<命名空间>/textures/ammo/slot/<弹药名>.png
assets/<命名空间>/geo_models/shell/<弹药名>_shell.json   ← 弹壳
assets/<命名空间>/textures/shell/<弹药名>_shell.png
assets/<命名空间>/geo_models/ammo_entity/<弹药名>_entity_geo.json
assets/<命名空间>/textures/ammo_entity/<弹药名>_entity.png
assets/<命名空间>/display/ammo/<弹药名>_display.json
data/<命名空间>/index/ammo/<弹药名>.json
```

**最容易踩的坑：弹药模型不带 `_geo`，但枪和配件都带。**

- 枪：`gun/ak47_geo.json`
- 配件：`attachment/silencer_geo.json`
- 弹药：`ammo/12g.json` ← 没有 `_geo`

官方包实况确认过：`geo_models/ammo/12g.json`、`geo_models/shell/12g_shell.json`。

### 登记表字段

```json
{ "name": "<命名空间>.ammo.<弹药名>.name", "display": "<命名空间>:<弹药名>_display", "stack_size": 36, "sort": 24 }
```

### display 字段

```json
{
  "model": "<命名空间>:ammo/<弹药名>",
  "texture": "<命名空间>:ammo/uv/<弹药名>",
  "slot": "<命名空间>:ammo/slot/<弹药名>",
  "shell":  { "model": "<命名空间>:shell/<弹药名>_shell", "texture": "<命名空间>:shell/<弹药名>_shell" },
  "entity": { "model": "<命名空间>:ammo_entity/<弹药名>_entity_geo", "texture": "<命名空间>:ammo_entity/<弹药名>_entity" },
  "tracer_color": "#FF3030",
  "transform": { "scale": { "thirdperson": [0.75,0.75,0.75], "ground": [0.75,0.75,0.75], "fixed": [1.5,1.5,1.5] } }
}
```

**`tracer_color`（弹道颜色）写在 display 里，不写在 index 里。** 我们早期写错了，已修正。

而且它必须是 `#RRGGBB` 格式，写成别的样子会被静默忽略，回退成白色。

---

## 三、配件

### 文件放哪

```
assets/<命名空间>/geo_models/attachment/<配件名>_geo.json
assets/<命名空间>/geo_models/attachment/lod/<配件名>.json
assets/<命名空间>/textures/attachment/uv/<配件名>.png
assets/<命名空间>/textures/attachment/slot/<配件名>.png
assets/<命名空间>/textures/attachment/lod/<配件名>.png
assets/<命名空间>/display/attachments/<配件名>_display.json
data/<命名空间>/index/attachments/<配件名>.json
data/<命名空间>/data/attachments/<配件名>_data.json
```

**Wiki 正文写的是 `models/attachment/`，但官方包实际是 `geo_models/attachment/`**
（81 个文件）。跟枪的 `geo_models/gun/` 一致。**以磁盘实况为准。**

### 配件类型

合法值只有六种：

```
scope   stock   muzzle   grip   laser   extended_mag
```

两个容易搞错的：

- **`bayonet`（刺刀）不是一种类型。** 官方 `bayonet_m9` 的类型是 `muzzle`
- **`ammo_mod`（弹药改装）是标签概念，不是槽位类型**

手枪一般省略 `stock`，最少只留 `scope` + `extended_mag`。

### display 常用字段

`slot`（必填）、`model`、`texture`、`lod`、`sounds`、`scope`/`sight`、
`zoom`、`views`、`views_fov`、`fov`、`adapter`、`laser`、`show_mount`、
`show_muzzle`、`muzzle_flash_offset`、`text_show`

**`scope` 和 `sight` 互斥**：`scope` 是筒状放大（ACOG、LPVO），`sight` 是红点、全息。

纯数据配件（弹药改装、弹匣）**不写 `model` 和 `texture`**。

### 音效键名

优先复用官方现成的：

```
attachment_general_a / attachment_general_b
attachment_general_uninstall
muzzle_general
scope_general_c / scope_general_e
extended_mag_install / extended_mag_uninstall
bayonet_install / bayonet_uninstall
```

我们早期默认值写成 `tacz:attachment_install`，**这个键不存在**，已改成
`tacz:attachments/attachment_general_b`。

### 配件属性怎么叠加

```
最终属性 = [基础值 + 所有加数] × [1 + 所有百分比] × 所有乘数
```

常用词条：`weight`、`ads`、`inaccuracy`、`aim_inaccuracy`、
`sneak_inaccuracy`、`lie_inaccuracy`、`move_inaccuracy`、`ammo_speed`、
`pierce`、`rpm`、`silence`、`extended_mag_level`、`ignite`、`explosion`、
`recoil`、`damage`、`armor_ignore`、`head_shot`、`knockback`、
`recoil_push`、`melee`

旧写法 `ads_addend`、`recoil_modifier` 还能用，但新配件建议用新写法。

---

## 四、模型必须有哪些组

### 硬性要求

`root`、`magazine`、`constraint`、`camera`

弹匣组有四种：`mag_standard` / `mag_extended_1` / `mag_extended_2` / `mag_extended_3`。
支持扩容的话，**四个都要放**。

### 五个必放的视角组

`iron_view`、`idle_view`、`ground`、`thirdperson_hand`、`fixed`

### 改枪界面视角（缺了会"枪飞天"）

```
refit_view                 初始视角
refit_muzzle_view          枪口
refit_stock_view           枪托
refit_scope_view           瞄具
refit_extended_mag_view    扩容弹匣
refit_grip_view            握把
refit_laser_view           激光
```

**七个全都要有。** 少一个，玩家进改枪界面就会看到枪飞出屏幕——这是最常见的问题。

### 配件安装位置

`stock_pos`、`muzzle_pos`、`grip_pos`、`scope_pos`、`laser_pos`

### 其他特殊组

`additional_magazine`、`bullet_in_mag`、`sight` / `sight_folded`、
`muzzle_default`、`stock_default`、`attachment_adapter`、
`muzzle_flash`、`shell`、`handguard_default`、`mount`、
带 `_illuminated` 后缀的发光组、`text_show` 文本组

### 手的位置

`lefthand_pos` 和 `righthand_pos`

- Steve 手模型：位置偏移 (+4, 0, -2) / (-8, 0, -2)，尺寸 (4, 12, 4)
- Alex 手模型：尺寸 (3, 12, 4)，偏移 (-7, 0, -2)

---

## 五、配件槽和标签

### 枪允许哪些槽

写在 `data/<命名空间>/data/guns/<枪名>_data.json` 的 `allow_attachment_types`：

```json
"allow_attachment_types": ["scope", "stock", "muzzle", "extended_mag", "laser"]
```

### 专属配件和通用配件

- **专属**：`data/<命名空间>/tacz_tags/attachments/allow_attachments/<枪名>.json`
  → 内容如 `["#tacz:scope", "#tacz:muzzle_shotgun"]`
- **通用**：`data/tacz/tacz_tags/attachments/<标签名>.json` → 具体配件 ID 列表

官方包实况：`data/tacz/tacz_tags/attachments/allow_attachments/` 下有 51 个文件，
另有 `intrinsic/` 目录。

### 原厂配件

- `builtin_attachments`：虚拟的原厂配件，有三种写法（完整 / 简写 / 数组简写）
- `exclusive_attachments`：某把枪配某个配件时的独有属性修正，叠加在配件原始数据之上

---

## 六、合成配方

- 类型：`tacz:gun_smith_table_crafting`
- 路径：`data/<命名空间>/recipes/{gun,ammo,attachments}/<名字>.json`
- 结构：`materials`（`{item:{tag|item}, count}`）+ `result`
- `result`：`{type: "gun"|"ammo"|"attachment", id, count?, group?}`

工作台默认开启配方过滤（`EnableDefaultGunSmithTableFilter`），白名单来自
`recipe_filters/default.json`（官方是 `^.*$`）。

**过滤是"并集"语义**：在包里加白名单只会放宽范围，不会收窄。

---

## 七、我们踩过并改掉的坑

| 早期错误 | 正确做法 |
|---|---|
| 槽位图做成单色剪影 | 用渲染图 + **关阴影**，枪口**朝右** |
| HUD 枪口朝右 | HUD 枪口**朝左** |
| HUD 用单色 | 用渲染图 + 关阴影，保留模型配色 |
| `tracer_color` 写进弹药 index | 写进弹药 **display** |
| 弹药模型写成 `ammo/<名字>_geo.json` | `ammo/<名字>.json`（无 `_geo`） |
| 默认配件音效 `tacz:attachment_install` | `tacz:attachments/attachment_general_b` |
| 把 `bayonet` 当成配件类型 | `bayonet_m9` 的类型是 `muzzle` |
| 缺 `refit_*_view` 组 | 七个 refit 组必须齐，否则改枪界面模型飞出去 |
| 弹药模板只有 `root` | 补 `fixed` / `thirdperson_hand` / `ground` |
| 瞄具模板只有 `root` | 补 `scope_body` / `ocular_ring` / `ocular` / `division` / `scope_view` |
| 配件 display 只写了 4 个字段 | 支持 `zoom`/`scope`/`sight`/`views`/`views_fov`/`fov`/`adapter`/`lod`/`laser`/`show_mount`/`show_muzzle`/`muzzle_flash_offset`/`text_show` |
| 校验器去 index 里找 `tracer_color` | 去 display 里找，且必须 `#RRGGBB` |

---

## 八、这份文档是怎么核出来的

Wiki 站点是 VitePress 静态站，可以直接抓：

- 章节首页：`/zh/gunpack/<章节>/`（没有 `.html`）
- 具体页：`/zh/gunpack/<章节>/<页面>.html`
- 导航链接从任意页的 `href="/zh/gunpack..."` 就能提取，站点没有 sitemap

正文在 HTML 里，去掉 `<script>` 和 `<style>` 后按标签切行就能读。

> 注意：控制台直接输出中文会乱码，**要写进 UTF-8 文件再读**。
