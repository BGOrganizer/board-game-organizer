import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Explicit owned mutable fixtures; never added to canonical suites/jobs automatically.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /table-results\.scenario\.ts$/,
  timeout: 300_000,
});
