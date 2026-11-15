import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
// Manual owned fixtures only; canonical jobs remain unchanged.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /group-moderators\.scenario\.ts$/,
  timeout: 180_000,
});
