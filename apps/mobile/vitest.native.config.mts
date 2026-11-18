import { defineProject } from "vitest/config";
import performance from "./performance/vitest.config";

const { coverage: _coverage, ...test } = performance.test;

export default defineProject({
  ...performance,
  test: {
    ...test,
    name: "native",
    // Rendering benchmarks have separate V8/GC requirements; behavior tests do not.
    execArgv: ["--max-old-space-size=1024"],
    setupFiles: ["./performance/setup.ts"],
    include: ["src/**/*.native.test.tsx"],
    globalSetup: ["./performance/native-style-global-setup.mjs"],
  },
});
