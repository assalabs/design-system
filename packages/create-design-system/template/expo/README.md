# {{DESIGN_SYSTEM_NAME}}

An Expo app and its design system in one workspace. Every colour, space, radius
and font on screen comes from `packages/theme`.

```text
packages/theme     DTCG tokens -> CSS variables, native themes, Unistyles module
apps/mobile        Expo app consuming {{scope}}/theme/unistyles
```

## Getting started

```bash
pnpm install
pnpm build:theme
pnpm --filter {{scope}}/mobile ios      # or: android
```

Unistyles 3 relies on a compiled Nitro native module, so the app needs a
development build (`expo run:ios` / `expo run:android`) rather than Expo Go.

## The token loop

1. Edit the DTCG JSON under `packages/theme/tokens/`.
2. `pnpm build:theme` regenerates the CSS variables, the native themes, and
   `unistyles.ts`.
3. `pnpm check:theme` re-asserts required tokens, light/dark parity, every
   declared contrast pair, and that no generated file drifted.

`pnpm typecheck` runs across the workspace, and `.github/workflows/theme-check.yml`
runs the same checks in CI.

## Checking dark mode

`check:theme` proves both themes exist, stay in parity, and meet their contrast
minimums. It cannot prove the app _looks_ right, and neither can CI — the mobile
job typechecks JavaScript only. Verify the appearance by hand after any token
change:

1. Run the app.
2. Switch the system appearance and confirm the screen follows it live.
   - iOS Simulator: **Features → Toggle Appearance** (`⇧⌘A`), or
     `xcrun simctl ui booted appearance dark`.
   - Android emulator: **Settings → Display → Dark theme**, or
     `adb shell "cmd uimode night yes"`.
3. Check that text, borders and the brand badge all stay legible in both — those
   are the pairs `check:theme` guarantees, so a surprise here means a token was
   edited without rerunning the build.

`app.json` sets `userInterfaceStyle: "automatic"` and the generated Unistyles
module configures `adaptiveThemes: true`, which together are what make the
switch live.

## Pinned versions

Expo SDK 56 (`expo@56.0.21`, React Native `0.85.3`), deliberately one SDK behind
the latest. `react-native-unistyles@3.3.0` is built against RN 0.85.3 and pairs
with `react-native-nitro-modules@0.36.1`; Nitro is compiled against React
Native's C++ ABI, so a newer RN fails at native build time — after a JS-only
typecheck has already gone green. Move both together.

## Upgrading the tooling

```bash
pnpm up @assalabs/design-system-tools && pnpm build:theme && pnpm check:theme
```
