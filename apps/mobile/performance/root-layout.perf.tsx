import { useAppStore } from "@board-game-organizer/store";
import { measureRenders } from "@callstack/reassure-measure";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Uniwind } from "uniwind";
import { afterAll, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("__DEV__", false);
  vi.stubEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture_only");
});

import { RootFixture, rootSdk } from "@/app/__tests__/rootLayoutFixture";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("RootLayout: signed-out providers and startup react to a theme change", async () => {
  const result = await measureRenders(<RootFixture />, {
    beforeEach: () => {
      rootSdk.badge.mockClear();
      rootSdk.statusBar.mockClear();
      rootSdk.goBack.mockClear();
      useAppStore.getState().setThemePreference("light");
    },
    scenario: async () => {
      await waitFor(() => expect(rootSdk.badge).toHaveBeenCalledWith(0));
      expect(screen.getByRole("header", { name: "Group details" })).toBeVisible();
      await act(() => useAppStore.getState().setThemePreference("dark"));
      await waitFor(() => expect(Uniwind.currentTheme).toBe("dark"));
      expect(rootSdk.statusBar).toHaveBeenLastCalledWith("light");
      await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
      expect(rootSdk.goBack).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
    },
  });
  assertRenderMeasurement(result);
});
