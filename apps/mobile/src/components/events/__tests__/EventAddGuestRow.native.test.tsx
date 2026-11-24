import { useTableGuestActions } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Keyboard, type KeyboardEvent } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventAddGuestRow } from "../EventAddGuestRow";

const options = {
  apiUrl: "https://event-guests.test",
  userId: "manager",
  getToken: async () => "manager-token",
};
const hidden = { includeHiddenElements: true };
const onSaved = vi.fn();
function GuestRow({ disabled }: { disabled: boolean }) {
  const guest = useTableGuestActions(options, "event", "table");
  return <EventAddGuestRow guest={guest} disabled={disabled} onSaved={onSaved} />;
}

function setup(disabled: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const fixture = (blocked: boolean) => (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <GuestRow disabled={blocked} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
  return { client, fixture, ui: render(fixture(disabled)) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onSaved.mockClear();
});

it("validates the optional email after blur and submits the corrected details via the keyboard", async () => {
  const removed = vi.fn();
  const keyboardListeners = new Set<(event: KeyboardEvent) => void>();
  const addListener = Keyboard.addListener.bind(Keyboard);
  vi.spyOn(Keyboard, "addListener").mockImplementation((event, listener) => {
    const subscription = addListener(event, listener);
    if (event === "keyboardDidHide") {
      keyboardListeners.add(listener);
      const removeNative = subscription.remove.bind(subscription);
      subscription.remove = () => {
        keyboardListeners.delete(listener);
        removed();
        removeNative();
      };
    }
    return subscription;
  });
  const transport = vi.fn(async () => Response.json({ id: "registered-guest", eventVersion: 2 }));
  vi.stubGlobal("fetch", transport);
  const { fixture, ui } = setup(false);
  const view = await ui;
  await fireEvent.press(screen.getByTestId("table-guest-open"));
  const name = await screen.findByTestId("table-guest-username", hidden);
  const email = screen.getByTestId("table-guest-email", hidden);
  await fireEvent(name, "focus", { nativeEvent: { target: 17 } });
  await fireEvent.changeText(name, " Invitee ");
  await fireEvent(email, "focus", { nativeEvent: { target: 18 } });
  await fireEvent(name, "blur", { nativeEvent: { target: 17 } });
  await fireEvent.changeText(email, "malformed");
  expect(screen.queryByText("Enter a valid email address.", hidden)).toBeNull();
  await fireEvent(email, "blur", { nativeEvent: { target: 18 } });
  expect(await screen.findByText("Enter a valid email address.", hidden)).toBeOnTheScreen();
  expect(screen.getByTestId("table-guest-submit", hidden)).toBeDisabled();
  await act(async () => {
    for (const listener of keyboardListeners)
      listener({
        duration: 250,
        easing: "keyboard",
        endCoordinates: { screenX: 0, screenY: 844, height: 0, width: 390 },
      });
  });
  await fireEvent(email, "submitEditing");
  expect(transport).not.toHaveBeenCalled();

  await view.rerender(fixture(true));
  await fireEvent.changeText(email, " invitee@example.test ");
  expect(screen.getByTestId("table-guest-submit", hidden)).toBeDisabled();
  await fireEvent(email, "submitEditing");
  expect(transport).not.toHaveBeenCalled();

  await view.rerender(fixture(false));
  await fireEvent.changeText(email, " invitee@example.test ");
  await fireEvent(email, "submitEditing");
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(transport).toHaveBeenCalledWith(
    "https://event-guests.test/api/events/event/tables/table/guests",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"email":"invitee@example.test"'),
    }),
  );
  expect(screen.queryByTestId("table-guest-username", hidden)).toBeNull();
  expect(removed).toHaveBeenCalled();
});
