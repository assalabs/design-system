# {{DESIGN_SYSTEM_NAME}} theme

Cross-platform design tokens published as `{{PACKAGE_NAME}}`.

Edit the DTCG JSON files under `tokens/`, then run:

```bash
pnpm tokens:build
pnpm tokens:check
```

Web applications import `{{PACKAGE_NAME}}/css`. React Native applications
import plain theme objects from `{{PACKAGE_NAME}}/native` and register them in
an app-local styling adapter.
