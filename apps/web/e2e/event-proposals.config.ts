import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Explicit owned disposable fixtures only. Canonical discovery/CI remain unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /event-proposals\.scenario\.ts$/,
  timeout: 180_000,
});
