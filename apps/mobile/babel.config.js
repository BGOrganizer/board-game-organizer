/**
 * Babel config for Expo/Metro: applies the LinguiJS macro transform
 * (@lingui/babel-plugin-lingui-macro) on top of the Expo preset.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["@lingui/babel-plugin-lingui-macro"],
  };
};
