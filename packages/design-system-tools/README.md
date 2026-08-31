# @assalabs/design-system-tools

Build-time tooling that turns DTCG design tokens into static CSS and plain
TypeScript themes for web and React Native.

The package wraps a pinned Terrazzo toolchain and adds semantic-contract,
theme-parity, contrast, and generated-output drift checks, plus a palette
generator that derives a full accessible token set from one brand colour.

Requires Node.js 22 or newer.

```bash
pnpm add --save-dev @assalabs/design-system-tools
```

Applications do not depend on this package at runtime. They consume only the
generated outputs published by their theme package.

## Commands

```bash
assalabs-ds tokens build           # generate every configured output
assalabs-ds tokens check           # regenerate in memory, byte-compare, fail on drift
assalabs-ds tokens watch           # rebuild on token or config change
assalabs-ds palette --brand '#FF3131'
```

Every command takes `--config <path>` (default `design-system.config.mjs`) and
`--debug`. Run `assalabs-ds --help` or `assalabs-ds palette --help` for the full
option list.

## `palette`

`palette` derives eleven-step ramps and both semantic themes from a single seed
and writes three files into the token directory:

```text
primitives/colors.tokens.json
semantic/light.tokens.json
semantic/dark.tokens.json
```

It refuses to overwrite existing files unless `--force` is passed, and reports
every file that would be clobbered in one run rather than stopping at the first.
`--json` prints the primitives, the anchor step per ramp, the resolved semantic
roles, and the contrast report to stdout and writes nothing.

```bash
assalabs-ds palette --brand '#FF3131'                    # derive everything
assalabs-ds palette --brand '#FF3131' --neutral gray     # achromatic neutral
assalabs-ds palette --brand '#FF3131' --accent '#31FFB0' # pin the accent
assalabs-ds palette --brand '#FF3131' --json             # preview, write nothing
```

### Derivation rules

All colour maths happens in OKLCH, via culori.

| Ramp      | Hue                     | Chroma                                          |
| --------- | ----------------------- | ----------------------------------------------- |
| `brand`   | the seed's own hue      | the seed's own chroma                           |
| `neutral` | the **brand hue**, kept | `min(0.015, brand chroma)` — a tint, not a grey |
| `accent`  | brand hue **+ 150°**    | the brand's chroma                              |
| `success` | fixed **145**           | brand chroma clamped to `[0.09, 0.19]`          |
| `warning` | fixed **80**            | same                                            |
| `danger`  | fixed **25**            | same                                            |
| `info`    | fixed **250**           | same                                            |

`--neutral gray` forces chroma to `0` for a truly achromatic neutral;
`--neutral <hex>` and `--accent <hex>` replace the derivation with your seed.

Each ramp has steps `50 … 950`. The seed hex is **preserved exactly** at one
step: derived seeds anchor at `500`, and a user-supplied seed anchors at
whichever step's reference lightness is nearest to it, so `#123456` anchors at
`900` and `#fff5f5` at `50`. The rest of the ramp is re-fitted from that anchor
towards fixed light and dark ends, so the seed never drifts and the ends stay
put. Chroma follows a per-step multiplier curve peaking at `500`, and every step
is gamut-mapped into sRGB with `clampChroma`.

Semantic roles are then **chosen by contrast, not by convention**. Each role has
an ordered candidate list, and the first candidate that satisfies every declared
pair wins:

| Pair                                                  | Minimum |
| ----------------------------------------------------- | ------- |
| `fg.default` on `bg.canvas`                           | 4.5     |
| `fg.muted` on `bg.canvas`, `fg.muted` on `bg.surface` | 4.5     |
| `fg.onBrand` on `brand.default`                       | 4.5     |
| `border.strong` on `bg.canvas`                        | 3       |
| each `status.*` on `bg.canvas`                        | 3       |

`brand.default` and `fg.onBrand` are resolved **jointly**: the brand ramp is
walked from its anchor outwards (darker first, then lighter) until a step
reaches 4.5 against either white or `neutral.950`, and the winner picks the
foreground. `brand.hover` and `brand.active` are then one and two steps further
along that ramp — darker in light mode, lighter in dark mode.

The scaffolded theme's `contrastPairs` are exactly this table, so
`assalabs-ds tokens check` re-asserts what `palette` promised.

### Edge cases

- **Achromatic seeds.** `#000000`, `#ffffff` and `#808080` have no hue at all.
  Their ramps are built at chroma `0`, and the accent's "+150°" is a rotation of
  an undefined hue, so it too comes out neutral. Ask for colour with a chromatic
  seed.
- **Near-white and near-black seeds.** Gamut mapping shifts hue slightly, so the
  accent lands _near_ +150° rather than exactly on it (`#fff5f5` measures
  ~147°). Mid-lightness chromatic seeds hit +150° to within half a degree.
- **Extreme seeds** anchor at the end of the ramp (`50` or `950`), which leaves
  one side of the ladder short. The ramp still spans light to dark, but with
  fewer distinct steps on the crowded side.
- **Unsatisfiable seeds** raise a `PaletteError` naming the pair and the best
  ratio found, for example
  `light: no candidate for color.fg.muted satisfies fg.muted/bg.canvas ≥ 4.5 (best 4.12)`.
  Nothing is written when this happens.

`generatePalette` is pure — no IO, no randomness, no clock — so the same seed
always produces byte-identical files.

## Config

`design-system.config.mjs` exports `defineDesignSystem({ … })`. At least one of
`outputs.css` or `outputs.native` is required.

```js
import { defineDesignSystem } from "@assalabs/design-system-tools";

export default defineDesignSystem({
  name: "Acme",
  prefix: "ac",
  source: "./tokens/theme.resolver.json",
  themes: ["light", "dark"],
  defaultTheme: "light",
  outputs: {
    css: "styles/generated.css",
    native: "src/generated/themes.ts",
    tokenNames: "src/generated/tokenNames.ts",
    stylex: { file: "src/generated/tokens.stylex.ts" },
    unistyles: { dir: "src/generated/" },
  },
  requiredTokens: ["color.bg.canvas", "color.fg.default"],
  contrastPairs: [
    {
      foreground: "color.fg.default",
      background: "color.bg.canvas",
      minimum: 4.5,
    },
  ],
});
```

Every output path is relative to the theme package root and must stay inside it.

`outputs.css` emits one stylesheet with a flat `:root` block, explicit
`[data-theme="light"]` / `[data-theme="dark"]` blocks, and a
`@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` block — so an
app follows the system by default and `data-theme` on `<html>` pins it.

`outputs.native` emits plain TypeScript theme objects, **nested by token path**:
`theme.color.bg.canvas`, `theme.dimension.radius.md`. Native colours are sRGB
hex and dimensions are unitless numbers; anything that cannot be expressed that
way fails the build instead of emitting invalid React Native.

### `outputs.stylex`

```text
outputs: { stylex: { file: "src/generated/tokens.stylex.ts" } }
```

Emits one file of flat `stylex.defineVars` groups — `colors`, `spacing`,
`radius`, `dimensions`, `fonts`, `motion`, and one `typography<Variant>` group
per typography variant. Keys are **camelCase and flat**, so `color.fg.onBrand`
becomes `colors.fgOnBrand` and `dimension.space.4` becomes `spacing[4]`.
(`dimension.breakpoint.*` is deliberately absent: breakpoints are media queries,
not variables.)

**Requires `outputs.css`**, and requires `themes` to be exactly
`["light", "dark"]`. Theme-dependent tokens — every colour, plus any other token
whose light and dark values differ — are emitted as a `var()` reference to the
custom property the stylesheet already declares:

```ts
export const colors = stylex.defineVars({
  bgCanvas: "var(--ac-color-bg-canvas)",
  fgOnBrand: "var(--ac-color-fg-on-brand)",
});

export const spacing = stylex.defineVars({
  "4": "16px",
});
```

Note that the StyleX **key** is camelCase (`fgOnBrand`) while the **custom
property** is kebab-cased and lowercased (`--ac-color-fg-on-brand`); the adapter
derives the reference from the same helper the CSS plugin declares with, so the
two cannot drift.

Everything theme-independent stays a literal, so it still inlines. Dark mode is
driven entirely by the theme's `generated.css`: importing `<pkg>/css` once is
what makes the StyleX variables resolve, and switching `data-theme` on `<html>`
recomputes them. `stylex.defineVars` cannot carry the override itself — StyleX
0.19 treats every non-`default` key of a value object as an at-rule, so a
selector key lowers to a dead `[data-theme=dark] :root` descendant rule.

Consuming apps need StyleX's `unstable_moduleResolution` set to
`type: "commonJS"` with a `rootDir` at the workspace root, plus
`treeshakeCompensation`, so the compiled variable definitions survive bundling.

### `outputs.unistyles`

```text
outputs: { unistyles: { dir: "src/generated/", spacingBaseToken: "dimension.space.base" } }
```

Emits a **single** `<dir>/unistyles.ts` containing the themes, the breakpoints,
`configureUnistyles()`, and the `react-native-unistyles` module augmentation.

**Requires `outputs.native`**, and `dir` must contain the directory of
`outputs.native`, because the generated module imports the themes file with a
relative specifier. `themes` must be exactly `["light", "dark"]`.

```ts
import { configureUnistyles } from "@acme/theme/unistyles";
configureUnistyles(); // before any StyleSheet.create call

StyleSheet.create((theme) => ({
  screen: {
    backgroundColor: theme.color.bg.canvas, // nested, like outputs.native
    padding: theme.spacing(3), // 3 × dimension.space.base
  },
}));
```

- The theme shape is the **nested** native shape (`theme.color.bg.canvas`), not
  the flat camelCase StyleX shape.
- `spacing(factor)` multiplies `spacingBaseToken` (default `dimension.space.base`,
  falling back to `8` with a warning when the token is absent).
- Breakpoints come from `dimension.breakpoint.*`. Unistyles requires a
  breakpoint at `0`, so `xs: 0` is injected when no token provides one.
- The `declare module` augmentation is **inline in `unistyles.ts`**; no sibling
  `unistyles.d.ts` is emitted. TypeScript drops a declaration file shadowed by a
  same-named `.ts` from wildcard-`include` programs, and module resolution
  prefers the `.ts`, so a sibling declaration would silently never load. The
  augmentation applies wherever the module is imported.
- Keep `unistyles.ts` out of your bundler entries: it must reach the consumer as
  source, both so Metro compiles it and so the augmentation loads.

## Error output

Failures exit `1` and print one line to stderr. That line is the finished
message for everything this tool raises itself — `PaletteError`, config
validation, unsatisfied `requiredTokens` or `contrastPairs`, stale generated
output.

It is a summary, not the whole story, for errors that merely pass _through_ the
tool. `design-system.config.mjs` is imported as real ESM, so a mistake inside it
is V8's error, not ours:

```console
$ assalabs-ds tokens build
Could not load /repo/packages/theme/design-system.config.mjs: Unexpected end of input
```

The config path is prefixed onto those messages, because the underlying error
does not name a file. Pass `--debug` for the stack and the `cause` chain:

```console
$ assalabs-ds tokens build --debug
Error: Could not load /repo/packages/theme/design-system.config.mjs: …
    at loadDesignSystemConfig …
Caused by: TypeError: Cannot read properties of undefined (reading 'css')
    at file:///repo/packages/theme/design-system.config.mjs:12:25
```

For a **runtime** error in the config, `--debug` gives the exact line and
column. For a **syntax** error the cause's stack is pure Node module-loader
frames and names no file or line at all, so the path in the message is the only
locator you get — check the file the message names.

`--debug` never changes the curated messages above; it only adds the stack after
them.
