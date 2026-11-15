import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Explicit real-fixture run; no provider provisioning, response mocks or canonical job changes.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /profile\.scenario\.ts$/,
  timeout: 300_000,
});
