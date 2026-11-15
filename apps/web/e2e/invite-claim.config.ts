import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /invite-claim\.scenario\.ts$/,
  timeout: 180_000,
});
