import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { generateName, type ListRole } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { act, fireEvent, screen, userEvent } from "@testing-library/react-native";
import { type ComponentProps, createRef, type Ref, useImperativeHandle, useState } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { ListSearchFilters } from "@/components/common/ui/ListSearchFilters";
import { NameInput } from "@/components/common/ui/NameInput";
import {
  type ScheduleOptionRow,
  ScheduleOptionsPopover,
} from "@/components/common/ui/ScheduleOptionsPopover";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GroupDetailsCard } from "@/components/groups/GroupDetailsCard";
import { GroupJoinRequest } from "@/components/groups/GroupJoinRequest";
import { GroupStatusBadge } from "@/components/groups/GroupStatusBadge";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

function ControlledSearch({ changed }: { changed: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <SearchInput
      value={value}
      onChange={(next) => {
        changed(next);
        setValue(next);
      }}
      label="Find a player"
      placeholder="Name or username"
      clearLabel="Reset player search"
      maxLength={30}
    >
      <Text>Private search</Text>
    </SearchInput>
  );
}

function ControlledName() {
  const [value, setValue] = useState("");
  return (
    <NameInput
      category="gruppo"
      accessibilityLabel="Resource name"
      value={value}
      maxLength={8}
      onChangeText={setValue}
    />
  );
}

function ControlledRoleSearch() {
  const [query, setQuery] = useState("Al");
  const [roles, setRoles] = useState<ListRole[]>(["admin"]);
  return (
    <ListSearchFilters
      query={query}
      onQueryChange={setQuery}
      roles={roles}
      onToggle={(role) =>
        setRoles((current) =>
          current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
        )
      }
      label="Search members"
      placeholder="Name"
    />
  );
}

function ControlledFilter() {
  const [query, setQuery] = useState("A");
  return (
    <ListSearch
      query={query}
      onQueryChange={setQuery}
      label="Filter members"
      placeholder="Name"
      mode="filter"
      options={[]}
      selected={[]}
      onToggle={() => undefined}
    />
  );
}

type Review = ComponentProps<typeof GroupStatusBadge>["group"];
function ControlledReview({ ref }: { ref: Ref<(next: Review) => void> }) {
  const [group, setGroup] = useState<Review>({ type: "PUBLIC", reviewStatus: "PENDING" });
  useImperativeHandle(ref, () => setGroup, []);
  return <GroupStatusBadge group={group} />;
}

type Membership = { pending: boolean; busy: boolean };
function ControlledMembership({
  ref,
  request,
  cancel,
}: {
  ref: Ref<(next: Membership) => void>;
  request: () => void;
  cancel: () => void;
}) {
  const [state, setState] = useState<Membership>({ pending: false, busy: false });
  useImperativeHandle(ref, () => setState, []);
  return <GroupJoinRequest {...state} onRequest={request} onCancel={cancel} />;
}

function ControlledGroup({ ref }: { ref: Ref<(next: GroupRecordResponse) => void> }) {
  const [group, setGroup] = useState<GroupRecordResponse>(groupRecord);
  useImperativeHandle(ref, () => setGroup, []);
  return (
    <GroupDetailsCard group={group}>
      <Text>Manage group</Text>
    </GroupDetailsCard>
  );
}

function ControlledSchedule({
  ref,
  kind = "dates",
}: {
  ref: Ref<(next: ScheduleOptionRow[]) => void>;
  kind?: "dates" | "locations";
}) {
  const [rows, setRows] = useState<ScheduleOptionRow[] | undefined>();
  useImperativeHandle(ref, () => setRows, []);
  return <ScheduleOptionsPopover name="Evening event" kind={kind} planning rows={rows} />;
}

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it("SearchInput: controlled typing and clear preserve custom field content", async () => {
  const changed = vi.fn();
  const result = await measureRenders(<ControlledSearch changed={changed} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      changed.mockClear();
    },
    scenario: async () => {
      const input = screen.getByLabelText("Find a player");
      expect(input).toHaveProp("maxLength", 30);
      await fireEvent.changeText(input, "Alice");
      expect(input).toHaveDisplayValue("Alice");
      await userEvent.setup().press(screen.getByRole("button", { name: "Reset player search" }));
      expect(input).toHaveDisplayValue("");
      expect(changed.mock.calls).toEqual([["Alice"], [""]]);
      expect(screen.getByText("Private search")).toBeOnTheScreen();
    },
  });
  assertRenderMeasurement(result);
});

for (const locale of ["en", "it"] as const) {
  it(`NameInput: ${locale} generated name and manual edit preserve the configured cap`, async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const expected = generateName("gruppo", locale).slice(0, 8);
    const label = locale === "it" ? "Genera un nome casuale" : "Generate a random name";
    const result = await measureRenders(<ControlledName />, {
      wrapper: ({ children }) => (
        <NativeTestProviders locale={locale}>{children}</NativeTestProviders>
      ),
      scenario: async () => {
        const input = screen.getByLabelText("Resource name");
        expect(input).toHaveProp("maxLength", 8);
        await userEvent.setup().press(screen.getByRole("button", { name: label }));
        expect(input).toHaveDisplayValue(expected);
        await fireEvent.changeText(input, "New name");
        expect(input).toHaveDisplayValue("New name");
      },
    });
    assertRenderMeasurement(result);
  });
}

it("ListSearchFilters: independent role toggles and controlled discovery text", async () => {
  const result = await measureRenders(<ControlledRoleSearch />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      expect(screen.getByRole("button", { name: "Admin" })).toBeSelected();
      expect(screen.getByText("Enter at least 4 characters to search")).toBeOnTheScreen();
      await userEvent.setup().press(screen.getByRole("button", { name: "Invited" }));
      expect(screen.getByRole("button", { name: "Invited" })).toBeSelected();
      expect(screen.getByRole("button", { name: "Admin" })).toBeSelected();
      await userEvent.setup().press(screen.getByRole("button", { name: "Admin" }));
      expect(screen.getByRole("button", { name: "Admin" })).not.toBeSelected();
      await fireEvent.changeText(screen.getByLabelText("Search members"), "Alice");
      expect(screen.getByLabelText("Search members")).toHaveDisplayValue("Alice");
      expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
      expect(screen.getByRole("button", { name: "Invited" })).toBeSelected();
    },
  });
  assertRenderMeasurement(result);
});

it("ListSearch: filter mode edits and clears without a discovery minimum", async () => {
  const result = await measureRenders(<ControlledFilter />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
      const input = screen.getByLabelText("Filter members");
      await fireEvent.changeText(input, "Chess");
      expect(input).toHaveDisplayValue("Chess");
      await userEvent.setup().press(screen.getByRole("button", { name: "Clear filter" }));
      expect(input).toHaveDisplayValue("");
      await pressMeasuredPopover(
        screen.getByRole("button", { name: "Filter members: Filter help" }),
      );
      expect(screen.getByText("Filter this list by name. No minimum length.")).toBeVisible();
    },
  });
  assertRenderMeasurement(result);
});

it("GroupStatusBadge: authoritative public review changes and private omission", async () => {
  const update = createRef<(next: Review) => void>();
  const result = await measureRenders(<ControlledReview ref={update} />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      expect(screen.getByText("Awaiting review")).toBeOnTheScreen();
      await act(() => update.current?.({ type: "PUBLIC", reviewStatus: "REJECTED" }));
      expect(screen.getByText("Changes rejected")).toBeOnTheScreen();
      expect(screen.queryByText("Awaiting review")).toBeNull();
      await act(() => update.current?.({ type: "PUBLIC", approved: groupRecord.approved }));
      expect(screen.getByText("Approved")).toBeOnTheScreen();
      expect(screen.queryByText("Changes rejected")).toBeNull();
      await act(() => update.current?.({ type: "PRIVATE", approved: groupRecord.approved }));
      expect(screen.queryByText("Approved")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});

it("GroupJoinRequest: explicit request, pending response and cancellation stay independent", async () => {
  const request = vi.fn(),
    cancel = vi.fn();
  const update = createRef<(next: Membership) => void>();
  const result = await measureRenders(
    <ControlledMembership ref={update} request={request} cancel={cancel} />,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        request.mockClear();
        cancel.mockClear();
      },
      scenario: async () => {
        await userEvent.setup().press(screen.getByRole("button", { name: "Request membership" }));
        expect(request).toHaveBeenCalledOnce();
        expect(cancel).not.toHaveBeenCalled();
        // Deliver controlled server props separately from the user's request.
        await act(() => update.current?.({ pending: true, busy: true }));
        expect(screen.getByText(/Membership pending\./)).toBeOnTheScreen();
        expect(screen.getByRole("button", { name: "Cancel request" })).toBeDisabled();
        await userEvent.setup().press(screen.getByRole("button", { name: "Cancel request" }));
        expect(cancel).not.toHaveBeenCalled();
        await act(() => update.current?.({ pending: true, busy: false }));
        await userEvent.setup().press(screen.getByRole("button", { name: "Cancel request" }));
        expect(cancel).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledOnce();
      },
    },
  );
  assertRenderMeasurement(result);
});

it("GroupDetailsCard: fresh group identity and venue replace cached private fields", async () => {
  const update = createRef<(next: GroupRecordResponse) => void>();
  const result = await measureRenders(<ControlledGroup ref={update} />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      expect(screen.getByText(groupRecord.name)).toBeOnTheScreen();
      expect(screen.getByText("Private")).toBeOnTheScreen();
      await act(() =>
        update.current?.({
          ...groupRecord,
          name: "Updated public group",
          type: "PUBLIC",
          reviewStatus: "REJECTED",
          rejectionReason: "Please verify the venue.",
          eventCount: 3,
          location: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Games Library",
            address: "Library Street 42, Rome, Italy",
            latitude: 41.9,
            longitude: 12.5,
            timeZone: "Europe/Rome",
          },
        }),
      );
      for (const label of [
        "Updated public group",
        "Public",
        "Changes rejected",
        "Please verify the venue.",
        "Games Library",
        "Library Street 42, Rome",
        "3 Events",
        "Manage group",
      ])
        expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.queryByText(groupRecord.name)).toBeNull();
      expect(screen.queryByText("Private")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});

it("ScheduleOptionsPopover: open loading dates and reconcile populated then empty options", async () => {
  const update = createRef<(next: ScheduleOptionRow[]) => void>();
  const result = await measureRenders(<ControlledSchedule ref={update} />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      await pressMeasuredPopover(
        screen.getByRole("button", { name: "Dates and times: Evening event" }),
      );
      expect(screen.getByLabelText("Loading…")).toBeOnTheScreen();
      await act(() =>
        update.current?.([
          { id: "friday", date: { startsAt: "2030-06-14T18:00:00.000Z", timeZone: "UTC" } },
          { id: "saturday", date: { startsAt: "2030-06-15T20:00:00.000Z", timeZone: "UTC" } },
        ]),
      );
      expect(screen.queryByLabelText("Loading…")).toBeNull();
      const format = new Intl.DateTimeFormat("en", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
      });
      for (const date of ["2030-06-14T18:00:00.000Z", "2030-06-15T20:00:00.000Z"])
        expect(screen.getByLabelText(`Start time: ${format.format(new Date(date))}`)).toBeVisible();
      await act(() => update.current?.([]));
      expect(screen.getByText("No date selected")).toBeVisible();
      expect(screen.queryAllByLabelText(/^Start time:/)).toHaveLength(0);
    },
  });
  assertRenderMeasurement(result);
});

it("ScheduleOptionsPopover: open loading venues and reconcile a verified address then empty options", async () => {
  const update = createRef<(next: ScheduleOptionRow[]) => void>();
  const result = await measureRenders(<ControlledSchedule ref={update} kind="locations" />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      await pressMeasuredPopover(screen.getByRole("button", { name: "Locations: Evening event" }));
      expect(screen.getByLabelText("Loading…")).toBeOnTheScreen();
      await act(() =>
        update.current?.([
          {
            id: "library",
            location: {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Games Library",
              address: "Library Street 42, Rome, Italy",
              latitude: 41.9,
              longitude: 12.5,
              timeZone: "Europe/Rome",
            },
          },
        ]),
      );
      expect(screen.queryByLabelText("Loading…")).toBeNull();
      expect(screen.getByText("Library Street 42, Rome")).toBeVisible();
      await act(() => update.current?.([]));
      expect(screen.getByText("No location selected")).toBeVisible();
      expect(screen.queryByText("Library Street 42, Rome")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});
