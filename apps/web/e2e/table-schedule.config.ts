import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Explicit real-fixture run; canonical suites and CI remain unchanged.
export default defineConfig({ ...base, testDir: ".", testMatch: /table-schedule\.scenario\.ts$/ });
