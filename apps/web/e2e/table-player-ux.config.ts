import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Owned real fixtures only; canonical suites and CI remain unchanged.
export default defineConfig({ ...base, testDir: ".", testMatch: /table-player-ux\.scenario\.ts$/ });
