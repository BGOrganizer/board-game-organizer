import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Explicit read-only owned-fixture acceptance; canonical discovery/CI unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /collection-filters\.scenario\.ts$/,
  timeout: 300_000,
});
