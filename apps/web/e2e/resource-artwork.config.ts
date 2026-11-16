import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Explicit owned, read-only Development fixtures; canonical CI discovery stays unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /resource-artwork\.scenario\.ts$/,
  timeout: 180_000,
});
