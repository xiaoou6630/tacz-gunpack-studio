# researcher — 经验记录

完整历史经验，默认不进入系统提示词；需要时由 learner 或角色自己读取。

## Learned lesson — 2026-10-30T12:16:12.385Z

DP-12 双枪管是左右并列（side-by-side），不是上下并列（over-under）；写 brief 前必须用参考图或官方规格确认枪管排布，并在 `notes` 里明确写出「左右并列」这一结论及其来源。

## Learned lesson — 2026-10-30T12:16:16.270Z

DP-12 是单扳机两次扣压（右管先、左管后），不是双扳机；brief 的 parts/notes 里写「双扳机」会让建模方直接返工，触发机构描述必须与查证来源一致。

## Learned lesson — 2026-10-30T12:16:18.748Z

TACZ 内置弹药 id（如 `tacz:12g`）必须用模板默认值或弹药对照表交叉核实后才能写进 brief，不要凭印象；写错 ammo id 会让 `tacz_pack action="validate"` 直接报 error 并触发返工。
