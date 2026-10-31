# reviewer — 经验记录

完整历史经验，默认不进入系统提示词；需要时由 learner 或角色自己读取。

## Learned lessons

- 2026-10-25T07:34:58.390Z — If `tacz_icon_render` is not in the reviewer allow-list, do not skip the 64px readability check; read the slot icon PNG directly with `read_image`.
- 2026-10-25T07:41:23.705Z — Full icon fallback chain is `tacz_icon_render` → `capture_screenshot` → slot PNG via `read_image` → `icon_unverified` (major). Never silently pass the icon check.

## Learned lesson — 2026-10-30T12:16:12.316Z

判定共面面是否「可见」时，必须在重叠矩形上采样、沿各自法线做约 4 unit 的 Ray-AABB 遮挡测试，只有射线上无任何其他方块实体才算暴露面；仅判断采样点是否落在某方块内部，会把「贴板内侧面与本体共面」误判成可见（DP-12 首轮 22 对 → 实际 5 对）。

## Learned lesson — 2026-10-30T12:16:16.240Z

几何一改，`tacz_gun export` 就会重排 UV 图集，上一轮的 UV 唯一性/越界结论全部作废；每轮 review 都要在最新 export 产物上重跑逐面 UV 矩形检查（唯一、无重叠、无越界、无全透明可见面），不能引用上轮结论。
