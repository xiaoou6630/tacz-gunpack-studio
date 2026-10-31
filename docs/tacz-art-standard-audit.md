# TACZ 美术规范对照审计（KSG）

依据官方 Wiki：模型建造指南（[设置](https://tacwiki.mcma.club/zh/model_guide/setting.html)、[建模](https://tacwiki.mcma.club/zh/model_guide/model.html)、[贴图](https://tacwiki.mcma.club/zh/model_guide/texture.html)）、[特殊组名](https://tacwiki.mcma.club/zh/gunpack/gun/03_sp_group_name.html)、[手臂定位](https://tacwiki.mcma.club/zh/gunpack/gun/04_hand_pos.html)、[视觉定位](https://tacwiki.mcma.club/zh/gunpack/gun/05_gun_position.html)、[HUD](https://tacwiki.mcma.club/zh/gunpack/gun/display/03_hud.html)、[LOD](https://tacwiki.mcma.club/zh/gunpack/gun/06_lod.html)。

## 1. 官方硬标准

| 项 | 官方要求 |
|---|---|
| 比例 | **1000 mm = 48 grid**；`x = 48 * L / 1000` |
| 对称 | 模型关于 Z-Y 平面对称；枪管朝 N（-Z） |
| 尺寸粒度 | 建议 0.125 的倍数，便于 UV 对齐 |
| 导轨 | 底部宽 **0.75 grid**；常用 1-3-1 或 1-5-1 齿型；以 0.25 为一个导轨单位 |
| 圆 | 半径 >1 用八边形；<0.75/0.5 可用单方块；大半径可十六边形；尽量实心 |
| Z-fighting | 交叉面用 inflate ±0.001–0.005；垂直交叉尽量避开 |
| 高模面数 | 官方高模 ak47 761 cubes、m870 273 cubes；LOD 25–50 cubes |
| UV | 逐面 UV；面矩形应唯一，避免重叠；贴图只画用到的区域 |
| 贴图 | 枪铁低饱和（饱和度 ≤20，5–10 佳；色相蓝-青）；亮面低饱和、暗面高纯度；避免纯黑/纯白；用明暗交界、AO、抖动 |
| slot | 64×64 正方形；等轴右（2:1）；关阴影；裁 alpha；官方 m870 slot 64×64、438 色 |
| HUD | 3:1；180×60 / 192×64 / 384×128；侧视、枪口朝左；官方 m870 384×128、80 色 |
| 手 | `lefthand_pos` / `righthand_pos` 定位组；官方父组 `bullet_and_lefthand`、`gun_and_righthand` |
| 视图 | `views/idle_view/iron_view/ground/thirdperson_hand/fixed` 必须存在且非零 |
| LOD | 独立 `lod` 组；25–50 cubes；display `lod.model/texture` |

## 2. 当前 KSG 实测差距

| 项 | 官方/目标 | 当前 | 差距 |
|---|---|---|---|
| 总长 | 26.1 in = 662.9 mm → **31.8 grid** | **37.5 grid** | **+17.8%** |
| 宽 | 3 in = 76.2 mm → **3.66 grid** | **4.84 grid** | **+32%** |
| 高 | 7 in = 177.8 mm → **8.53 grid** | **10.0 grid** | **+17%** |
| 导轨 | 底宽 0.75，1-5-1 齿 | 3.4 宽整条 slab，7 cubes | 过宽、无齿型 |
| 枪管 | 八边形/多片 | 1 个 1.3×1.3 实心 cube | 方块感 |
| 高模面数 | 273–761 cubes | **69 cubes** | LOD 级，不是高模 |
| UV | 逐面唯一 | **6361 对面重叠**；大量面共用 `[6,6] 4×4` | 严重重叠 |
| UV 覆盖 | 按面唯一铺 | 15%，但重复 | 无效覆盖 |
| 贴图 | 官方 m870 256×256、424 色、5685 opaque px | 128×128、**36 色**、**16384 全不透明** | 颜色/细节严重不足 |
| slot | 官方 438 色 | 36 色 | 图标平、暗 |
| HUD | 384×128 80 色 | 192×64，36 色 | 尺寸/细节不足 |
| LOD | 必须有 | 无 | 缺 |
| 声音/枪口火焰/副手/快捷栏 | display 可选但官方默认包都有 | 无 | 缺 |

## 3. 结论

当前 KSG **不是“美术不够好”，而是没有按官方建模规范做**：

1. 比例整体偏大 18–32%，所以第一人称显得巨大、手位难对。
2. 导轨和枪管是“一个大方块”，不是官方 0.75 导轨 + 八边形枪管。
3. 69 cubes 是 LOD 级别，不是高模；细节不足导致图标/轮廓不像官方。
4. UV 大面积重叠（6361 对面），贴图只有 36 色且整张不透明，导致 slot/HUD 平、暗。
5. 缺 LOD、muzzle_flash、sounds、offhand/hotbar。

## 4. 修复顺序

1. **GEOMETRY 重开**：按 31.8 grid 重定总长；宽度收到 3.66；高度 8.53。
2. **导轨**：底宽 0.75，1-5-1 齿，0.25 单位；不再整条 slab。
3. **枪管/弹仓**：八边形截面，至少 8 片；弹仓管同。
4. **面数**：高模提到 200+ cubes；LOD 单独 25–50。
5. **UV 重排**：逐面唯一矩形，消除 6361 重叠；按实际面尺寸分配。
6. **贴图**：128 或 256；低饱和蓝灰；亮/暗面层次；AO/抖动；不要全图黑底。
7. **slot/HUD 重出**：iso 64 关阴影裁切；HUD 384×128 3:1 侧视枪口左。
8. **display 补齐**：lod、muzzle_flash、sounds（可复用默认）、offhand/hotbar。
9. 重新 review/package；旧的 `2355...` review 失效。

这不是一轮 10 分钟能完成的修补，是 GEOMETRY+DATA 的美术重做。
