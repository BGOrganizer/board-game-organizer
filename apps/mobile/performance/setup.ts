import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { configure } from "@callstack/reassure-measure";
import { cleanup, render } from "@testing-library/react-native";
import { afterAll, vi } from "vitest";
import { installHorizontalScrollInterop } from "./horizontal-scroll-interop";
import { installNativeUniwindInterop } from "./uniwind-native-interop";

const require = createRequire(import.meta.url);
const styles = fileURLToPath(new URL("../.reassure/native-styles.cjs", import.meta.url));
delete require.cache[styles];
require(styles);

// The generated stylesheet supplies real tokens/classes; Metro's actual native
// resolver also needs to wrap external RN imports before SDK/SUT evaluation.
const restoreHorizontalScroll = installHorizontalScrollInterop();
const uniwindInterop = installNativeUniwindInterop();
afterAll(async () => {
  // Preserve the resolver throughout native unmount/effect cleanup. Vitest runs
  // afterAll hooks in reverse registration order, including nested diagnostics.
  await cleanup();
  uniwindInterop.dispose();
  restoreHorizontalScroll();
});

configure({
  testingLibrary: { render, cleanup },
  runs: 10,
  warmupRuns: 1,
  outputFile: fileURLToPath(new URL("../.reassure/current.perf", import.meta.url)),
});

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en-US" }],
}));
