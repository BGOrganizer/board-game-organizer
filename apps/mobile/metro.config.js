const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const defaultConfig = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(defaultConfig, {
  cssEntryFile: "./global.css",
});
