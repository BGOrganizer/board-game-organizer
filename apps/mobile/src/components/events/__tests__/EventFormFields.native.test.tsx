import { URL } from "node:url";
import { type GroupRecordResponse, MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import {
  type EventRecordDraft,
  groupRecordKeys,
  groupRecordsPageQuery,
  useEventRecordForm,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { Button } from "heroui-native/button";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import { groupRecord, plannedEvent } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventInformationFields } from "../EventInformationFields";
import { EventScheduleFields } from "../EventScheduleFields";
import { eventDraftFixture } from "./eventWizardFixtures";

type NativePickerOptions = Parameters<
  typeof import("@react-native-community/datetimepicker").DateTimePickerAndroid.open
>[0];
const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "native-fields-token"),
  location: vi.fn(),
  picker: { open: vi.fn<(options: NativePickerOptions) => void>(), dismiss: vi.fn() },
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "event-fields-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://event-fields-native.test" } } },
}));
vi.mock("expo-router", () => ({ useNavigation: () => ({ getState: () => ({ type: "stack" }) }) }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));
const options = {
  apiUrl: "https://event-fields-native.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const publicGroup: GroupRecordResponse = {
  ...groupRecord,
  id: "44444444-4444-4444-8444-444444444444",
  type: "PUBLIC",
  name: "Approved public club",
  approved: { name: "Approved public club", location: plannedEvent.locations[0] },
};
let client: QueryClient;
let groupCode: number;
let pendingGroup: Promise<Response> | undefined;
const reads: URL[] = [];
beforeEach(async () => {
  vi.clearAllMocks();
  groupCode = 200;
  pendingGroup = undefined;
  reads.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== options.apiUrl || (init?.method ?? "GET") !== "GET")
        throw new Error(`Unexpected field I/O: ${init?.method ?? "GET"} ${url.href}`);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer native-fields-token");
      reads.push(url);
      if (url.pathname === "/api/groups")
        return Response.json({ items: [groupRecord, publicGroup], nextCursor: null });
      if ([`/api/groups/${groupRecord.id}`, `/api/groups/${publicGroup.id}`].includes(url.pathname))
        return (
          pendingGroup ??
          Response.json(
            groupCode === 200
              ? url.pathname.endsWith(publicGroup.id)
                ? publicGroup
                : groupRecord
              : { error: "Group unavailable" },
            { status: groupCode },
          )
        );
      throw new Error(`Unexpected event field read: ${url.href}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function seedGroups() {
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  client.setQueryData(groupRecordKeys.detail(options, publicGroup.id), publicGroup);
  client.setQueryData(groupRecordsPageQuery(options, "mine", "", ["admin"]).queryKey, {
    pages: [{ items: [groupRecord, publicGroup], nextCursor: null }],
    pageParams: [""],
  });
}
function draft(change: Partial<EventRecordDraft> = {}): EventRecordDraft {
  return eventDraftFixture({
    groupId: null,
    dates: plannedEvent.dates,
    locations: plannedEvent.locations,
    ...change,
  });
}
function Fields({
  initial,
  information = false,
  busy = false,
  locked = false,
}: {
  initial: EventRecordDraft;
  information?: boolean;
  busy?: boolean;
  locked?: boolean;
}) {
  const form = useEventRecordForm(
    useCommunityApi(),
    undefined,
    locked ? (initial.groupId ?? undefined) : undefined,
    initial,
  );
  return (
    <>
      {information ? (
        <EventInformationFields form={form} busy={busy} />
      ) : (
        <EventScheduleFields form={form} busy={busy} onLocation={boundary.location} />
      )}
      <Button onPress={form.next}>
        <Button.Label>Validate current step</Button.Label>
      </Button>
      <Text accessibilityLabel="Current event draft">{JSON.stringify(form.draft)}</Text>
    </>
  );
}
function Fixture(props: Parameters<typeof Fields>[0]) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Fields {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
function currentDraft(): unknown {
  const value = screen.getByLabelText("Current event draft").props.children;
  if (typeof value !== "string") throw new Error("Expected the actual form's serialized draft");
  return JSON.parse(value);
}
async function chooseGroup(name: string) {
  // Exercise the real Select state callbacks; Node cannot prove animated native tappability.
  await positionMeasuredSelect(screen.getByRole("combobox", { name: "Group" }));
  await fireEvent.press(
    screen.getByRole("option", { name: new RegExp(name), includeHiddenElements: true }),
  );
}
async function nativeChoice(iso: string) {
  const choice = boundary.picker.open.mock.calls.at(-1)?.[0];
  if (!choice?.onChange) throw new Error("Expected the external Android picker callback");
  const date = new Date(iso);
  await act(() =>
    choice.onChange?.(
      { type: "set", nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } },
      date,
    ),
  );
}

it("edits the real name draft and clears its name error without advancing an invalid form", async () => {
  seedGroups();
  await render(<Fixture initial={draft({ name: "" })} information />);
  await press("Validate current step");
  expect(screen.getByText("Enter an event name between 5 and 30 characters.")).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText("Event name"), "New planning evening");
  expect(currentDraft()).toMatchObject({ name: "New planning evening" });
  expect(screen.queryByText("Enter an event name between 5 and 30 characters.")).toBeNull();
  expect(reads).toEqual([]);
});

it("confirms a destructive public-group transition and preserves all private choices when cancelled", async () => {
  seedGroups();
  const initial = draft({
    dates: [
      ...plannedEvent.dates,
      { id: "55555555-5555-4555-8555-555555555555", day: "2030-06-04" },
    ],
    allowParticipantDates: true,
    allowParticipantLocations: true,
    tables: draft().tables.map((table) => ({ ...table, allowParticipantGames: true })),
  });
  await render(<Fixture initial={initial} information />);
  // Compare the complete serialized draft: optional undefined fields are not JSON keys.
  const beforeChoice = currentDraft();
  await chooseGroup(publicGroup.name);
  expect(
    screen.getByText(
      "Public groups allow one date and one location and do not allow participant proposals. Keep the first options and disable proposals?",
    ),
  ).toBeVisible();
  expect(currentDraft()).toEqual(beforeChoice);
  await press("Cancel");
  expect(currentDraft()).toEqual(beforeChoice);
  await chooseGroup(publicGroup.name);
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Change group",
    }),
  );
  expect(currentDraft()).toMatchObject({
    groupId: publicGroup.id,
    dates: [initial.dates[0]],
    allowParticipantDates: false,
    allowParticipantLocations: false,
    tables: [expect.objectContaining({ allowParticipantGames: false })],
  });
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(screen.getByRole("radio", { name: "Public" })).toBeEnabled();
  await userEvent.setup().press(screen.getByRole("radio", { name: "Public" }));
  expect(currentDraft()).toMatchObject({ visibility: "PUBLIC" });
  expect(reads).toEqual([]);
});

it("changes a private group directly, ignores reselection and returns explicitly to standalone", async () => {
  seedGroups();
  await render(<Fixture initial={draft()} information />);
  await chooseGroup(groupRecord.name);
  expect(currentDraft()).toMatchObject({ groupId: groupRecord.id, visibility: "PRIVATE" });
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  await chooseGroup(groupRecord.name);
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  await chooseGroup("No group");
  expect(currentDraft()).toMatchObject({ groupId: null, locations: plannedEvent.locations });
  expect(screen.getByRole("radio", { name: "Public" })).toBeDisabled();
});

it("selects a public group directly when no flexible choices or proposal consent would be lost", async () => {
  seedGroups();
  await render(
    <Fixture
      initial={draft({ allowParticipantDates: false, allowParticipantLocations: false })}
      information
    />,
  );
  await chooseGroup(publicGroup.name);
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(currentDraft()).toMatchObject({
    groupId: publicGroup.id,
    dates: plannedEvent.dates,
    locations: plannedEvent.locations,
  });
  expect(screen.getByRole("radio", { name: "Public" })).toBeEnabled();
});

it("keeps names editable while contextual group details load and then locks the actual selected group", async () => {
  let finish: (response: Response) => void = () => {};
  pendingGroup = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture initial={draft({ groupId: groupRecord.id })} information locked />);
  expect(screen.getByLabelText("Event name")).toHaveProp("editable", true);
  expect(screen.queryByRole("combobox", { name: "Group" })).toBeNull();
  await act(async () => finish(Response.json(groupRecord)));
  expect(await screen.findByRole("combobox", { name: "Group" })).toBeDisabled();
  expect(currentDraft()).toMatchObject({ groupId: groupRecord.id });
});

it("retries failed contextual group authority and shows a specific group validation error before approval", async () => {
  groupCode = 403;
  await render(<Fixture initial={draft({ groupId: groupRecord.id })} information locked />);
  expect(await screen.findByText("Could not load group")).toBeVisible();
  await press("Validate current step");
  expect(screen.getByText("Could not load group")).toBeVisible();
  groupCode = 200;
  await press("Try again");
  await waitFor(() => expect(screen.queryByText("Could not load group")).toBeNull());
  expect(screen.getByRole("combobox", { name: "Group" })).toBeDisabled();
  expect(currentDraft()).toMatchObject({ groupId: groupRecord.id });
});

it("does not treat a readable non-manager group as authorized to create its event", async () => {
  const unauthorized: GroupRecordResponse = {
    ...groupRecord,
    role: "accepted",
    canInvite: false,
    canEdit: false,
  };
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), unauthorized);
  client.setQueryData(groupRecordsPageQuery(options, "mine", "", ["admin"]).queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [""],
  });
  await render(<Fixture initial={draft({ groupId: groupRecord.id })} information locked />);
  await press("Validate current step");
  expect(screen.getByText("An approved group and its administrator are required.")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Group" })).toBeDisabled();
  expect(reads).toEqual([]);
});

it("requires confirmation for Manual to Assisted and updates the BGG preference through both public controls", async () => {
  seedGroups();
  await render(<Fixture initial={draft()} information />);
  await userEvent.setup().press(screen.getByRole("radio", { name: "Manual" }));
  expect(currentDraft()).toMatchObject({ planningMode: "MANUAL" });
  await fireEvent.press(screen.getByText("Assisted"));
  expect(
    screen.getByText(
      "Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.",
    ),
  ).toBeVisible();
  expect(currentDraft()).toMatchObject({ planningMode: "MANUAL" });
  await press("Cancel");
  expect(currentDraft()).toMatchObject({ planningMode: "MANUAL" });
  await userEvent.setup().press(screen.getByRole("radio", { name: "Assisted" }));
  await userEvent
    .setup()
    .press(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: "Assisted" }),
    );
  expect(currentDraft()).toMatchObject({ planningMode: "ASSISTED" });
  await fireEvent.press(screen.getByText("BGG Best"));
  expect(currentDraft()).toMatchObject({ playerPreference: "BEST", allowBestReduction: true });
  await userEvent.setup().press(screen.getByRole("radio", { name: "Players" }));
  expect(currentDraft()).toMatchObject({
    playerPreference: "MORE_PLAYERS",
    allowBestReduction: false,
  });
  expect(reads).toEqual([]);
});

it("blocks name, group, planning radios and their separate text actions while busy", async () => {
  seedGroups();
  const initial = draft();
  await render(<Fixture initial={initial} information busy />);
  const beforePress = currentDraft();
  expect(screen.getByLabelText("Event name")).toHaveProp("editable", false);
  expect(screen.getByRole("combobox", { name: "Group" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Manual" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "BGG Best" })).toBeDisabled();
  await fireEvent.press(screen.getByText("Manual"));
  await fireEvent.press(screen.getByText("BGG Best"));
  expect(currentDraft()).toEqual(beforePress);
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(reads).toEqual([]);
});

it("adds an explicit Android date/time, removes only the chosen options and updates proposal switches", async () => {
  await render(<Fixture initial={draft()} />);
  await press("Choose date and time");
  expect(boundary.picker.open.mock.calls.at(-1)?.[0].mode).toBe("date");
  await nativeChoice("2030-06-04T00:00:00Z");
  expect(boundary.picker.open.mock.calls.at(-1)?.[0].mode).toBe("time");
  await nativeChoice("2030-06-04T18:15:00Z");
  expect(currentDraft()).toMatchObject({
    dates: [
      plannedEvent.dates[0],
      expect.objectContaining({ day: "2030-06-04", startTime: "18:15" }),
    ],
  });
  await press("Remove date: 2030-06-03 20:00");
  expect(screen.queryByRole("button", { name: "Remove date: 2030-06-03 20:00" })).toBeNull();
  await press("Choose a location");
  expect(boundary.location).toHaveBeenCalledOnce();
  await press("Remove location: Club venue");
  expect(currentDraft()).toMatchObject({ locations: [] });
  await userEvent.setup().press(screen.getByRole("switch", { name: "Allow date proposals" }));
  await userEvent.setup().press(screen.getByRole("switch", { name: "Allow location proposals" }));
  expect(currentDraft()).toMatchObject({
    allowParticipantDates: true,
    allowParticipantLocations: true,
  });
  expect(reads).toEqual([]);
});

it("reports missing private date and verified-location fields after actual step validation", async () => {
  await render(<Fixture initial={draft({ dates: [], locations: [] })} />);
  await press("Validate current step");
  await press("Validate current step");
  expect(screen.getByText("Choose at least one valid date and time.")).toBeVisible();
  expect(screen.getByText("Choose at least one verified location.")).toBeVisible();
});

it("reports an unresolved location time zone instead of accepting its displayed address as verified", async () => {
  await render(
    <Fixture
      initial={draft({ locations: [{ ...plannedEvent.locations[0], timeZone: undefined }] })}
    />,
  );
  await press("Validate current step");
  await press("Validate current step");
  expect(
    screen.getByText("Could not determine the location time zone. Choose a location."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove location: Club venue" })).toBeEnabled();
  expect(boundary.location).not.toHaveBeenCalled();
});

it("hides additional options at the domain limit and restores them after a targeted removal", async () => {
  const dates = Array.from({ length: MAX_EVENT_OPTIONS }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    day: `2030-06-${String(index + 1).padStart(2, "0")}`,
  }));
  const locations = dates.map((row, index) => ({
    ...plannedEvent.locations[0],
    id: row.id,
    name: `Venue ${index + 1}`,
  }));
  await render(<Fixture initial={draft({ dates, locations })} />);
  expect(screen.queryByRole("button", { name: "Choose date and time" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Choose a location" })).toBeNull();
  await press("Remove date: 2030-06-01 20:00");
  await press("Remove location: Venue 1");
  expect(screen.getByRole("button", { name: "Choose date and time" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeEnabled();
});

it("prevents private schedule and proposal mutations while busy", async () => {
  const initial = draft();
  await render(<Fixture initial={initial} busy />);
  const beforePress = currentDraft();
  for (const label of [
    "Choose date and time",
    "Remove date: 2030-06-03 20:00",
    "Remove location: Club venue",
  ])
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Choose a location" })).toBeNull();
  expect(screen.getByRole("switch", { name: "Allow date proposals" })).toBeDisabled();
  await press("Choose date and time");
  expect(boundary.picker.open).not.toHaveBeenCalled();
  expect(currentDraft()).toEqual(beforePress);
});

it("keeps public date, start/end and cutoff updates within their actual Android field constraints", async () => {
  seedGroups();
  await render(
    <Fixture
      initial={draft({
        groupId: publicGroup.id,
        endsWall: "2030-06-03T23:00",
        cutoffWall: "2030-06-02T18:00",
      })}
    />,
  );
  expect(screen.queryByRole("switch", { name: "Allow date proposals" })).toBeNull();
  await press("Start time");
  await nativeChoice("2030-06-03T21:00:00Z");
  expect(currentDraft()).toMatchObject({
    dates: [expect.objectContaining({ day: "2030-06-03", startTime: "21:00" })],
  });
  await press("End time");
  await nativeChoice("2030-06-03T20:00:00Z");
  expect(screen.getByText("Choose a time within the allowed range.")).toBeVisible();
  expect(currentDraft()).toMatchObject({ endsWall: "2030-06-03T23:00" });
  await press("End time");
  await nativeChoice("2030-06-03T22:30:00Z");
  expect(currentDraft()).toMatchObject({ endsWall: "2030-06-03T22:30" });
  await press("Event date");
  await nativeChoice("2030-06-05T00:00:00Z");
  expect(currentDraft()).toMatchObject({
    dates: [expect.objectContaining({ day: "2030-06-05", startTime: "21:00" })],
    endsWall: "2030-06-05T22:30",
  });
  await press("Registration Deadline Date and Time");
  await nativeChoice("2030-06-04T00:00:00Z");
  await nativeChoice("2030-06-04T18:15:00Z");
  expect(currentDraft()).toMatchObject({ cutoffWall: "2030-06-04T18:15" });
  expect(reads).toEqual([]);
});

it("uses single-option errors for a public event without creating private proposal controls", async () => {
  seedGroups();
  await render(
    <Fixture
      initial={draft({ groupId: publicGroup.id, endsWall: "", cutoffWall: "", locations: [] })}
    />,
  );
  await press("Validate current step");
  await press("Validate current step");
  expect(screen.getByText("Choose a later end time on the same day as the start.")).toBeVisible();
  expect(
    screen.getByText("Choose a registration deadline on a day before the event."),
  ).toBeVisible();
  expect(screen.getByText("Choose exactly one verified location.")).toBeVisible();
  expect(screen.queryByRole("switch", { name: "Allow date proposals" })).toBeNull();
});
