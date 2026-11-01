# 枪包该长什么样（速查）

这份只写**核对过的事实**：官方默认枪包、官方 GitHub、以及本地实际做出来并跑通的包。
不确定的地方会标出来。

---

## 一、目录怎么摆

```
<你的枪包>/
├─ gunpack.meta.json          告诉游戏这个包叫什么命名空间
├─ assets/<命名空间>/
│  ├─ gunpack_info.json       包的名字、作者、版本
│  ├─ geo_models/gun/<枪名>_geo.json     模型几何
│  ├─ textures/gun/uv/<枪名>.png         贴图（128×128，或不超过 1024 的 2 次幂）
│  ├─ textures/gun/slot/<枪名>.png       槽位图标（64×64）
│  ├─ display/guns/<枪名>_display.json   显示配置
│  ├─ animations/<名字>.animation.json   动画
│  ├─ scripts/<名字>.lua                 状态机
│  └─ lang/zh_cn.json, en_us.json        中英文名字
└─ data/<命名空间>/
   ├─ index/guns/<枪名>.json    登记表
   └─ data/guns/<枪名>_data.json 枪械参数
```

---

## 二、display 里写的路径，对应磁盘上哪个文件

这是最容易搞错的地方，记住这张表：

| display 字段 | 写什么 | 实际文件 |
|---|---|---|
| `model` | `你的命名空间:gun/dp12_geo` | `assets/命名空间/geo_models/gun/dp12_geo.json` |
| `texture` | `你的命名空间:gun/uv/dp12` | `assets/命名空间/textures/gun/uv/dp12.png` |
| `slot` | `你的命名空间:gun/slot/dp12` | `assets/命名空间/textures/gun/slot/dp12.png` |
| `animation` | `你的命名空间:dp12` | `assets/命名空间/animations/dp12.animation.json` |
| `state_machine` | `你的命名空间:dp12_state_machine` | `assets/命名空间/scripts/dp12_state_machine.lua` |

**两个最常见的坑：**

1. **动画文件名带 `.animation`，但 display 里不写这个后缀。**
   写 `ns:dp12`，不要写 `ns:dp12.animation`。

2. **弹药模型的命名和枪不一样。**
   枪是 `geo_models/gun/<枪名>_geo.json`（带 `_geo`），
   弹药是 `geo_models/ammo/<弹药名>.json`（**不带** `_geo`）。

---

## 三、模型里的骨骼和分组

**坐标约定**：枪口朝 -Z，+Y 朝上，+X 朝右，16 个单位 = 1 格。

**必须保留的分组**（少了游戏里会出问题）：

```
camera   root   AKM   positioning   views
lefthand   righthand   以及各种 locator 定位组
```

**几个要点：**

- `root` 不能是空的叶子节点。AK 模板的骨链是 `root → bone2 → AKM`
- 需要动画转动的部件，各自要有独立骨骼：
  `bolt`（枪机）、`magazine`（弹匣）、`safety`（保险）、`trigger`（扳机）、
  `pump`（泵动护木）、`barrels`（枪管）、`hammer`（击锤）
- 官方 `static_idle` 是手动摆好左手右手的姿势的。不摆的话，手会停在绑定位置

---

## 四、动画片段叫什么

标准片段名：

```
static_idle          静止待机
static_semi          半自动静止
static_bolt_caught   枪机挂起
draw                 掏枪
put_away             收枪
shoot                开火
bolt                 泵动/栓动（注意不是 bolt_action）
reload_tactical      战术换弹
reload_empty         空仓换弹
inspect              检视
inspect_empty        空仓检视
```

- 格式是 Bedrock 1.8.0
- **名字必须和状态机里的 `runAnimation(...)` 完全一致**，这是"动画不播"最常见的原因

---

## 五、数据文件填什么

- `index.name` 是语言文件的 key，不是枪的显示名
- `display` 和 `data` 指向 `<命名空间>:<枪名>_display` 和 `<命名空间>:<枪名>_data`
- 数值范围：`ammo_amount > 0`，`rpm` 在 1–1200 之间
- `bolt`、`fire_mode` 要填合法值，`reload` 结构必须存在

**管式、双管枪特别注意：**

没有自定义 Lua 状态机的时候，`reload.type: manual` **不会补弹**。
要么改成 `magazine`，要么自己写状态机。

**重新导出时的保护：**

data/display/语言文件被手工改过之后，建模那边纯几何重导出必须带 `preserve_docs=true`，
否则会把数据覆盖掉。

---

## 六、怎么算做完了

按顺序过这五关：

1. `tacz_verify` 检查所有引用和残留文件 → `ok: true`
2. `tacz_pack action="validate"` → 0 个错误
3. `tacz_pack action="package"` → 产出 `output/<枪名>.zip`
4. `models/<枪名>.bbmodel` 已归档（别只留在 Blockbench 里）
5. **你进游戏实测**：持握、开火、换弹、动画、图标

---

## 七、官方基准去哪找

先在你电脑上找（`TACZ_SOURCE`、`vendor/TACZ`、当前目录、缓存），全没有才联网从
`MCModderAnchor/TACZ@1.20.1` 取。

详见 [官方基准文件从哪来](tacz-baseline-source.md)。
