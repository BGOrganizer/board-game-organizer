import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/matches"));
  });

  it("requires a non-empty value and saves arbitrary text", async () => {
    renderWithI18n(<MobileNumberPage />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(mocks.update).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: " not a formatted phone " },
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        unsafeMetadata: { existing: true, mobileNumber: "not a formatted phone" },
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/matches");
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
