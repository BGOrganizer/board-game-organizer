import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Opt-in owned Development fixtures; canonical CI discovery stays unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /detail-scroll\.scenario\.ts$/,
  timeout: 180_000,
});
