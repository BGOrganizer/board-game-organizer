import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Explicit owned real fixtures; canonical suites and CI remain unchanged.
export default defineConfig({ ...base, testDir: ".", testMatch: /list-status\.scenario\.ts$/ });
