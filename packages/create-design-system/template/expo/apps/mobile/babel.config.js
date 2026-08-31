/** @type {import("react-native-unistyles/plugin").UnistylesPluginOptions} */
const unistylesPluginOptions = {
  // App sources live at the app root, not under `src/`.
  root: ".",
  // The generated theme calls `StyleSheet.configure`, so it needs the plugin too.
  autoProcessImports: ["{{scope}}/theme"],
};

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [["react-native-unistyles/plugin", unistylesPluginOptions]],
  };
};
