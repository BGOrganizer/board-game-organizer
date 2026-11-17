// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { type ContactTab, contactTab } from "../contacts/contacts";
import { useContactTab } from "../contacts/useContactTab";

const fixture = vi.hoisted(() => {
  const state = { parameter: undefined as string | string[] | undefined };
  return {
    state,
    router: {
      setParams: vi.fn((params: { tab: undefined }) => {
        state.parameter = params.tab;
      }),
    },
  };
});
vi.mock("expo-router", () => ({
  useRouter: () => fixture.router,
  useLocalSearchParams: () => ({ tab: fixture.state.parameter }),
}));

// Real React state/effect behavior with a route adapter; native timings are measured separately.
it("consumes repeated deep links while keeping ordinary selection and Back local", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { router } = fixture;
  let state: ReturnType<typeof useContactTab>;
  function Probe() {
    state = useContactTab();
    return <span>{state.tab}</span>;
  }
  const container = Reflect.get(globalThis, "document").createElement("div");
  const root = createRoot(container);
  const render = () => React.act(async () => root.render(<Probe />));
  const select = (tab: ContactTab) => React.act(async () => state.setTab(tab));
  try {
    await render();
    expect(container.textContent).toBe("connections");
    for (const tab of ["requests", "device", "search", "connections"] as const) {
      await select(tab);
      expect(container.textContent).toBe(tab);
      await render(); // Returning from another route does not reset the selected section.
      expect(container.textContent).toBe(tab);
    }
    expect(router.setParams).not.toHaveBeenCalled();
    for (const requested of ["requests", "requests", ["suggestions"], "blocked", "unknown"]) {
      fixture.state.parameter = requested;
      await render();
      expect(container.textContent).toBe(contactTab(requested));
      expect(fixture.state.parameter).toBeUndefined();
      await render(); // Router receipt of the cleared parameter retains the destination.
      expect(container.textContent).toBe(contactTab(requested));
      await select("search");
    }
    expect(router.setParams).toHaveBeenCalledTimes(5);
    expect(router.setParams).toHaveBeenLastCalledWith({ tab: undefined });
    await React.act(async () => root.unmount());
    fixture.state.parameter = "device";
    const cold = createRoot(container);
    await React.act(async () => cold.render(<Probe />));
    expect(container.textContent).toBe("device");
    expect(fixture.state.parameter).toBeUndefined();
    await React.act(async () => cold.unmount());
  } finally {
    await React.act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
