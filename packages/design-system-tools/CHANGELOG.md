# @assalabs/design-system-tools

## 0.3.0

### Minor Changes

- 251114f: Palette generation, opt-in StyleX and Unistyles adapters, and app templates.

  **`assalabs-ds palette`** turns one seed hex into a whole token set. Every ramp —
  `brand`, `neutral`, `accent`, and the four status ramps — is built in OKLCH and
  runs `50`–`950`, with the seed preserved exactly at whichever step's lightness it
  matches. `neutral` keeps the brand hue at low chroma so greys are tinted rather
  than dead, `accent` is the brand hue rotated by 150°, and the status ramps use
  fixed hues. Semantic light and dark roles are then chosen by contrast rather than
  convention: each role walks an ordered candidate list until every declared pair
  holds, and `brand.default` and `fg.onBrand` are resolved jointly by walking the
  brand ramp outwards from its anchor. The command writes
  `primitives/colors.tokens.json` and `semantic/{light,dark}.tokens.json`, refusing
  to clobber existing files unless `--force` is passed and reporting every
  collision in one run. `--brand` seeds it; `--neutral <hex>|gray` and
  `--accent <hex>` override their derivations; `--json` previews the primitives,
  anchors, resolved roles, and contrast report without writing; `--debug` prints
  the stack and `cause` chain. `generatePalette` is pure, so the same seed always
  produces byte-identical files.

  **`outputs.stylex`** (opt-in) emits one file of flat `stylex.defineVars` groups
  with camelCase keys — `color.fg.onBrand` becomes `colors.fgOnBrand`. Themed
  colours are emitted as `var(--<prefix>-…)` references to the custom properties
  the stylesheet already declares, derived from the same helper the CSS plugin
  declares with, so the two cannot drift; theme-independent tokens stay literals
  and still inline. It requires `outputs.css`, since that stylesheet is what makes
  the variables resolve and what makes `data-theme` switching work.

  **`outputs.unistyles`** (opt-in) emits a single `unistyles.ts` containing the
  themes, the breakpoints, and `configureUnistyles()`, which calls
  `StyleSheet.configure` with `adaptiveThemes: true`. The theme shape is the nested
  native shape (`theme.color.bg.canvas`), a `spacing(factor)` helper multiplies
  `dimension.space.base`, and breakpoints come from `dimension.breakpoint.*` with
  `xs: 0` injected when no token provides one. The `react-native-unistyles` module
  augmentation is inlined in that same file rather than emitted as a sibling
  declaration, because TypeScript drops a `.d.ts` shadowed by a same-named `.ts`.
  It requires `outputs.native`.

  **`create-assalabs-design-system init --template expo|web|none`** adds app
  templates alongside the existing theme scaffold. `expo` and `web` scaffold a
  whole workspace — root manifest, `pnpm-workspace.yaml`, `turbo.json`, dotfiles,
  `build:theme` and `check:theme` scripts, a `theme-check.yml` CI workflow, and an
  app wired to the theme — so they are for new repos; `--template none` stays the
  option for an existing monorepo. `--bundler rsbuild|vite` picks between the two
  web templates and is prompted when the web template is chosen interactively. The
  generated palette is injected into the scaffolded theme, with the
  `color.brand.primary` alias pointed at the ramp step the seed actually anchored
  on rather than a hardcoded `500`.

  **`dimension.space.base`** is added to the template tokens, giving the Unistyles
  `spacing()` helper its multiplier.

  All of the above is additive. A `design-system.config.mjs` without the new
  `outputs.stylex` and `outputs.unistyles` keys produces byte-identical output to
  the previous release, so existing consumers can upgrade the tooling in place and
  adopt the adapters later.

## 0.2.0

### Minor Changes

- 50ad335: Initial public release with trusted publishing

## 0.1.0

### Minor Changes

- a8e2b32: Publish the initial reusable design-system compiler and theme initializer.
