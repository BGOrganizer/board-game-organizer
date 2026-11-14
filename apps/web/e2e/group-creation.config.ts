import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Owned Development fixtures only; canonical discovery/CI unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /group-creation\.scenario\.ts$/,
  timeout: 180_000,
});
