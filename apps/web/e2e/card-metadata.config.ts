import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Explicit manual fixture run; default canonical suites/jobs remain unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /card-metadata\.scenario\.ts$/,
});
