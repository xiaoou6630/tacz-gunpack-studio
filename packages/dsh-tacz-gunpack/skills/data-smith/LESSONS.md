# data-smith — lesson log

Full history, kept out of the system prompt by default. The learner or the role
itself reads this file when it needs the long form.

## Learned lesson — 2026-10-30T12:16:12.350Z

Tube-magazine and double-barrel shotguns must not keep the shotgun template
defaults. `ammo_amount` must equal the total the gun actually holds (DP-12 = 2+14
= 16), `reload.type` becomes `manual`, and both `extended_mag_ammo_amount` and the
`extended_mag`/`stock` attachment slots are removed — a bullpup has an integral
stock and no separate one. Check: pass `tacz_pack action="validate"`, then read
the data JSON back to confirm those fields are really gone.

## Learned lesson — 2026-10-30T12:16:16.253Z

A shotgun must not inherit rifle accuracy. `inaccuracy.aim` of 0.2 is rifle-grade;
12ga needs at least 2.5. After filling the profile, run
`tacz_pack action="validate"` and compare the aim value against other shotguns of
the same class; if the magnitude is wrong, refill it.

## Learned lesson — 2026-10-30T12:16:18.710Z

`bullet.life` and `damage_adjust` are independent parameters and cannot be
merged. `life` expresses how long the projectile survives (speed × life), while
effective range must be expressed through the three tiers of `damage_adjust`.
DP-12's published 25 yd figure is a spread specification, not projectile
lifetime — do not back out `life` from it.

## Learned lesson — 2026-10-30T12:16:20.579Z

Keep `bullet.life` at or above 0.05 s (one tick); anything shorter can be
quantised to a projectile that dies the moment it leaves the muzzle. Use 0.15 s
(roughly 58 m of travel) as a safe lower bound, and check that speed × life lands
in the same order of magnitude as the intended range.
