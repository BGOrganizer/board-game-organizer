import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Explicit real Development/Preview fixtures; no changes to canonical suites/jobs.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /community\.scenario\.ts$/,
  workers: 1,
  fullyParallel: false,
});
