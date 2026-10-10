import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { MobileNumberGate } from "../MobileNumberGate";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  clerk: { isLoaded: false, user: null as null | { unsafeMetadata: Record<string, unknown> } },
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => mocks.clerk }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

describe("MobileNumberGate", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.clerk.isLoaded = false;
    mocks.clerk.user = null;
  });

  it("shows loading UI until Clerk loads", () => {
    renderWithI18n(<MobileNumberGate>content</MobileNumberGate>);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("redirects users missing mobile metadata", async () => {
    mocks.clerk.isLoaded = true;
    mocks.clerk.user = { unsafeMetadata: {} };
    renderWithI18n(<MobileNumberGate>content</MobileNumberGate>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/mobile-number"));
    expect(screen.queryByText("content")).not.toBeTruthy();
  });

  it("renders protected content for complete users", () => {
    mocks.clerk.isLoaded = true;
    mocks.clerk.user = { unsafeMetadata: { mobileNumber: "arbitrary" } };
    renderWithI18n(<MobileNumberGate>content</MobileNumberGate>);
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("leaves signed-out routing to Clerk middleware", () => {
    mocks.clerk.isLoaded = true;
    mocks.clerk.user = null;
    renderWithI18n(<MobileNumberGate>signed out</MobileNumberGate>);
    expect(screen.getByText("signed out")).toBeTruthy();
  });
});
