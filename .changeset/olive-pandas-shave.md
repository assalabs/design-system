---
"@assalabs/create-design-system": minor
---

Scaffold `white-alpha` and `black-alpha` primitive ramps.

New projects now ship `tokens/primitives/alpha.tokens.json` alongside the
existing dimensions, typography and motion primitives, with the resolver
composing it into the `primitives` set.

Alpha is a chosen constant rather than something derived from the brand seed,
so it belongs beside the other hand-authored primitives instead of in the
palette generator. The generator still owns only `primitives/colors.tokens.json`
and the two semantic theme files, so it never overwrites this file.

Steps are denser at the low end, where subtle surfaces and hover states need
the resolution, and coarser at the top, where a scrim only needs to be dark.
