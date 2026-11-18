import { type EventRecordDraft, useEventRecordForm } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, within } from "@testing-library/react-native";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventPlanningSettings } from "../EventPlanningSettings";
import { eventDraftFixture } from "./eventWizardFixtures";

const options = {
  apiUrl: "https://planning-settings-native.test",
  userId: "manager",
  enabled: false,
  getToken: async () => "planning-settings-fixture",
};
let client: QueryClient;
const network = vi.fn(() => {
  throw new Error("Editing a local planning draft cannot publish or fetch resources");
});
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  client.clear();
  vi.unstubAllGlobals();
});

function Settings({ initial, busy }: { initial: EventRecordDraft; busy: boolean }) {
  const form = useEventRecordForm(options, undefined, undefined, initial);
  return (
    <>
      <EventPlanningSettings form={form} busy={busy} />
      <Text accessibilityLabel="Planning draft">{JSON.stringify(form.draft)}</Text>
    </>
  );
}
function fixture(change: Partial<EventRecordDraft> = {}, busy = false) {
  const initial = eventDraftFixture({ groupId: null, ...change });
  const content = (nextBusy: boolean) => (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Settings initial={initial} busy={nextBusy} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
  return { content, view: render(content(busy)) };
}
function draft() {
  const text = screen.getByLabelText("Planning draft").props.children;
  if (typeof text !== "string") throw new Error("Missing actual shared form draft");
  return JSON.parse(text) as EventRecordDraft;
}
const radio = (name: string) => screen.getByRole("radio", { name });
const press = (name: string) => userEvent.setup().press(radio(name));

it("selects the established assisted/player defaults without modifying or publishing the draft", async () => {
  const f = fixture({ planningMode: undefined, playerPreference: undefined });
  await f.view;
  expect(radio("Assisted")).toBeChecked();
  expect(radio("Players")).toBeChecked();
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(draft().planningMode).toBeUndefined();
  expect(draft().playerPreference).toBeUndefined();
});

it("requires explicit confirmation when leaving manual mode and preserves it on cancellation", async () => {
  const f = fixture({ planningMode: "MANUAL" });
  await f.view;
  await press("Assisted");
  const dialog = screen.getByTestId("confirmation-dialog");
  expect(within(dialog).getByText(/Assistance recalculates the allocation/)).toBeVisible();
  await userEvent.setup().press(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(radio("Manual")).toBeChecked();
  expect(draft().planningMode).toBe("MANUAL");
  await press("Assisted");
  await userEvent
    .setup()
    .press(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: "Assisted" }),
    );
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(radio("Assisted")).toBeChecked();
  expect(draft().planningMode).toBe("ASSISTED");
});

it("switches from assisted to manual directly without making any roster changes", async () => {
  const f = fixture();
  await f.view;
  const tables = draft().tables;
  await press("Manual");
  expect(draft()).toMatchObject({ planningMode: "MANUAL", tables });
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
});

it("sets and clears the best-player reduction policy with the actual preference radio group", async () => {
  const f = fixture({ planningMode: "MANUAL" });
  await f.view;
  await press("BGG Best");
  expect(radio("BGG Best")).toBeChecked();
  expect(draft()).toMatchObject({ playerPreference: "BEST", allowBestReduction: true });
  await press("Players");
  expect(radio("Players")).toBeChecked();
  expect(draft()).toMatchObject({ playerPreference: "MORE_PLAYERS", allowBestReduction: false });
});

it("blocks settings and an already open confirmation while busy, then permits cancellation", async () => {
  const f = fixture({ planningMode: "MANUAL" });
  const view = await f.view;
  await press("Assisted");
  await view.rerender(f.content(true));
  const dialog = within(screen.getByTestId("confirmation-dialog"));
  expect(dialog.getByRole("button", { name: "Assisted" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await userEvent.setup().press(dialog.getByRole("button", { name: "Assisted" }));
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
  await view.rerender(f.content(false));
  await userEvent
    .setup()
    .press(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: "Cancel" }),
    );
  await view.rerender(f.content(true));
  for (const name of ["Manual", "Assisted", "Players", "BGG Best"])
    expect(radio(name)).toBeDisabled();
  await press("BGG Best");
  expect(draft()).toMatchObject({ planningMode: "MANUAL", playerPreference: "MORE_PLAYERS" });
});
