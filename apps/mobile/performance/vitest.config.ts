import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { presets, reactNative } from "vitest-native";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [
    reactNative({
      engine: "native",
      platform: "android",
      // Lucide publishes valid ESM; keep its real icons without recompiling the large barrel.
      transform: { exclude: ["lucide-react-native"] },
      presets: [
        "./performance/reanimated-preset.ts",
        presets.worklets(),
        "./performance/gesture-handler-preset.ts",
      ],
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("../src", import.meta.url)) },
      // App imports and native-owned HeroUI must share the actual provider context.
      {
        find: /^react-native-safe-area-context$/,
        replacement: createRequire(import.meta.url).resolve("react-native-safe-area-context"),
      },
      {
        find: /^@gorhom\/bottom-sheet$/,
        replacement: createRequire(import.meta.url).resolve("@gorhom/bottom-sheet"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["performance/**/*.perf.tsx"],
    setupFiles: ["../../scripts/performance/verify-worker.mjs", "./performance/setup.ts"],
    globalSetup: ["./performance/global-setup.ts"],
    pool: "forks",
    execArgv: [
      "--expose-gc",
      "--no-concurrent-sweeping",
      "--max-old-space-size=1024",
      "--max-opt=1",
    ],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60000,
    coverage: { enabled: false },
  },
});
