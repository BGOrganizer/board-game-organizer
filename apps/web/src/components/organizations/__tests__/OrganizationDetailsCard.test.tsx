import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { OrganizationDetailsCard } from "../OrganizationDetailsCard";

const location = {
  id: "venue",
  name: "Club venue",
  address: "Via Roma 1, Italia",
  latitude: 41,
  longitude: 12,
};
const organization: OrganizationResponse = {
  id: "org",
  adminUserId: "admin",
  name: "Game club",
  location,
  logoAssetId: "logo",
  logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlGAAAAAASUVORK5CYII=",
  approved: { name: "Game club", location, logoAssetId: "logo" },
  status: "CREATED",
  role: "accepted",
  memberCount: 4,
  publishedEventCount: 12,
  myMembership: null,
  version: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
it.each([
  [undefined, "Approved", undefined],
  ["PENDING", "Awaiting review", undefined],
  ["REJECTED", "Changes rejected", "Please update the logo"],
] as const)(
  "renders status %s, address and server counts in the common card",
  (reviewStatus, label, rejectionReason) => {
    const { container } = renderWithI18n(
      <OrganizationDetailsCard organization={{ ...organization, reviewStatus, rejectionReason }} />,
    );
    expect(screen.getByRole("heading", { name: "Game club" })).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Club venue")).toBeTruthy();
    expect(screen.getByText("Approved members: 4")).toBeTruthy();
    expect(screen.getByText("Published events: 12")).toBeTruthy();
    expect(container.querySelector(".lucide-map-pin")).toBeTruthy();
    expect(container.querySelector(".lucide-users-round")).toBeTruthy();
    expect(container.querySelector(".lucide-calendar-days")).toBeTruthy();
    if (rejectionReason) expect(screen.getByText(rejectionReason)).toBeTruthy();
    expect(
      Boolean(
        screen.queryByText("Approved information remains visible while changes are reviewed."),
      ),
    ).toBe(Boolean(reviewStatus));
  },
);
it("formats larger authoritative counts for the active locale", () => {
  renderWithI18n(
    <OrganizationDetailsCard
      organization={{ ...organization, memberCount: 1200, publishedEventCount: 12345 }}
    />,
  );
  expect(screen.getByText("Approved members: 1,200")).toBeTruthy();
  expect(screen.getByText("Published events: 12,345")).toBeTruthy();
});
it("composes bottom-right actions without claiming an unapproved proposal is operational", () => {
  const { container } = renderWithI18n(
    <OrganizationDetailsCard
      organization={{ ...organization, approved: undefined, reviewStatus: "PENDING" }}
    >
      <button type="button">Cancel request</button>
    </OrganizationDetailsCard>,
  );
  expect(screen.getByRole("button", { name: "Cancel request" }).parentElement?.className).toContain(
    "justify-end",
  );
  expect(container.firstElementChild?.className).toContain("rounded-xl");
  expect(
    screen.queryByText("Approved information remains visible while changes are reviewed."),
  ).toBeNull();
});
