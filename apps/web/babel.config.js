/**
 * Custom Babel config: Next.js falls back to webpack + Babel when this file
 * is present. Needed to apply the LinguiJS macro transform
 * (@lingui/babel-plugin-lingui-macro) to `t` / `Trans` / `useLingui` imports.
 */
module.exports = {
  presets: ["next/babel"],
  plugins: ["@lingui/babel-plugin-lingui-macro"],
};
