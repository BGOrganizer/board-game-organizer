import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Owned-fixture opt-in only. Canonical discovery/CI unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /event-access\.scenario\.ts$/,
  timeout: 300_000,
});
