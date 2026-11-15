import { runInNewContext } from "node:vm";
import { useAppStore } from "@board-game-organizer/store";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeScript } from "@/components/common/providers/ThemeScript";

vi.mock("next/script", () => ({
  default: ({ children }: PropsWithChildren) => (
    <span data-testid="theme-bootstrap">{children}</span>
  ),
}));

afterEach(() => {
  cleanup();
  useAppStore.setState({ themePreference: "system" });
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
});

function stubMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
    addListener: (_: () => void) => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return { mql, listeners };
}

describe("ThemeScript", () => {
  it("adds the dark class when the OS prefers dark", () => {
    stubMatchMedia(true);
    render(<ThemeScript />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not add the dark class in light mode", () => {
    stubMatchMedia(false);
    render(<ThemeScript />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

it("updates theme variables and native browser color-scheme selectors when the system changes, then removes its listener", () => {
  const { mql, listeners } = stubMatchMedia(false);
  const view = render(<ThemeScript />);
  expect(document.documentElement.dataset.theme).toBe("light");
  act(() => {
    mql.matches = true;
    for (const apply of listeners) apply();
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  view.unmount();
  expect(listeners).toEqual([]);
});

it("honors explicit overrides and resumes system tracking without replacing application state", () => {
  const { mql, listeners } = stubMatchMedia(false);
  useAppStore.setState({ themePreference: "dark" });
  render(<ThemeScript />);
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() => {
    for (const apply of listeners) apply();
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() => {
    useAppStore.getState().setThemePreference("light");
    mql.matches = true;
  });
  act(() => {
    for (const apply of listeners) apply();
  });
  expect(document.documentElement.dataset.theme).toBe("light");
  act(() => useAppStore.getState().setThemePreference("system"));
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("bootstraps before hydration without a light flash, and cannot break rendering if matchMedia is unavailable", () => {
  stubMatchMedia(false);
  render(<ThemeScript />);
  const source = screen.getByTestId("theme-bootstrap").textContent!;
  runInNewContext(source, { window: { matchMedia: () => ({ matches: true }) }, document });
  expect(document.documentElement.dataset.theme).toBe("dark");
  runInNewContext(source, { window: { matchMedia: () => ({ matches: false }) }, document });
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(() => runInNewContext(source, { window: {}, document })).not.toThrow();
});
