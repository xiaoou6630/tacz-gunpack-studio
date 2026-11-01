# researcher — lesson log

Full history, kept out of the system prompt by default. The learner or the role
itself reads this file when it needs the long form.

## Learned lesson — 2026-10-30T12:16:12.385Z

DP-12's two barrels are side-by-side, not over-under. Confirm barrel layout
against a reference image or the official specification before writing the brief,
and state the conclusion and its source explicitly in `notes`. Getting this wrong
sends the modeler straight into a rebuild.

## Learned lesson — 2026-10-30T12:16:16.270Z

DP-12 fires from a single trigger pulled twice (right barrel first, then left);
it is not a double-trigger gun. Writing "double trigger" in the brief's
parts/notes forces the modeler to rework the mechanism, so any description of the
action must match a verified source.

## Learned lesson — 2026-10-30T12:16:18.748Z

TACZ built-in ammunition ids (such as `tacz:12g`) must be cross-checked against
the template default or an ammunition reference table before they go into the
brief. Do not write one from memory: a wrong ammo id makes
`tacz_pack action="validate"` report an error and triggers rework.
