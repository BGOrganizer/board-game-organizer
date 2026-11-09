import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import MobileNumberPage from "../page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  update: vi.fn(),
  clerk: {
    isLoaded: false,
    user: null as null | {
      unsafeMetadata: Record<string, unknown>;
      update: ReturnType<typeof vi.fn>;
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => mocks.clerk }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
// jsdom cannot measure a virtual viewport. Keep the real Select and complete country data;
// actual windowing/scroll geometry belongs to browser acceptance, not this form unit test.
vi.mock("@heroui/react/rac", async (original) => ({
  ...(await original<typeof import("@heroui/react/rac")>()),
  Virtualizer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("MobileNumberPage", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.update.mockReset();
    mocks.update.mockResolvedValue(undefined);
    mocks.clerk.isLoaded = true;
    mocks.clerk.user = { unsafeMetadata: { existing: true }, update: mocks.update };
  });

  it("shows loading UI while Clerk loads or no user exists", () => {
    mocks.clerk.isLoaded = false;
    mocks.clerk.user = null;
    renderWithI18n(<MobileNumberPage />);
    expect(screen.getByRole("status")).toBeTruthy();

    cleanup();
    mocks.clerk.isLoaded = true;
    renderWithI18n(<MobileNumberPage />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("redirects an already complete user", async () => {
    mocks.clerk.user = { unsafeMetadata: { mobileNumber: "existing" }, update: mocks.update };
    renderWithI18n(<MobileNumberPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/tables"));
  });

  it("starts with the browser region, including an Italian-only locale", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "language");
    try {
      Object.defineProperty(navigator, "language", { configurable: true, value: "it" });
      renderWithI18n(<MobileNumberPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Country calling code/ }).textContent).toContain(
          "+39",
        ),
      );
      cleanup();
      Object.defineProperty(navigator, "language", { configurable: true, value: "fr" });
      renderWithI18n(<MobileNumberPage />);
      expect(screen.getByRole("button", { name: /Country calling code/ }).textContent).toContain(
        "+1",
      );
    } finally {
      if (original) Object.defineProperty(navigator, "language", original);
      else Reflect.deleteProperty(navigator, "language");
    }
  });

  it("requires a non-empty value and saves arbitrary text", async () => {
    renderWithI18n(<MobileNumberPage />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(screen.getByText("Enter a mobile number.")).toBeTruthy();
    expect(screen.getByLabelText("Mobile number").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.update).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: " not a formatted phone " },
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        unsafeMetadata: { existing: true, mobileNumber: "+1 not a formatted phone" },
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/tables");
  });

  it("ignores a repeated form submission while the first save is pending", async () => {
    let finish: () => void = () => {
      throw new Error("Save has not started");
    };
    mocks.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderWithI18n(<MobileNumberPage />);
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "x" } });
    const button = screen.getByRole("button", { name: "Continue" });
    const form = button.closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(form);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/tables"));
  });

  it("selects a country by name and stores its prefix with the national number", async () => {
    renderWithI18n(<MobileNumberPage />);
    fireEvent.click(screen.getByRole("button", { name: /Country calling code/ }));
    const search = screen.getByRole("searchbox", { name: "Search countries" });
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(await screen.findByText("No countries found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.change(search, { target: { value: "ital" } });
    const italy = await screen.findByRole("option", { name: /Italy/ });
    expect(italy.textContent).toContain("+39");
    fireEvent.click(italy);
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "333 1234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        unsafeMetadata: { existing: true, mobileNumber: "+39 333 1234567" },
      }),
    );
  });

  it("selects a non-Italian prefix from the full country list", () => {
    renderWithI18n(<MobileNumberPage />);
    const prefix = screen.getByRole("button", { name: /Country calling code/ });
    fireEvent.click(prefix);
    const germany = within(screen.getByRole("listbox"))
      .getByText("Germany")
      .closest('[role="option"]');
    if (!germany) throw new Error("Germany must be a selectable country option");
    expect(germany.textContent).toContain("+49");
    fireEvent.click(germany);
    expect(prefix.textContent).toContain("+49");
  });

  it("reports non-error Clerk update failures", async () => {
    mocks.update.mockRejectedValue("failed");
    renderWithI18n(<MobileNumberPage />);
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Could not save mobile number");
  });

  it("keeps form available when Clerk update fails", async () => {
    mocks.update.mockRejectedValue(new Error("failed"));
    renderWithI18n(<MobileNumberPage />);
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Could not save mobile number");
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
