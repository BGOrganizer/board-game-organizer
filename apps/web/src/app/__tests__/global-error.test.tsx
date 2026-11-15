import { act, fireEvent, getByRole } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import GlobalError from "../global-error";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => mocks);
let root: Root;
afterEach(async () => {
  await act(() => root.unmount());
  if (!document.documentElement) document.appendChild(document.createElement("html"));
  document.documentElement.innerHTML = "<head></head><body></body>";
  vi.restoreAllMocks();
});

it.each([
  ["en-GB", "en", "Something went wrong", "Try again"],
  ["it-IT", "it", "Si è verificato un errore", "Riprova"],
])(
  "captures render failures and offers an accessible retry without providers in %s",
  async (language, locale, title, button) => {
    vi.spyOn(navigator, "language", "get").mockReturnValue(language);
    const error = new Error("private exception details");
    const reset = vi.fn();
    root = createRoot(document);
    await act(() => root.render(<GlobalError error={error} reset={reset} />));
    expect(document.documentElement.lang).toBe(locale);
    expect(getByRole(document.body, "heading").textContent).toBe(title);
    expect(document.body.textContent).not.toContain(error.message);
    expect(mocks.captureException).toHaveBeenCalledWith(error);
    await act(() => fireEvent.click(getByRole(document.body, "button", { name: button })));
    expect(reset).toHaveBeenCalledTimes(1);
  },
);
