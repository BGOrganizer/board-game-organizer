import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /seat-order\.scenario\.ts$/,
  timeout: 180_000,
});
