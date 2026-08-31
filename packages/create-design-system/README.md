# @assalabs/create-design-system

Interactive initializer for a portable design system: DTCG tokens, static web
CSS, plain React Native themes, and source-owned UI adapters.

```bash
pnpm dlx @assalabs/create-design-system init \
  --name Acme \
  --scope @acme \
  --prefix ac \
  --web stylex \
  --native unistyles
```

The command always creates `packages/theme`. It optionally creates
`packages/ui-web` with Base UI components using StyleX or CSS Modules and
`packages/ui-native` with React Native components using Unistyles.

The initializer preflights every selected target and refuses to overwrite an
existing directory. Install the workspace dependencies, build the theme, and
follow the adapter READMEs for app-specific compiler/native setup.
