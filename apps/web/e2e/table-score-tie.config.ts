import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Separate owned three-player fixture; local draft only, no score save/finalization.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /table-score-tie\.scenario\.ts$/,
  timeout: 180_000,
});
