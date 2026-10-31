# data-smith — 经验记录

完整历史经验，默认不进入系统提示词；需要时由 learner 或角色自己读取。

## Learned lesson — 2026-10-30T12:16:12.350Z

管式/双管霰弹枪不能保留霰弹枪模板默认值：`ammo_amount` 必须等于枪内总装填量（DP-12 = 2+14 = 16）、`reload.type` 改为 `manual`，并删掉 `extended_mag_ammo_amount` 以及 `extended_mag`、`stock` 两个附件位（bullpup 一体枪托无独立枪托）；验证：`tacz_pack action="validate"` 通过后再回读 data json 人工确认上述字段确已删除。

## Learned lesson — 2026-10-30T12:16:16.253Z

霰弹枪不能沿用步枪精度：`inaccuracy.aim` 0.2 是步枪量级，12ga 至少 2.5；填完 profile 后用 `tacz_pack action="validate"` 校验并比对同类霰弹枪的 aim 值，数量级不对就重填。

## Learned lesson — 2026-10-30T12:16:18.710Z

`bullet.life` 与 `damage_adjust` 是两个独立参数、不可合并：`life` 表达弹丸存活距离（speed × life），有效射程必须由 `damage_adjust` 三档衰减表达；DP-12 官方 25 yd 是散布标定，不是弹丸寿命，不要用它反推 life。

## Learned lesson — 2026-10-30T12:16:20.579Z

`bullet.life` 不要小于 0.05 s（1 tick），否则按 tick 量化时弹丸可能出膛即灭；0.15 s（约 58 m 存活距离）作为安全下限参考，并核对 speed × life 与目标射程同量级。
