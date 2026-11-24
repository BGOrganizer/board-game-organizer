// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

const { bridge, roots } = vi.hoisted(() => ({
  bridge: {
    connect: vi.fn(async () => {}),
    getHostContext: vi.fn(() => ({ locale: "en" })),
    close: vi.fn(async () => {}),
    ontoolresult: (_message: unknown) => {},
  },
  roots: [] as Root[],
}));

vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: vi.fn(function App() {
    return bridge;
  }),
}));
vi.mock("react-dom/client", async (load) => {
  const real = await load<typeof import("react-dom/client")>();
  return {
    ...real,
    // Keep the actual renderer and retain its root for effect cleanup in the fixture.
    createRoot: vi.fn((...args: Parameters<typeof real.createRoot>) => {
      const root = real.createRoot(...args);
      roots.push(root);
      return root;
    }),
  };
});

const originalConfig = { ...z.config() };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.getElementById("root")?.remove();
  z.config({ ...originalConfig, jitless: originalConfig.jitless });
});

it("enables CSP-safe validation and leaves a document without a root untouched", async () => {
  await import("./main");
  expect(z.config().jitless).toBe(true);
  expect(createRoot).not.toHaveBeenCalled();
  expect(bridge.connect).not.toHaveBeenCalled();
  expect(document.body).toBeEmptyDOMElement();
}, 20_000);

it("mounts the actual widget in the host document and displays a tool result", async () => {
  const element = document.createElement("div");
  element.id = "root";
  document.body.append(element);
  await act(async () => {
    await import("./main");
  });
  await waitFor(() => expect(bridge.connect).toHaveBeenCalledOnce());
  expect(createRoot).toHaveBeenCalledWith(element);
  expect(screen.getByLabelText("Loading…")).toBeVisible();
  act(() =>
    bridge.ontoolresult({
      structuredContent: { operation: "list_table_history", data: { items: [], nextCursor: null } },
    }),
  );
  expect(screen.getByText("No tables found")).toBeVisible();
}, 20_000);
