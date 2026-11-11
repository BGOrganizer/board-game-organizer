import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
it("fits the complete square splash image inside the Android system mask", () => {
  const config = require("../../../app.config.js").expo;
  const splash = config.plugins.find(
    (row: unknown) => Array.isArray(row) && row[0] === "expo-splash-screen",
  )[1];
  expect(splash.resizeMode).toBe("contain");
  expect(splash.android.imageWidth * Math.SQRT2).toBeLessThan(192);
  expect(splash.imageWidth).toBe(280);
});
