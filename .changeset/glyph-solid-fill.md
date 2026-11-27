---
"@sketchy-js/sketchy": patch
---

Solid fills of a glyph outline no longer punch out a same-winding overlap. A bowl and a stem that share a winding and actually overlap, as in Fredoka `b`, `d`, `g`, `p`, and `q`, are unioned before the even-odd fill. A counter stays open. A glyph that does not overlap is left unchanged, so other seeded output stays put.
