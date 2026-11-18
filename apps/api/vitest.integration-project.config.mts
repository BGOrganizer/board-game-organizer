import { defineProject } from "vitest/config";
import integration from "./vitest.integration.config";

const { coverage: _coverage, ...test } = integration.test;

export default defineProject({
  ...integration,
  test: { ...test, name: "integration" },
});
