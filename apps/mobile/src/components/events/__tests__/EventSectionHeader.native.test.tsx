import { render, screen } from "@testing-library/react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventSectionHeader } from "../EventSectionHeader";

afterEach(() => vi.restoreAllMocks());

it("explains a mandatory repeat vote on the only changed date and distinguishes optional venue proposals", async () => {
  await installNativePopoverMeasurements();
  await render(
    <NativeTestProviders>
      <EventSectionHeader
        event={{ ...plannedEvent, allowParticipantLocations: true, dateVoteRequired: true }}
        section="details"
        voteDates
      />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Event details help" }));
  expect(
    screen.getByText(
      "Vote again on the changed option. A No keeps you registered and blocks agreement if you have a seat.",
    ),
  ).toBeVisible();
  expect(
    screen.queryByText('Choose at least one "Yes" or "If needed" option in this category.'),
  ).toBeNull();
  expect(
    screen.getByText(
      "Players seated at an event table can propose other locations for a manager to approve.",
    ),
  ).toBeVisible();
});
