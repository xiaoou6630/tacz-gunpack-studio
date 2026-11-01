# modeler — 经验记录

完整历史经验，默认不进入系统提示词；需要时由 learner 或角色自己读取。

## Learned lesson — 2026-11-01T16:00:00.000Z

做出来的枪"简陋"和"精致"的差别，不在 AI 强弱，在**有没有跑完验证再重做**。DP-12 用 3 小时反复截图修正（`.scratch/` 里留着 `slot_approved_before_fix.png` 和 `slot_after_fix.png`），KSG 被 `REOPEN` 退回重做 4 轮；danuvia_43m 只走了 INIT→RESEARCH→BLUEPRINT，`GEOMETRY` 卡住后就在原地加方块（96→126），从没进入上色阶段。验证方式：看 `.tacz/builds/<gun>.json` 的 history 里有没有 `REOPEN`，没有就说明它没迭代过。

## Learned lesson — 2026-11-01T16:00:01.000Z

`tacz_texture_init` 只是"打底色"，不是"画贴图"。它的输出上限是每面一个材质纯色 + 1px 高光，实测只有 5~9 种颜色；DP-12 的 217 色、KSG 的 430 色都是在这之后逐像素画出来的明暗层次。所以 gate 报 `distinct_colours` 不足时，正确反应是**去画**，而不是继续加方块。参考数据：DP-12 亮度跨 14 档（16→223），相邻像素 23% 不同；danuvia 只有 5 种颜色，0% 变化。

## Learned lesson — 2026-11-01T16:00:02.000Z

Bedrock geometry 的 cube 没有 `name` 字段，工程从 `*_geo.json` 重新打开后，方块名会退化成骨骼名（通常全是 `AKM`）。这时 `materialForName("AKM")` 匹配不到任何材质规则，整把枪会涂成同一个灰。两个对策：一是**建方块时就按部件命名**（`receiver_core`/`barrel_body`/`stock_butt`），二是不命名时接受按索引轮换 steel/steel_dark/polymer/wood（已内置）。

## Learned lesson — 2026-11-01T16:00:03.000Z

贴图大面积出现调色板以外的颜色（例如 `#3bbb2f` 占 90%），说明有人用 `paint_fill_tool` 的 `fill_mode="color"` 整片填充过。`TACZ_MATERIALS` 只有 9 种颜色，绿色不在其中，所以那一定是后续手刷的。规则：`fill_mode` 只能用 `face` 或 `selection`，颜色只能取自 `TACZ_MATERIALS` 或 design-brief 的 `palette.swatches`。

## Learned lesson — 2026-11-01T16:00:04.000Z

验证脚本必须零额外运行时。DP-12 的 `verify_m1_m4.py` 用了 Pillow，换台没装 Python 的机器就直接失效。改用 `tools/check-pack-geometry.mjs`（纯 Node，PNG 靠 `node:zlib` 自己解），硬检查五项、警告两项，KSG 通过、danuvia 三项不过，能准确区分好坏。

## Learned lesson — 2026-10-30T12:16:12.273Z

端盖类部件（枪口帽、托底盖、镜环盖）的外芯体 z 范围必须比两侧端盖各短 ≥0.2 unit，否则端面与芯体端面共面同向，移动视角时出现闪烁缝隙（DP-12 首版因此产生 96 对共面面）；验证：导出后对全部方块 AABB 做两两检测，同平面同法线且重叠面积 >0 的面对数应为 0。

## Learned lesson — 2026-10-30T12:16:16.226Z

子组件（护木底轨、导轨齿、背带环、前握把）不得与主体悬空 0.1–0.2 unit，否则会成为独立连通分量并被 reviewer 记为 major 缺陷；建完必须自检 AABB 连通分量数 = 1（计入 inflate 后的接触），悬空件要么贴到主体、要么补一段连接块焊住。

## Learned lesson — 2026-10-30T12:16:18.672Z

`tacz_icon_render` 的 side 相机 zoom 写死、可见窗约 11 unit，42 unit 的全尺寸枪模会被裁成中段特写；正确做法是先把全部骨骼等比缩放（如 0.24）居中渲染出图，再逐位还原原始尺寸，并回读求证的 64px PNG 确认枪口与托底都在框内。

## Learned lesson — 2026-10-30T12:16:20.541Z

`tacz_gun export` 会重排 UV 图集，改过几何后上一轮的 UV 检查结论即失效；每次 export 后必须重跑「逐面 UV 矩形唯一、无重叠、无越界 [0,128]、无全透明可见面」四项检查，不能沿用上一轮结果。

## Learned lesson — 2026-10-30T12:16:22.062Z

不要在 `assets/` 或 `refs/` 下留 `_write_test.txt` 之类写权限探测文件——沙箱 ACE 不继承到后建的子目录，shell 事后删不掉，最终会污染 zip 条目数；探测只在打包根目录外做，或探测后立刻在同一会话内删除并用 `glob` 复核无残留。
