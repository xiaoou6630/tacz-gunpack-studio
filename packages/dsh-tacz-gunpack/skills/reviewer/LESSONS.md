# reviewer — lesson log

Full history, kept out of the system prompt by default. The learner or the role
itself reads this file when it needs the long form.

## Learned lessons

- 2026-10-25T07:34:58.390Z — If `tacz_icon_render` is not in the reviewer allow-list, do not skip the 64px readability check; read the slot icon PNG directly with `read_image`.
- 2026-10-25T07:41:23.705Z — Full icon fallback chain is `tacz_icon_render` → `capture_screenshot` → slot PNG via `read_image` → `icon_unverified` (major). Never silently pass the icon check.

## Learned lesson — 2026-10-30T12:16:12.316Z

Deciding whether a co-planar face is actually *visible* requires sampling across
the overlapping rectangle and casting a roughly 4-unit ray along each face's
normal through the model. Only a ray that hits no other cube geometry counts as
an exposed face. Testing merely whether the sample point falls inside some cube
misreads "a plate's inner face is co-planar with the body" as visible — DP-12's
first round reported 22 pairs where only 5 were real.

## Learned lesson — 2026-10-30T12:16:16.240Z

The moment the geometry changes, `tacz_gun export` re-lays the UV atlas and every
UV uniqueness or bounds conclusion from the previous round is void. Each review
must re-run the per-face UV checks on the newest export — unique, no overlap, no
out-of-bounds, no fully transparent visible face — and must not cite last round's
result.
