import { act, render, screen, userEvent } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { EventDraftTableCard } from "../EventDraftTableCard";
import { EventDraftTableEditor } from "../EventDraftTableEditor";
import { EventWizardSummary } from "../EventWizardSummary";
import { eventDraftFixture, tableDraftFixture } from "./eventWizardFixtures";

type NativePickerOptions = Parameters<
  typeof import("@react-native-community/datetimepicker").DateTimePickerAndroid.open
>[0];
const nativePicker = vi.hoisted(() => ({ open: vi.fn(), dismiss: vi.fn() }));
// Android's external native date dialog is driven through its public SDK API.
// All application fields, validation, counters and HeroUI controls stay real.
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: nativePicker,
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await installNativePopoverMeasurements();
});
afterEach(() => vi.restoreAllMocks());

it("summarizes private draft options without creating status, attendance, navigation or field-help actions", async () => {
  await render(
    <NativeTestProviders>
      <EventWizardSummary draft={eventDraftFixture()} groupName="Private games group" />
    </NativeTestProviders>,
  );
  for (const text of [
    "Spring games evening",
    "Group",
    "Private games group",
    "Settings",
    "Assisted",
    "Players",
    "Dates and times",
    "Locations",
    "Games club",
    "Via Roma 1, Rome",
    "Table list",
    "May 2, 2030 · 20:00",
    "May 3, 2030 · 18:30",
  ]) {
    expect(screen.getByText(text)).toBeVisible();
  }
  expect(screen.queryByText("Registration Deadline Date and Time")).toBeNull();
  expect(screen.queryByText("Confirmed")).toBeNull();
  expect(
    screen.queryByText("BGG Best allows reducing the seated group in Assisted planning."),
  ).toBeNull();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("summarizes public start/end and registration cutoff while explaining Best without adding controls", async () => {
  const draft = eventDraftFixture({
    dates: [{ id: "date-public", day: "2030-05-02" }],
    planningMode: "MANUAL",
    playerPreference: "BEST",
  });
  await render(
    <NativeTestProviders>
      <EventWizardSummary draft={draft} publicGroup />
    </NativeTestProviders>,
  );
  for (const text of [
    "No group",
    "Manual",
    "BGG Best",
    "BGG Best allows reducing the seated group in Assisted planning.",
    "Date and start/end time",
    "Registration Deadline Date and Time",
    "May 2, 2030 · 20:00 · 23:00",
    "May 1, 2030 · 18:00",
  ]) {
    expect(screen.getByText(text)).toBeVisible();
  }
  expect(screen.queryByText("Dates and times")).toBeNull();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("keeps summary rows authoritative after a draft update and supports empty optional date/location sets", async () => {
  const view = await render(
    <NativeTestProviders>
      <EventWizardSummary draft={eventDraftFixture()} groupName="First group" />
    </NativeTestProviders>,
  );
  await view.rerender(
    <NativeTestProviders>
      <EventWizardSummary
        draft={eventDraftFixture({ name: "Updated evening", dates: [], locations: [] })}
        groupName="Another group"
      />
    </NativeTestProviders>,
  );
  expect(screen.getByText("Updated evening")).toBeVisible();
  expect(screen.getByText("Another group")).toBeVisible();
  expect(screen.queryByText("First group")).toBeNull();
  expect(screen.queryByText("Games club")).toBeNull();
  expect(screen.queryByText(/May 2, 2030/)).toBeNull();
  expect(screen.getByText("Table list")).toBeVisible();
});

it.each([
  { label: "Players: Table #1", title: "Players", text: "Minimum players: 2" },
  { label: "Rating disabled", title: "Rating", text: "This table does not update player ratings." },
  { label: "Board games: Table #1", title: "Board games", text: "First strategy game" },
])(
  "opens factual draft card information through the real $title popover",
  async ({ label, title, text }) => {
    await render(
      <NativeTestProviders>
        <EventDraftTableCard row={tableDraftFixture()} title="Table #1" />
      </NativeTestProviders>,
    );
    expect(screen.getByText("Table #1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Demonstrator: Table #1" })).toBeNull();
    expect(screen.queryByText("Confirmed")).toBeNull();
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText(text, { exact: true })).toBeVisible();
  },
);

it.each([
  { publicGroup: true, row: tableDraftFixture(), text: "No demonstrator" },
  {
    publicGroup: false,
    row: tableDraftFixture({ demonstratorUserId: "demo-one", demonstratorName: "Demo player" }),
    text: "Demo player",
  },
  {
    publicGroup: false,
    row: tableDraftFixture({ demonstratorUserId: "demo-one", demonstratorName: null }),
    text: "Unknown",
  },
])("shows only the local draft demonstrator facts ($text)", async ({ publicGroup, row, text }) => {
  await render(
    <NativeTestProviders>
      <EventDraftTableCard row={row} title="Table #1" publicGroup={publicGroup} />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Demonstrator: Table #1" }));
  expect(screen.getByRole("heading", { name: "Demonstrator" })).toBeVisible();
  expect(screen.getByText(text)).toBeVisible();
});

it("keeps draft game information empty when no game is selected and explains enabled ratings", async () => {
  const view = await render(
    <NativeTestProviders>
      <EventDraftTableCard row={tableDraftFixture({ games: [] })} title="Table #1" />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Board games: Table #1" }));
  expect(screen.getByText("No games found")).toBeVisible();
  await view.unmount();
  await render(
    <NativeTestProviders>
      <EventDraftTableCard
        row={tableDraftFixture({ rankingEnabled: true, id: "persisted-table" })}
        title="Table #1"
      />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Rating enabled" }));
  expect(
    screen.getByText(
      "This table contributes to player ratings when eligible results are finalized.",
    ),
  ).toBeVisible();
});

type EditorProps = ComponentProps<typeof EventDraftTableEditor>;
function EditorFixture({
  row: initial = tableDraftFixture(),
  onChange = () => {},
  ...props
}: Partial<EditorProps>) {
  const [row, setRow] = useState(initial);
  return (
    <NativeTestProviders>
      <FormInteractionScope>
        <EventDraftTableEditor
          row={row}
          publicGroup={false}
          timeZone="Europe/Rome"
          busy={false}
          onRemove={() => {}}
          onGame={() => {}}
          onDemonstrator={() => {}}
          {...props}
          onChange={(change) => {
            onChange(change);
            setRow((current) => ({ ...current, ...change }));
          }}
        />
      </FormInteractionScope>
    </NativeTestProviders>
  );
}
const press = async (name: string) => userEvent.setup().press(screen.getByRole("button", { name }));

it("keeps the automatic name read-only and dispatches only requested game/table actions", async () => {
  const onChange = vi.fn(),
    onRemove = vi.fn(),
    onGame = vi.fn();
  await render(<EditorFixture onChange={onChange} onRemove={onRemove} onGame={onGame} />);
  expect(screen.queryByLabelText("Table name")).toBeNull();
  expect(screen.queryByRole("button", { name: "Generate a random name" })).toBeNull();
  await press("Choose a game");
  expect(onGame).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
  await press("Remove table");
  expect(onRemove).toHaveBeenCalledOnce();
});

it("constrains real player counters to BGG and the other counter while keeping valid changes interactive", async () => {
  const onChange = vi.fn();
  await render(<EditorFixture onChange={onChange} />);
  expect(screen.getByText("BoardGameGeek player limits: 2–4")).toBeVisible();
  expect(screen.getByRole("button", { name: "Decrease: Minimum players" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Increase: Maximum players" })).toBeDisabled();
  await press("Decrease: Minimum players");
  expect(onChange).not.toHaveBeenCalled();
  await press("Increase: Minimum players");
  expect(onChange).toHaveBeenLastCalledWith({ minPlayers: 3 });
  await press("Decrease: Maximum players");
  expect(onChange).toHaveBeenLastCalledWith({ maxPlayers: 3 });
  expect(screen.getByRole("button", { name: "Increase: Minimum players" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decrease: Maximum players" })).toBeDisabled();
  await press("Decrease: Minimum players");
  expect(onChange).toHaveBeenLastCalledWith({ minPlayers: 2 });
});

it("toggles ratings and private game proposals through the real HeroUI switches", async () => {
  const onChange = vi.fn();
  await render(<EditorFixture privateGroup onChange={onChange} />);
  const rating = screen.getByRole("switch", { name: "Enable ratings" });
  const proposals = screen.getByRole("switch", { name: "Allow game proposals" });
  await userEvent.setup().press(rating);
  expect(onChange).toHaveBeenLastCalledWith({ rankingEnabled: true });
  expect(rating).toBeChecked();
  await userEvent.setup().press(proposals);
  expect(onChange).toHaveBeenLastCalledWith({ allowParticipantGames: true });
  expect(proposals).toBeChecked();
  await userEvent.setup().press(proposals);
  expect(onChange).toHaveBeenLastCalledWith({ allowParticipantGames: false });
});

it("blocks editing actions while busy instead of dispatching callbacks from disabled controls", async () => {
  const onChange = vi.fn(),
    onRemove = vi.fn(),
    onGame = vi.fn(),
    onDemonstrator = vi.fn();
  await render(
    <EditorFixture
      busy
      publicGroup
      privateGroup
      onChange={onChange}
      onRemove={onRemove}
      onGame={onGame}
      onDemonstrator={onDemonstrator}
      eventStartWall="2030-05-02T20:00"
      eventEndWall="2030-05-02T23:00"
    />,
  );
  for (const name of [
    "Increase: Minimum players",
    "Decrease: Maximum players",
    "Remove game: First strategy game",
    "Remove table",
    "Choose demonstrator",
    "Table start",
  ]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
    await press(name);
  }
  for (const name of ["Enable ratings", "Allow game proposals"])
    await userEvent.setup().press(screen.getByRole("switch", { name }));
  expect(screen.queryByRole("button", { name: "Choose a game" })).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
  expect(onGame).not.toHaveBeenCalled();
  expect(onDemonstrator).not.toHaveBeenCalled();
  expect(nativePicker.open).not.toHaveBeenCalled();
});

it("removes a selected game through its row action and updates the visible validation state", async () => {
  const onChange = vi.fn();
  await render(<EditorFixture onChange={onChange} fieldError={(path) => path === "games"} />);
  expect(screen.getByText("Choose compatible games.")).toBeVisible();
  await press("Remove game: First strategy game");
  expect(onChange).toHaveBeenLastCalledWith({ games: [] });
  expect(screen.queryByText("First strategy game")).toBeNull();
  expect(screen.getByText("Choose at least one game.")).toBeVisible();
  expect(screen.queryByText(/BoardGameGeek player limits/)).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a game" })).toBeEnabled();
});

it("renders explicit count/demonstrator/schedule errors without silently accepting invalid drafts", async () => {
  await render(
    <EditorFixture
      publicGroup
      fieldError={(path) => path !== "demonstratorGuestName"}
      eventStartWall="2030-05-02T20:00"
      eventEndWall="2030-05-02T23:00"
    />,
  );
  for (const message of [
    "Choose valid player counts within the limits of the selected games.",
    "Choose a table start and duration within the event.",
    "Choose an available group demonstrator.",
    "Choose compatible games.",
  ])
    expect(screen.getByText(message)).toBeVisible();
  expect(screen.queryByRole("switch", { name: "Allow game proposals" })).toBeNull();
});

it("shows a guest demonstrator in the same editable identity row and removes only that draft assignment", async () => {
  const onChange = vi.fn();
  await render(
    <EditorFixture
      publicGroup
      row={tableDraftFixture({ demonstratorGuestName: "Guest guide" })}
      onChange={onChange}
    />,
  );
  expect(screen.getByText("Guest guide")).toBeVisible();
  await press("Remove demonstrator");
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    demonstratorUserId: undefined,
    demonstratorGuestName: undefined,
    demonstratorName: undefined,
    demonstratorAvatarUrl: undefined,
  });
});
it("reports a guest-name validation error on the demonstrator row", async () => {
  await render(
    <EditorFixture
      publicGroup
      row={tableDraftFixture({ demonstratorGuestName: "Guest guide" })}
      fieldError={(path) => path === "demonstratorGuestName"}
    />,
  );
  expect(screen.getByText("Enter a guest name between 1 and 80 characters.")).toBeVisible();
  expect(screen.queryByText("Choose an available group demonstrator.")).toBeNull();
});

it("allows choosing and removing a public demonstrator without changing the remaining draft", async () => {
  const onChange = vi.fn(),
    onDemonstrator = vi.fn();
  await render(
    <EditorFixture
      publicGroup
      row={tableDraftFixture({ demonstratorUserId: "demo-one", demonstratorName: "Demo player" })}
      onChange={onChange}
      onDemonstrator={onDemonstrator}
    />,
  );
  expect(screen.getByText("Demo player")).toBeVisible();
  await press("Choose demonstrator");
  expect(onDemonstrator).toHaveBeenCalledOnce();
  await press("Remove demonstrator");
  expect(onChange).toHaveBeenLastCalledWith({
    demonstratorUserId: undefined,
    demonstratorGuestName: undefined,
    demonstratorName: undefined,
    demonstratorAvatarUrl: undefined,
  });
  expect(screen.queryByText("Demo player")).toBeNull();
  await press("Choose demonstrator");
  expect(onDemonstrator).toHaveBeenCalledTimes(2);
});

it("validates the Android table start against the public event and canonical game duration", async () => {
  const onChange = vi.fn();
  await render(
    <EditorFixture
      publicGroup
      onChange={onChange}
      eventStartWall="2030-05-02T20:00"
      eventEndWall="2030-05-02T23:00"
    />,
  );
  await press("Table start");
  const first = nativePicker.open.mock.calls[0][0] as NativePickerOptions;
  expect(first).toMatchObject({ mode: "time", timeZoneName: "UTC", is24Hour: true });
  expect(first.minimumDate?.toISOString()).toBe("2030-05-02T20:00:00.000Z");
  expect(first.maximumDate?.toISOString()).toBe("2030-05-02T22:00:00.000Z");
  await act(() =>
    first.onChange?.(
      { type: "set", nativeEvent: { timestamp: Date.parse("2030-05-02T23:00Z"), utcOffset: 0 } },
      new Date("2030-05-02T23:00Z"),
    ),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("Choose a time within the allowed range.")).toBeVisible();
  await press("Table start");
  const next = nativePicker.open.mock.calls[1][0] as NativePickerOptions;
  await act(() =>
    next.onChange?.(
      { type: "set", nativeEvent: { timestamp: Date.parse("2030-05-02T21:00Z"), utcOffset: 0 } },
      new Date("2030-05-02T21:00Z"),
    ),
  );
  expect(onChange).toHaveBeenLastCalledWith({ startsWall: "2030-05-02T21:00" });
  expect(screen.queryByText("Choose a time within the allowed range.")).toBeNull();
});

it("keeps time selection disabled without a valid public event range and blocks additional games at the cap", async () => {
  const games = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    name: `Draft game ${index + 1}`,
    year: null,
    imageUrl: null,
  }));
  const onGame = vi.fn();
  await render(
    <EditorFixture
      publicGroup
      row={tableDraftFixture({ games, demonstratorUserId: "demo-one" })}
      onGame={onGame}
    />,
  );
  expect(screen.getByText("Unknown")).toBeVisible();
  expect(screen.getByRole("button", { name: "Table start" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Choose a game" })).toBeNull();
  expect(screen.getByText("Choose a game")).toBeVisible();
  expect(screen.queryByText(/BoardGameGeek player limits/)).toBeNull();
  expect(onGame).not.toHaveBeenCalled();
});
