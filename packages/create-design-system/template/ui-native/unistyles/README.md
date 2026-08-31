# {{DESIGN_SYSTEM_NAME}} native UI

React Native components styled with Unistyles and the semantic themes from
`{{PACKAGE_SCOPE}}/theme/native`.

Install the Unistyles native peer dependencies required by your React Native or
Expo version. Import `{{PACKAGE_SCOPE}}/ui-native/unistyles` before application
stylesheets are created, and configure the Unistyles Babel plugin according to
its installation guide.

These components are native implementations, not ports of Base UI's DOM
behavior. They share tokens and product semantics with the web components while
using React Native accessibility and interaction primitives.
