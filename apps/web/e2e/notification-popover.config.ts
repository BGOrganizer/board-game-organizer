import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /notification-popover\.scenario\.ts$/,
  timeout: 180_000,
});
