import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeScript } from "@/components/ThemeScript";

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

function stubMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: () => {},
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

// Keep `screen` referenced for consistency with other tests in this suite.
void screen;
