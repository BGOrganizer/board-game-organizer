import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { browserName: "chromium", headless: true, viewport: { width: 390, height: 844 } },
});
