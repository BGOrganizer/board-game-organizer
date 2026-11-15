import { defineConfig, devices } from "@playwright/test";
import base from "../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /sentry\.scenario\.ts$/,
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
