// Version labels change for every release; native inputs must still match exactly.
module.exports = {
  sourceSkips: ["ExpoConfigVersions", "PackageJsonAndroidAndIosScriptsIfNotContainRun"],
  fileHookTransform(source, chunk) {
    if (source.type === "contents" && source.id === "packageJson:scripts") {
      // Test commands do not change the native binary; preserve build and lifecycle scripts.
      return JSON.stringify(
        Object.fromEntries(
          Object.entries(JSON.parse(chunk.toString())).filter(
            ([name]) => name !== "test" && !name.startsWith("test:"),
          ),
        ),
      );
    }
    if (source.type === "contents" && source.id === "expoConfig") {
      const config = JSON.parse(chunk.toString());
      // Development's Preview endpoint travels with the OTA manifest, not native code.
      if (
        config.extra?.sentryEnvironment === "development" &&
        config.updates?.requestHeaders?.["expo-channel-name"] === "development"
      )
        delete config.extra.apiUrl;
      return JSON.stringify(config);
    }
    return chunk;
  },
};
