import { configure, measureRenders } from "@callstack/reassure-measure";
import { cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { test } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

export function measureWebFeature(
  name: string,
  element: ReactElement | (() => Promise<ReactElement>),
  scenario: () => void | Promise<void>,
  beforeEach?: () => void,
) {
  test(name, async () => {
    configure({ testingLibrary: { render: renderWithI18n, cleanup }, runs: 10, warmupRuns: 1 });
    const result = await measureRenders(typeof element === "function" ? await element() : element, {
      beforeEach,
      scenario: async () => {
        await scenario();
      },
    });
    assertRenderMeasurement(result, name);
  });
}
