import { render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { GroupSectionHeader } from "../GroupSectionHeader";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it.each([
  {
    role: "moderator",
    canInvite: true,
    guidance: "Group managers can invite people and review membership requests.",
  },
  { role: "accepted", canInvite: false, guidance: null },
] as const)("explains which public membership actions the $role role can take", async (viewer) => {
  await render(
    <GroupSectionHeader
      group={{ ...groupRecord, type: "PUBLIC", role: viewer.role, canInvite: viewer.canInvite }}
      section="members"
    />,
    { wrapper: NativeTestProviders },
  );
  const help = screen.getByRole("button", { name: "Group members help" });
  await pressMeasuredPopover(help);
  expect(
    screen.getByText("See who belongs to the group and what role each person has."),
  ).toBeVisible();
  const permissions = "Group managers can invite people and review membership requests.";
  if (viewer.guidance) expect(screen.getByText(viewer.guidance)).toBeVisible();
  else expect(screen.queryByText(permissions)).toBeNull();
  expect(screen.queryByText("Group managers can invite people.")).toBeNull();
});
