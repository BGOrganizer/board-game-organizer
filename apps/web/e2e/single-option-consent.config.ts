import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Mutates one explicitly owned disposable fixture; canonical CI stays unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /single-option-consent\.scenario\.ts$/,
  workers: 1,
  retries: 0,
});
