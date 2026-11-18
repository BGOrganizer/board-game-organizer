import { formatLocationAddress } from "@board-game-organizer/shared";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { GroupDetailsCard } from "../GroupDetailsCard";
import { GroupInvitationCard } from "../GroupInvitationCard";
import { GroupJoinRequest } from "../GroupJoinRequest";
import { GroupStatusBadge } from "../GroupStatusBadge";

it("keeps complete group identity, venue, review feedback and child actions together", async () => {
  const group = {
    ...groupRecord,
    type: "PUBLIC" as const,
    eventCount: 3,
    rejectionReason: "Please verify the venue.",
    reviewStatus: "REJECTED" as const,
    location: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Games Library",
      address: "Library Street 42, Rome, Italy",
      latitude: 41.9,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    },
  };
  const view = await render(
    <GroupDetailsCard group={group}>
      <Text>Manage group</Text>
    </GroupDetailsCard>,
    { wrapper: NativeTestProviders },
  );
  for (const value of [
    group.name,
    "Public",
    "Games Library",
    "Please verify the venue.",
    "Manage group",
    "Changes rejected",
    "3 Events",
  ])
    expect(screen.getByText(value)).toBeOnTheScreen();
  expect(screen.getByLabelText(group.location.address)).toHaveTextContent(
    formatLocationAddress(group.location.address),
  );
  expect(
    screen.getByText("Approved information remains visible while changes are reviewed."),
  ).toBeOnTheScreen();
  await view.rerender(
    <GroupDetailsCard
      group={{ ...groupRecord, canViewEvents: false, eventCount: null }}
      identity={<Text>Custom identity</Text>}
    />,
  );
  expect(screen.getByText("Custom identity")).toBeOnTheScreen();
  expect(screen.queryByText("Manage group")).not.toBeOnTheScreen();
  expect(screen.queryByText("Group venue")).not.toBeOnTheScreen();
  expect(screen.queryByText("3 Events")).not.toBeOnTheScreen();
  await view.rerender(<GroupDetailsCard group={groupRecord} identity={null} />);
  expect(screen.queryByText("Custom identity")).not.toBeOnTheScreen();
  expect(screen.queryByText(groupRecord.name)).not.toBeOnTheScreen();
});

it("shows the private identity without adding a public review badge", async () => {
  await render(<GroupDetailsCard group={groupRecord} />, { wrapper: NativeTestProviders });
  expect(screen.getByText(groupRecord.name)).toBeOnTheScreen();
  expect(screen.getByText("Private")).toBeOnTheScreen();
  expect(screen.getByText("1 Confirmed members")).toBeOnTheScreen();
  expect(screen.queryByText("Approved")).not.toBeOnTheScreen();
});

it.each([
  [undefined, undefined, "Awaiting review"],
  [groupRecord.approved, "PENDING", "Awaiting review"],
  [groupRecord.approved, "REJECTED", "Changes rejected"],
  [groupRecord.approved, undefined, "Approved"],
] as const)(
  "reports the actual public approval state %s/%s as %s",
  async (approved, reviewStatus, label) => {
    const view = await render(
      <GroupStatusBadge group={{ type: "PUBLIC", approved, reviewStatus }} />,
      { wrapper: NativeTestProviders },
    );
    expect(screen.getByText(label)).toBeOnTheScreen();
    await view.rerender(<GroupStatusBadge group={{ type: "PRIVATE", approved, reviewStatus }} />);
    expect(screen.queryByText(label)).not.toBeOnTheScreen();
  },
);

it("requests membership explicitly, then presents a separately cancellable pending request", async () => {
  const request = vi.fn(),
    cancel = vi.fn();
  const view = await render(
    <GroupJoinRequest pending={false} busy={false} onRequest={request} onCancel={cancel} />,
    { wrapper: NativeTestProviders },
  );
  expect(request).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Request membership" }));
  expect(request).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
  await view.rerender(<GroupJoinRequest pending busy onRequest={request} onCancel={cancel} />);
  expect(screen.getByText(/Membership pending\./)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cancel request" })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Cancel request" }));
  expect(cancel).not.toHaveBeenCalled();
  await view.rerender(
    <GroupJoinRequest pending busy={false} onRequest={request} onCancel={cancel} />,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Cancel request" }));
  expect(cancel).toHaveBeenCalledOnce();
});

it("dispatches independent explicit invitation decisions and disables both while a response is pending", async () => {
  const accept = vi.fn(),
    decline = vi.fn();
  const view = await render(
    <GroupInvitationCard groupId={groupRecord.id} busy onAccept={accept} onDecline={decline} />,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByText("Invitation received")).toBeOnTheScreen();
  for (const name of ["Accept", "Decline"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name }));
  }
  expect(accept).not.toHaveBeenCalled();
  expect(decline).not.toHaveBeenCalled();
  await view.rerender(
    <GroupInvitationCard
      groupId={groupRecord.id}
      busy={false}
      onAccept={accept}
      onDecline={decline}
    />,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Accept" }));
  expect(accept).toHaveBeenCalledOnce();
  await userEvent.setup().press(screen.getByRole("button", { name: "Decline" }));
  expect(decline).toHaveBeenCalledOnce();
});
