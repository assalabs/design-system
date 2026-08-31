# {{DESIGN_SYSTEM_NAME}} web UI

Base UI components styled with StyleX and the semantic tokens from
`{{PACKAGE_SCOPE}}/theme`.

Import `{{PACKAGE_SCOPE}}/theme/css` once in the web application, configure the
StyleX compiler for the app's bundler, and import components from this package.
Because the generated theme uses `defineVars`, enable StyleX's
`unstable_moduleResolution` option with `type: "commonJS"` and a `rootDir` that
points to the workspace root. Enable `treeshakeCompensation` as well so bundlers
retain the compiled variable definitions.

The component source remains inside the workspace so product teams can change
its API and visual treatment without waiting for a library release.
