# {{DESIGN_SYSTEM_NAME}}

A React web app and its design system in one workspace. Every colour, space,
radius and font on screen comes from `packages/theme`.

```text
packages/theme     DTCG tokens -> CSS variables and StyleX variables
apps/web           Vite + React app consuming {{scope}}/theme
```

## Getting started

```bash
pnpm install
pnpm build:theme
pnpm --filter {{scope}}/web dev
```

## The token loop

1. Edit the DTCG JSON under `packages/theme/tokens/`.
2. `pnpm build:theme` regenerates `styles/generated.css` and
   `tokens.stylex.ts`.
3. `pnpm check:theme` re-asserts required tokens, light/dark parity, every
   declared contrast pair, and that no generated file drifted.

`.github/workflows/theme-check.yml` runs the same checks in CI.

## How theming works here

`src/styles.css` imports `{{scope}}/theme/css`, which declares the
`--{{prefix}}-*` custom properties on `:root` with `[data-theme="light"]`,
`[data-theme="dark"]`, and `prefers-color-scheme` blocks. The generated StyleX
variables do not carry their own dark values — they are `var()` references to
those custom properties, so the stylesheet drives all three states and
`ThemeToggle` only has to set `data-theme` on `<html>`.

`pnpm --filter {{scope}}/web build` runs `scripts/assert-stylex-build.mjs`, which
fails the build if the StyleX compiler never ran, if its atoms do not alias the
`--{{prefix}}-*` properties, or if flipping `data-theme` would not actually
change what a colour resolves to.

## Checking dark mode

The build assertion proves the wiring; it cannot prove the page _looks_ right.
Verify by hand after any token change:

1. `pnpm --filter {{scope}}/web dev`.
2. Use the in-app **system / light / dark** toggle and confirm each state
   repaints. `system` clears `data-theme`; the other two pin it.
3. Leave the toggle on `system` and switch the OS appearance — macOS
   **System Settings → Appearance**, or Chrome DevTools **Rendering → Emulate
   CSS `prefers-color-scheme`**. The page must follow without a reload.
4. Confirm body text, muted text, borders and the primary button stay legible in
   both themes — those are the pairs `check:theme` guarantees, so a surprise
   here means a token was edited without rerunning the build.

## Upgrading the tooling

```bash
pnpm up @assalabs/design-system-tools && pnpm build:theme && pnpm check:theme
```
