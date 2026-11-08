import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupDetailsCard } from "../GroupDetailsCard";
import { GroupIdentityCard } from "../GroupIdentityCard";

it.each([
  ["admin", "Group admin"],
  ["moderator", "Group moderator"],
  ["accepted", "Group member"],
  ["invited", "Invitation received"],
  ["requested", "Membership requested"],
  ["none", "Private"],
] as const)(
  "shows the existing %s role in a background Card without granting capabilities",
  (role, label) => {
    const group = { ...groupRecord, role, canViewEvents: false, eventCount: null };
    const { container } = renderWithI18n(<GroupIdentityCard group={group} />);
    const heading = screen.getByRole("heading", { name: group.name });
    expect(heading.closest(".card")?.querySelector(".absolute.inset-0")).not.toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).not.toBeNull();
    expect(container.textContent).not.toContain("Events");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Accept invitation|Delete group/ })).toBeNull();
  },
);
it("retains uploaded logos without cropping and preserves venue/moderation content outside the identity", async () => {
  const group = {
    ...groupRecord,
    logo: "data:image/png;base64,uploaded",
    type: "PUBLIC" as const,
    canViewEvents: true,
    eventCount: 2,
    rejectionReason: "Venue needs review",
    location: {
      id: groupRecord.id,
      name: "Venue",
      address: "Via Roma 1",
      latitude: 41,
      longitude: 12,
    },
  };
  renderWithI18n(
    <>
      <GroupIdentityCard group={group} />
      <GroupDetailsCard group={group} identity={null} />
    </>,
  );
  expect(screen.getAllByRole("heading", { name: group.name })).toHaveLength(1);
  expect(document.querySelector('img[src="data:image/png;base64,uploaded"]')?.className).toContain(
    "object-contain",
  );
  expect(screen.queryByText("2 Events")).toBeNull();
  expect(screen.getByText("Venue")).not.toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Venue needs review");
  fireEvent.click(screen.getByRole("button", { name: "Public" }));
  expect(await screen.findByText("2 Events")).not.toBeNull();
  expect(
    await screen.findByText("Name, logo and group type. Group type cannot be changed."),
  ).not.toBeNull();
});
