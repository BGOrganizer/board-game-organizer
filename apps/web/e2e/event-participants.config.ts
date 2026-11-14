import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Explicit owned fixtures only; canonical discovery and jobs are unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /event-participants\.scenario\.ts$/,
  timeout: 180_000,
});
