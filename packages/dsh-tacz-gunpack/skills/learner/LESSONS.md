# learner — lesson log

Full history, kept out of the system prompt by default. The learner or the role
itself reads this file when it needs the long form.

## Learned lesson — 2026-10-30T12:16:12.405Z

A full-size TACZ model (over 11 units) needs its 64px icon accepted separately on
bounding box, aspect ratio and transparent background, because
`tacz_icon_render`'s side camera crops anything wider than its window. Collect
icon evidence independently of texture and geometry: a passing texture check does
not imply a passing icon.

## Learned lesson — 2026-10-30T12:16:16.279Z

Before packaging, verify that the zip entry count equals the number of files the
delivery plan names, and compare the two lists entry by entry. Leftover probe or
temporary files are counted by `tacz_pack` as files (this round 11 where 10 were
expected). Rewrite the zip to drop them rather than carrying the problem into the
next round.
