import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { CommunityApiError } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { OrganizationReview } from "../OrganizationReview";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  busy: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({}) }));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  useOrganizationReview: () => mocks.detail(),
  useOrganizationActions: () => ({ busy: mocks.busy, review: { mutate: mocks.mutate } }),
}));
const organization: OrganizationResponse = {
  id: "org",
  adminUserId: "owner",
  name: "Proposed club",
  logoAssetId: "logo",
  logo: "data:image/webp;base64,AQID",
  location: {
    id: "address",
    name: "Club house",
    address: "Via Roma 1, Italia",
    latitude: 41,
    longitude: 12,
  },
  status: "PENDING",
  reviewStatus: "PENDING",
  role: "none",
  memberCount: 1,
  publishedEventCount: 0,
  myMembership: null,
  version: 7,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
function detail(patch: Record<string, unknown> = {}) {
  mocks.detail.mockReturnValue({
    data: organization,
    isPending: false,
    isError: false,
    refetch: mocks.refetch,
    ...patch,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.busy = false;
  detail();
});
it("shows management help, rejection placeholder and icon-bearing actions on one row", async () => {
  renderWithI18n(<OrganizationReview organizationId="org" />);
  expect(screen.getByText("Manage organization")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Manage organization: Manage organization" }));
  expect(
    screen.getByText(
      "Approve the proposed organization information, or reject it with a reason so the creator can correct it. Previously approved information remains available.",
    ),
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const input = screen.getByRole("textbox", { name: "Rejection reason" });
  expect(input.getAttribute("placeholder")).toBe("Reject reason");
  expect(input.getAttribute("maxlength")).toBe("1000");
  const approve = screen.getByRole("button", { name: "Approve organization" });
  const row = approve.parentElement;
  expect(row?.className).toBe("flex flex-row gap-2");
  if (!row) throw new Error("Review actions row missing");
  expect(
    within(row)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Approve organization", "Reject organization"]);
  expect(
    within(row)
      .getAllByRole("button")
      .every((button) => button.querySelector("svg")),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Reject organization" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.change(input, { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Reject organization" }).hasAttribute("disabled")).toBe(
    true,
  );
});
it.each(["approve", "reject"] as const)(
  "submits %s with the current version and redirects only on success",
  (decision) => {
    renderWithI18n(<OrganizationReview organizationId="org" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
      target: { value: "  Correct the logo  " },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: decision === "approve" ? "Approve organization" : "Reject organization",
      }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        id: "org",
        input: {
          decision,
          version: 7,
          ...(decision === "reject" ? { reason: "Correct the logo" } : {}),
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.mutate.mock.calls[0][1].onSuccess();
    expect(mocks.replace).toHaveBeenCalledWith("/moderation");
  },
);
it("disables both actions while a review is pending", () => {
  mocks.busy = true;
  renderWithI18n(<OrganizationReview organizationId="org" />);
  fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
    target: { value: "Correct the address" },
  });
  for (const name of ["Approve organization", "Reject organization"]) {
    const button = screen.getByRole("button", { name });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
  }
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it("keeps the approved revision visible and removes actions after review", () => {
  detail({
    data: {
      ...organization,
      reviewStatus: "REJECTED",
      approved: { name: "Approved club", location: organization.location, logoAssetId: "old-logo" },
    },
  });
  renderWithI18n(<OrganizationReview organizationId="org" />);
  expect(screen.getByText("Approved club")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("This proposal has already been reviewed.");
  expect(screen.queryByRole("button", { name: "Approve organization" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(mocks.push).toHaveBeenCalledWith("/moderation");
});
it.each([
  [new CommunityApiError(403, "MODERATOR_REQUIRED"), "Moderator access required"],
  [new CommunityApiError(503, "UNAVAILABLE"), "Could not load organization review"],
  [new Error("Offline"), "Could not load organization review"],
])("retains an observable error and retry for %s", (error, message) => {
  detail({ data: undefined, isError: true, error });
  renderWithI18n(<OrganizationReview organizationId="org" />);
  expect(screen.getByRole("alert").textContent).toContain(message);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(mocks.refetch).toHaveBeenCalled();
  expect(screen.queryByText("Manage organization")).toBeNull();
});
it("does not invent organization information while loading", () => {
  detail({ data: undefined, isPending: true });
  renderWithI18n(<OrganizationReview organizationId="org" />);
  expect(screen.queryByText("Proposed club")).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve organization" })).toBeNull();
});
