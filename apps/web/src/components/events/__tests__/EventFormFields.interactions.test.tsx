import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  type EventRecordDraft,
  eventDraft,
  useEventRecordForm,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearDateTime, enterDateTime, readDateTime } from "@/test-fixtures/dateTime";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventInformationFields } from "../EventInformationFields";
import { EventScheduleFields } from "../EventScheduleFields";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://event-form-fields.test";
  return { previousApi, getToken: vi.fn<() => Promise<string | null>>() };
});
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
const options = {
  apiUrl: "https://event-form-fields.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const publicGroup: GroupRecordResponse = {
  ...groupRecord,
  id: "44444444-4444-4444-8444-444444444444",
  name: "Approved public group",
  type: "PUBLIC",
};
const onLocation = vi.fn();
let client: QueryClient;
let groupStatus: number;
let pendingGroup: Promise<Response> | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-form-token");
  groupStatus = 200;
  pendingGroup = undefined;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(options.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-form-token");
      if (url.pathname === "/api/groups")
        return Response.json({ items: [groupRecord, publicGroup], nextCursor: null });
      if (
        url.pathname === `/api/groups/${groupRecord.id}` ||
        url.pathname === `/api/groups/${publicGroup.id}`
      )
        return (
          pendingGroup ??
          Response.json(
            groupStatus === 200
              ? url.pathname.endsWith(publicGroup.id)
                ? publicGroup
                : groupRecord
              : { error: "Group denied" },
            { status: groupStatus },
          )
        );
      throw new Error(`Unexpected form request: ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
});
function baseDraft(change: Partial<EventRecordDraft> = {}): EventRecordDraft {
  return {
    ...eventDraft(),
    name: "Planning night",
    timeZone: plannedEvent.timeZone,
    dates: [...plannedEvent.dates],
    locations: [...plannedEvent.locations],
    ...change,
  };
}
function Fixture({
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
    options,
    undefined,
    locked ? (initial.groupId ?? undefined) : undefined,
    initial,
  );
  const [dateTime, setDateTime] = useState("");
  return (
    <>
      {information ? (
        <EventInformationFields form={form} busy={busy} />
      ) : (
        <EventScheduleFields
          form={form}
          busy={busy}
          dateTime={dateTime}
          onDateTimeChange={setDateTime}
          onLocation={onLocation}
        />
      )}
      <button type="button" onClick={form.next}>
        Validate current step
      </button>
      <output aria-label="Current event draft">{JSON.stringify(form.draft)}</output>
    </>
  );
}
function mount(
  change: Partial<EventRecordDraft> = {},
  props: { information?: boolean; busy?: boolean; locked?: boolean } = {},
) {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <Fixture initial={baseDraft(change)} {...props} />
    </QueryClientProvider>,
  );
}
const draft = () => JSON.parse(screen.getByLabelText("Current event draft").textContent ?? "null");
function validateSchedule() {
  fireEvent.click(screen.getByRole("button", { name: "Validate current step" }));
  fireEvent.click(screen.getByRole("button", { name: "Validate current step" }));
}
async function chooseGroup(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
}

it("edits the actual draft name and reports the required name length after validation", () => {
  mount({ name: "" }, { information: true });
  fireEvent.click(screen.getByRole("button", { name: "Validate current step" }));
  expect(screen.getByText("Enter an event name between 5 and 30 characters.")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "New planning night" },
  });
  expect(draft()).toMatchObject({ name: "New planning night" });
  expect(screen.queryByText("Enter an event name between 5 and 30 characters.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Generate a random name" }));
  expect(draft().name).not.toBe("New planning night");
  expect(draft().name.length).toBeGreaterThanOrEqual(5);
  expect(draft().name.length).toBeLessThanOrEqual(30);
});

it("requires explicit confirmation before discarding flexible choices for a public group and preserves them on cancel", async () => {
  const dates = [
    ...plannedEvent.dates,
    { id: "55555555-5555-4555-8555-555555555555", day: "2030-06-04" },
  ];
  const locations = [
    ...plannedEvent.locations,
    {
      ...plannedEvent.locations[0],
      id: "66666666-6666-4666-8666-666666666666",
      name: "Second venue",
    },
  ];
  mount(
    { dates, locations, allowParticipantDates: true, allowParticipantLocations: true },
    { information: true },
  );
  await chooseGroup("Approved public group");
  let dialog = await screen.findByRole("dialog", { name: "Change group" });
  expect(draft()).toMatchObject({ groupId: null, dates, locations });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(draft()).toMatchObject({ groupId: null, dates, locations });
  await chooseGroup("Approved public group");
  dialog = await screen.findByRole("dialog", { name: "Change group" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Change group" }));
  await screen.findByRole("button", { name: "Approved public group Group" });
  expect(draft()).toMatchObject({
    groupId: publicGroup.id,
    dates: [dates[0]],
    locations: [locations[0]],
    allowParticipantDates: false,
    allowParticipantLocations: false,
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("radio", { name: "Public" })).toBeEnabled();
});

it("changes a private group directly and supports the explicit standalone selection without a destructive confirmation", async () => {
  mount({}, { information: true });
  await chooseGroup("Friday group");
  await screen.findByRole("button", { name: "Friday group Group" });
  expect(draft()).toMatchObject({ groupId: groupRecord.id, visibility: "PRIVATE" });
  expect(screen.queryByRole("dialog")).toBeNull();
  await chooseGroup("No group");
  expect(draft()).toMatchObject({ groupId: null, locations: plannedEvent.locations });
  expect(screen.getByRole("radio", { name: "Public" })).toBeDisabled();
});

it("retains editable information while contextual group details load, then exposes the locked authoritative group", async () => {
  let finish: (response: Response) => void = () => {};
  pendingGroup = new Promise((resolve) => {
    finish = resolve;
  });
  mount({ groupId: groupRecord.id }, { information: true, locked: true });
  expect(screen.getByRole("textbox", { name: "Event name" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Group$/ })).toBeNull();
  await act(async () => finish(Response.json(groupRecord)));
  expect(await screen.findByRole("button", { name: "Friday group Group" })).toBeDisabled();
});

it("reports failed contextual group reads and retries without substituting an unapproved editable group", async () => {
  groupStatus = 403;
  mount({ groupId: groupRecord.id }, { information: true, locked: true });
  expect(await screen.findByText("Could not load group")).toBeVisible();
  groupStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Friday group Group" })).toBeDisabled();
  expect(screen.queryByText("Could not load group")).toBeNull();
});

it("adds and removes flexible dates and locations using the real form, and updates both participant-proposal switches", () => {
  mount();
  expect(screen.getByRole("button", { name: "Add date" })).toBeDisabled();
  enterDateTime(screen.getByRole("group", { name: "Date and time" }), "2030-06-04T19:30");
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(draft()).toMatchObject({
    dates: [
      plannedEvent.dates[0],
      expect.objectContaining({ day: "2030-06-04", startTime: "19:30" }),
    ],
  });
  expect(readDateTime(screen.getByRole("group", { name: "Date and time" }))).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Remove date: 2030-06-03 20:00" }));
  expect(draft().dates).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  expect(onLocation).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Remove location: Club venue" }));
  expect(draft().locations).toEqual([]);
  fireEvent.click(screen.getByRole("switch", { name: "Allow date proposals" }));
  fireEvent.click(screen.getByRole("switch", { name: "Allow location proposals" }));
  expect(draft()).toMatchObject({ allowParticipantDates: true, allowParticipantLocations: true });
});

it("adds the popover's final date with Done, deduplicates it and retains the keyboard Add action", async () => {
  mount();
  const field = screen.getByRole("group", { name: "Date and time" });
  enterDateTime(field, "2030-06-04T19:30");
  fireEvent.click(within(field).getByRole("button"));
  const dialog = await screen.findByRole("dialog", { name: "Choose date and time" });
  fireEvent.click(within(within(dialog).getByRole("grid")).getByText("15", { exact: true }));
  enterDateTime(within(dialog).getByRole("group", { name: "Time" }), "21:45");
  expect(draft().dates).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(draft().dates).toEqual([
    plannedEvent.dates[0],
    expect.objectContaining({ day: "2030-06-15", startTime: "21:45" }),
  ]);
  expect(readDateTime(field)).toBe("");
  expect(screen.getByRole("button", { name: "Add date" })).toBeDisabled();
  enterDateTime(field, "2030-06-15T21:45");
  fireEvent.click(within(field).getByRole("button"));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Done" }));
  expect(draft().dates).toHaveLength(2);
  expect(readDateTime(field)).toBe("");
  enterDateTime(field, "2030-06-06T19:30");
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(draft().dates).toHaveLength(3);
  expect(draft().dates[2]).toMatchObject({ day: "2030-06-06", startTime: "19:30" });
  expect(fetch).not.toHaveBeenCalled();
});

it("removes the add row after Done fills the date limit without saving the event", async () => {
  const dates = Array.from({ length: MAX_EVENT_OPTIONS - 1 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    day: `2030-06-${String(index + 1).padStart(2, "0")}`,
  }));
  mount({ dates });
  const field = screen.getByRole("group", { name: "Date and time" });
  enterDateTime(field, "2030-07-01T19:30");
  fireEvent.click(within(field).getByRole("button"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(draft().dates).toHaveLength(MAX_EVENT_OPTIONS);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add date" })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("blocks popover addition when the parent becomes busy", async () => {
  const view = mount();
  const field = screen.getByRole("group", { name: "Date and time" });
  enterDateTime(field, "2030-06-04T19:30");
  fireEvent.click(within(field).getByRole("button"));
  await screen.findByRole("dialog");
  view.rerender(
    <QueryClientProvider client={client}>
      <Fixture initial={baseDraft()} busy />
    </QueryClientProvider>,
  );
  const done = within(screen.getByRole("dialog")).getByRole("button", { name: "Done" });
  expect(done).toBeDisabled();
  fireEvent.click(done);
  expect(draft().dates).toHaveLength(1);
});

it("keeps private schedule errors specific to missing dates and verified locations", () => {
  mount({ dates: [], locations: [] });
  validateSchedule();
  expect(screen.getByText("Choose at least one valid date and time.")).toBeVisible();
  expect(screen.getByText("Choose at least one verified location.")).toBeVisible();
});

it("does not offer more date or location options at the domain limit and restores the controls after removal", () => {
  const dates = Array.from({ length: MAX_EVENT_OPTIONS }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    day: `2030-06-${String(index + 1).padStart(2, "0")}`,
  }));
  const locations = dates.map((date, index) => ({
    ...plannedEvent.locations[0],
    id: date.id,
    name: `Venue ${index + 1}`,
  }));
  mount({ dates, locations });
  expect(screen.queryByRole("button", { name: "Add date" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Choose a location" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove date: 2030-06-01 20:00" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove location: Venue 1" }));
  expect(screen.getByRole("button", { name: "Add date" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeEnabled();
});

it("keeps schedule mutation controls disabled while the parent is busy", () => {
  mount({}, { busy: true });
  for (const name of ["Remove date: 2030-06-03 20:00", "Remove location: Club venue", "Add date"])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(
    within(screen.getByRole("group", { name: "Date and time" })).getByRole("button"),
  ).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Allow date proposals" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Choose a location" })).toBeNull();
});

it("enforces public same-day start/end and previous-day booking bounds through the actual controlled inputs", async () => {
  mount({ groupId: publicGroup.id, endsWall: "2030-06-03T22:00", cutoffWall: "2030-06-02T18:00" });
  const start = await screen.findByRole("group", { name: /^Date and time$/ });
  expect(screen.queryByRole("switch", { name: "Allow date proposals" })).toBeNull();
  const end = screen.getByRole("group", { name: /^End time/ });
  enterDateTime(end, "19:00");
  expect(draft()).toMatchObject({ endsWall: "2030-06-03T22:00" });
  enterDateTime(end, "23:00");
  expect(draft()).toMatchObject({ endsWall: "2030-06-03T23:00" });
  clearDateTime(end);
  expect(draft()).toMatchObject({ endsWall: "" });
  enterDateTime(start, "2030-06-03T21:00");
  expect(draft().dates[0]).toMatchObject({ day: "2030-06-03", startTime: "21:00" });
  enterDateTime(start, "2030-06-05T21:00");
  expect(draft().dates[0]).toMatchObject({ day: "2030-06-05", startTime: "21:00" });
  const cutoff = screen.getByRole("group", { name: /^Registration Deadline Date and Time/ });
  enterDateTime(cutoff, "2020-01-01T12:00");
  expect(draft()).toMatchObject({ cutoffWall: "2030-06-02T18:00" });
  enterDateTime(cutoff, "2030-06-05T12:00");
  expect(draft()).toMatchObject({ cutoffWall: "2030-06-02T18:00" });
  enterDateTime(cutoff, "2030-06-04T18:00");
  expect(draft()).toMatchObject({ cutoffWall: "2030-06-04T18:00" });
  clearDateTime(cutoff);
  expect(draft()).toMatchObject({ cutoffWall: "" });
  enterDateTime(start, "2030-06-05T23:59");
  expect(
    within(screen.getByRole("group", { name: /^End time/ })).getAllByRole("spinbutton")[0],
  ).toHaveAttribute("aria-disabled", "true");
});

it("reports public schedule validation errors without replacing the missing fields with private alternatives", async () => {
  mount({ groupId: publicGroup.id, locations: [], endsWall: "", cutoffWall: "" });
  await screen.findByRole("group", { name: /^Date and time$/ });
  validateSchedule();
  expect(screen.getByText("Choose a later end time on the same day as the start.")).toBeVisible();
  expect(
    screen.getByText("Choose a registration deadline on a day before the event."),
  ).toBeVisible();
  expect(screen.getByText("Choose exactly one verified location.")).toBeVisible();
});
