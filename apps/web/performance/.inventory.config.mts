import config from "./vitest.config.mts";

export default {
  ...config,
  test: {
    ...config.test,
    setupFiles: [
      ...((config.test?.setupFiles as string[] | undefined) ?? []),
      "./performance/.inventory.setup.ts",
    ],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/components/**/*.{tsx,jsx}", "src/app/**/*.{tsx,jsx}"],
      exclude: ["**/__tests__/**", "**/*.{test,spec}.{tsx,jsx}"],
      reporter: ["json", "json-summary"],
      reportOnFailure: true,
      reportsDirectory: ".reassure/inventory",
    },
  },
};
