# TACZ 动画、状态机与声音

面向 TACZ 枪包（1.20.1，`tacz_default_gun` 格式）的速查。来源：TACZ 官方 Wiki 与默认枪包 display 文件；文中 `tacz:` 是默认命名空间，自己的包要换成自己的 namespace。

> 官方基准怎么找：本地优先（`TACZ_SOURCE`、`vendor/TACZ`、工作目录、缓存），全落空才用 `tacz_spec` 从官方 GitHub `MCModderAnchor/TACZ@1.20.1` 取。详见 [tacz-baseline-source.md](tacz-baseline-source.md)。

## 0. 同一份动画能不能两边通用

**能。** TaCZ 与 Blockbench 用的都是 Bedrock 动画格式，`tacz_gun action="open"` 会把
`assets/<ns>/animations/<id>.animation.json` 读进工程，Blockbench 的
`AnimationCodec.codecs.bedrock.compileFile()` 又能把它写回同一种文件。

两边只有三处约定不同，都是可逆的：

| | TaCZ / Bedrock 文件 | Blockbench 工程内 |
|---|---|---|
| 片段名 | `static_idle` | `animation.static_idle`（导出时去掉前缀） |
| rotation | 原值 | **x、y 取反**（导出时再取反，抵消） |
| position | 原值 | **x 取反**（同上抵消） |

实测（KSG，12 段 / 89 通道 / 198 个关键帧）往返后：

- 所有骨骼的 rotation / position 数值**逐值一致**
- 片段名、`loop`、`animation_length` 一致
- 时间轴**只剩 1/120 秒量级的取整**（见下）

### 两个已知的等价差异，不影响播放

**1. `scale: [1,1,1]` 导出时被省略。**
Blockbench 视 `[1,1,1]` 为默认值，不写进文件。Bedrock 里缺省即 1，所以语义相同。

**2. 时间被吸附到 1/120 秒网格。**
Blockbench 的 `Timeline.snapTime` 实现是：

```js
snapTime(i, e) {
  var t = Math.clamp(e ? e.snapping : settings.animation_snap.value, 1, 120);
  return Math.clamp(Math.round(i * t) / t, 0);
}
```

**`snapping` 被硬性 clamp 在 1–120**，所以最细网格是 1/120 秒。
TaCZ 的 `0.12` 这类值不在网格上，往返后变成 `0.1167`，误差 **3.33 毫秒**，
约为 24fps 一帧的 8%。

本插件的导入把 `snapping` 设为 **120**（上限），把误差压到最小；Blockbench 的默认值 10
会把 `0.05`/`0.12`/`0.45` 全部collapse 到 0.1 网格，误差大一个数量级。

> 想让时间**完全无损**，就别在 Blockbench 里导出动画：游戏侧直接分发原始
> `*.animation.json`，只在 Blockbench 里做可视化和微调。

## 1. display 里要写什么

```json
{
  "model": "demo:gun/dp12_geo",
  "texture": "demo:gun/uv/dp12",
  "slot": "demo:gun/slot/dp12",

  "animation": "demo:dp12",
  "state_machine": "demo:dp12_state_machine",
  "state_machine_param": {
    "bolt_shell_ejecting_time": 0.17,
    "intro_shell_ejecting_time": 0.4
  },
  "use_default_animation": "rifle",
  "third_person_animation": "default",
  "player_animator_3rd": "tacz:rifle_default.player_animation",

  "sounds": {
    "shoot": "demo:dp12/dp12_shoot",
    "shoot_3p": "demo:dp12/dp12_shoot_3p",
    "reload_empty": "demo:dp12/dp12_reload_empty",
    "reload_tactical": "demo:dp12/dp12_reload_tactical",
    "inspect": "demo:dp12/dp12_inspect",
    "draw": "demo:dp12/dp12_draw",
    "put_away": "demo:dp12/dp12_put_away",
    "silence": "demo:dp12/dp12_silence"
  }
}
```

| 字段 | 作用 | 备注 |
|---|---|---|
| `animation` | 枪械动画文件，display 里省略后缀 | `assets/<ns>/animations/<name>.animation.json` |
| `state_machine` | Lua 状态机，省略 `.lua` | `assets/<ns>/scripts/<name>.lua`；不写则用内置默认状态机 |
| `state_machine_param` | 传给 Lua 的参数 | `context:getStateMachineParams()` 读取 |
| `use_default_animation` | 缺省动画来源 | `rifle` 或 `pistol`；自定义动画缺某个动作时从默认动画补 |
| `third_person_animation` | 第三人称动画 | 硬编码，目前 `default` |
| `player_animator_3rd` | Player Animator 第三人称 | 需要该模组 |
| `sounds.*` | 各动作音效 | 不写的音效走模组默认 |

## 2. 动画文件格式

TACZ 使用 Bedrock 动画 JSON，`format_version` 为 `1.8.0`：

```json
{
  "format_version": "1.8.0",
  "animations": {
    "static_idle": {
      "loop": true,
      "animation_length": 2.0,
      "bones": {
        "root": {
          "rotation": {
            "0.0": [0, 0, 0],
            "1.0": [0.2, 0, 0]
          }
        },
        "camera": {
          "rotation": {
            "0.0": { "post": [0, 0, 0], "lerp_mode": "catmullrom" },
            "0.25": { "post": [0, 0, 0.3], "lerp_mode": "catmullrom" }
          }
        }
      }
    },
    "draw": {
      "loop": "hold_on_last_frame",
      "animation_length": 1.0,
      "bones": {}
    },
    "shoot": {
      "animation_length": 0.2,
      "bones": {}
    }
  }
}
```

- 关键帧时间单位秒，支持 `pre` / `post` / `lerp_mode`（`linear`、`catmullrom`、`step`）。
- 骨骼名必须与 `geo_models` 里的骨骼一致；不存在的骨骼不会生效。
- 循环：`true` 循环、`"hold_on_last_frame"` 停在最后一帧、不写则播一次。
- `sound_effects` 可在动画时间点触发音效：
  ```json
  "sound_effects": { "0.0": { "effect": "dp12_draw" } }
  ```

### 常用动画名

| 类别 | 名称 |
|---|---|
| 静止/状态 | `static_idle`、`static_bolt_caught`、`static_ammo_display`、`static_semi`、`static_auto` |
| 操作 | `draw`、`put_away`、`shoot`、`reload_tactical`、`reload_empty`、`inspect`、`inspect_empty`、`bolt` |
| 移动 | `idle`、`walk`、`run_start`、`run`、`run_hold`、`run_end`、`walk_aiming` |
| 瞄准 | `ADS_up`、`ADS_down`、`walk_aiming` |
| 近战/快慢机 | `melee_bayonet_1..3`、`melee_stock`、`melee_push`、`switch_auto`、`switch_semi` |

具体枪型至少要有 `static_idle`、`draw`、`put_away`、`shoot`、`reload_*`；缺的用 `use_default_animation` 补。

## 3. 状态机 Lua

路径：`assets/<ns>/scripts/<name>.lua`。结构（默认状态机的简化版）：

```lua
local track_line_top = { value = 0 }
local static_track_top = { value = 0 }
local STATIC_TRACK_LINE = increment(track_line_top)
local BASE_TRACK = increment(static_track_top)
local MAIN_TRACK = increment(static_track_top)

local base_track_state = {}
function base_track_state.entry(this, context)
  context:runAnimation("static_idle", context:getTrack(STATIC_TRACK_LINE, BASE_TRACK), false, LOOP, 0)
end

local main_track_states = { start = {}, idle = {} }
function main_track_states.start.transition(this, context, input)
  if (input == INPUT_DRAW) then
    context:runAnimation("draw", context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK), false, PLAY_ONCE_STOP, 0)
    return this.main_track_states.idle
  end
end
function main_track_states.idle.transition(this, context, input)
  if (input == INPUT_RELOAD) then
    context:runAnimation("reload_tactical", context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK), false, PLAY_ONCE_STOP, 0.2)
    return this.main_track_states.idle
  end
  if (input == INPUT_SHOOT) then
    context:popShellFrom(0)
    return this.main_track_states.idle
  end
end

local M = {
  track_line_top = track_line_top,
  STATIC_TRACK_LINE = STATIC_TRACK_LINE,
  static_track_top = static_track_top,
  BASE_TRACK = BASE_TRACK,
  MAIN_TRACK = MAIN_TRACK,
  base_track_state = base_track_state,
  main_track_states = main_track_states
}
function M:initialize(context)
  context:ensureTrackLineSize(track_line_top.value)
  context:ensureTracksAmount(STATIC_TRACK_LINE, static_track_top.value)
end
function M:states()
  return { self.base_track_state, self.main_track_states.start }
end

local state_machine = {
  M = M,
  initialize = function(context) M:initialize(context) end,
  states = function() return M:states() end
}
return state_machine
```

### 状态方法

| 方法 | 时机 | 用途 |
|---|---|---|
| `entry(this, context)` | 进入状态一次 | 播放进入动画、隐藏准星等 |
| `update(this, context)` | 每帧 | 检测条件并 `context:trigger(input)` |
| `transition(this, context, input)` | 收到输入 | 返回下一个状态，或 `nil` 保持 |
| `exit(this, context)` | 离开状态一次 | 停动画、恢复准星 |

### 常用 context API

| API | 用途 |
|---|---|
| `runAnimation(name, track, blend, mode, blendTime)` | 播放动画；`blend=true` 叠加，`false` 覆盖 |
| `getTrack(line, track)` | 取轨道 |
| `findIdleTrack(line, create)` | 找空闲轨道（射击叠加用） |
| `stopAnimation(track)` / `isStopped(track)` / `isHolding(track)` | 停止/查询 |
| `trigger(input)` | 向状态机发输入 |
| `getAmmoCount()` / `hasBulletInBarrel()` | 弹药状态 |
| `getStateMachineParams()` | 读 display 的 `state_machine_param` |
| `setAnimationProgress(track, p, absolute)` / `adjustAnimationProgress(...)` | 精确控制进度（余弹显示等） |
| `setShouldHideCrossHair(bool)` | 检视时隐藏准星 |
| `getAimingProgress()` / `getWalkDist()` / `isOnGround()` | 玩家状态 |

播放模式常量：`LOOP`、`PLAY_ONCE_STOP`、`PLAY_ONCE_HOLD`。

### 什么时候需要自定义状态机

- 逐发装填（霰弹枪、栓动枪）；
- 空仓挂机、快慢机、双管轮流击发；
- 余弹动态显示、特殊检视；
- 其他默认状态机覆盖不了的输入序列。

普通步枪/手枪先用默认状态机，不要为了“完整”硬写 Lua。

## 4. 声音

- display 的 `sounds` 字段按动作名映射：`shoot`、`shoot_3p`、`reload_empty`、`reload_tactical`、`inspect`、`draw`、`put_away`、`silence`、`silence_3p` 等。
- 不写的键使用模组默认音效；`dry_fire`、`fire_select`、`head_hit`、`flesh_hit`、`kill` 也有默认值。
- 动画里的 `sound_effects` 可以按时间点触发额外音效。
- 音效资源放在枪包的 sounds 树中，保持与 display 引用一致；导出前用 `tacz_pack action="validate"` 检查引用。

## 5. 制作顺序（推荐）

1. **modeler**：先定骨骼/定位组（`root`、`camera`、`lefthand`、`righthand`、`constraint`、`muzzle_pos` 等），再建几何；动画需要转动的部件必须是独立骨骼（枪机、弹匣、快慢机、保险）。
2. **data-smith**：写 display 的 `animation` / `state_machine` / `state_machine_param` / `sounds`。
3. **animation**：先做 `static_idle` 和 `static_bolt_caught`，再做 `draw` / `put_away` / `shoot` / `reload_*` / `inspect`；每段单独验证循环和首尾帧。
4. **state machine**：普通枪先用默认；有特殊机制再写 Lua，先跑通“基态 + 主状态 + 枪机状态”，再加特殊状态。
5. **reviewer**：检查引用、动画名、骨骼名、循环模式、音效键、状态机语法（见下）。
6. **validate/package**：`tacz_pack action="validate"` + 实机加载。

## 6. 审核清单

- [ ] display 的 `animation` / `state_machine` / `sounds` 引用都能在包内找到。
- [ ] 动画 JSON 能解析，`format_version` 是 `1.8.0`，`animations` 非空。
- [ ] 常用动画名齐全；缺失的由 `use_default_animation` 覆盖。
- [ ] 动画里的骨骼名都在 geo 中存在。
- [ ] 动画首尾帧一致（循环类）或最后一帧合理（hold 类）。
- [ ] Lua 状态机：`M` 表、`initialize`、`states`、输入注册齐全；`entry/update/transition/exit` 没有语法错误；`runAnimation` 的轨道/模式参数正确。
- [ ] `state_machine_param` 的键和 Lua 读取的键一致。
- [ ] `sounds` 键存在且音量/时长合理；没有把参考音频直接放进包。
- [ ] `tacz_pack action="validate"` 0 error；实机至少验证 draw/reload/shoot 三个动作。

## 7. 参考

- [TACZ Wiki — 动画与状态机](https://tacwiki.mcma.club/zh/gunpack/gun/display/02_animation.html)
- [TACZ Wiki — 动画状态机脚本](https://tacwiki.mcma.club/zh/gunpack/gun/animation/state_machine_script.html)
- [TACZ Wiki — 动画约束 ICA](https://tacwiki.mcma.club/zh/gunpack/gun/animation/ica.html)
- 默认枪包 `vendor/TACZ/.../display/guns/*_display.json`
- DeepWiki: [Animation and State Machines](https://deepwiki.com/machinacanis/TACZ/4.3-animation-and-state-machines)

## 8. 当前工具限制

Blockbench MCP 的 `tacz_*` 工具目前导出 geometry、data、display、lang、UV 和 slot icon，**不生成** `animations/*.animation.json` 和 `scripts/*.lua`。这两类文件由 data-smith 直接写，reviewer 按第 6 节清单检查；如果需要在 Blockbench 里做关键帧，modeler 可用 animation 工具，但最终 JSON/Lua 仍需落到包内。
