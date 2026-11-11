import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
it("keeps Android background-only until the full-size animated mascot is ready", () => {
  const config = require("../../../app.config.js").expo;
  const splash = config.plugins.find(
    (row: unknown) => Array.isArray(row) && row[0] === "expo-splash-screen",
  )[1];
  expect(splash.resizeMode).toBe("contain");
  expect(splash.android.image).toBe("./assets/splash-android.png");
  expect(splash.android.imageWidth).toBe(splash.imageWidth);
  expect(splash.imageWidth).toBe(280);
});
