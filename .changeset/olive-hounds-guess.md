---
"@assalabs/create-design-system": patch
---

Declare `unplugin` explicitly in the web templates.

`@stylexjs/unplugin` lists `unplugin` as a peer dependency rather than a direct
one. Scaffolded projects were relying on the package manager to install it
automatically, which pnpm does by default and npm does not when
`legacy-peer-deps` is set. In that case the build fails at config load with
`Cannot find package 'unplugin'`.
