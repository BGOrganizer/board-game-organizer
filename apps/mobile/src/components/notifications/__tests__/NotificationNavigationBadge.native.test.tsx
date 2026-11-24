import type { NotificationAttentionSummary } from "@board-game-organizer/schemas";
import { notificationListKey } from "@board-game-organizer/shared";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  listFixture,
  listOptions,
  MainListFixture,
} from "../../common/ui/__tests__/mainListFixture";
import { NotificationNavigationBadge } from "../NotificationNavigationBadge";

it("follows the active language and displays only the current section's cached attention dot", async () => {
  const zero = {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  };
  const seed = (locale: "en" | "it", attention: NotificationAttentionSummary) =>
    listFixture.client?.setQueryData(notificationListKey({ ...listOptions(), locale }, 3), {
      pages: [{ notifications: [], unreadCount: 0, nextCursor: null, attention }],
      pageParams: [undefined],
    });
  const badge = (locale: "en" | "it") => (
    <MainListFixture>
      <NativeTestProviders locale={locale}>
        <NotificationNavigationBadge section="events" />
      </NativeTestProviders>
    </MainListFixture>
  );

  seed("en", { ...zero, groups: 2 });
  seed("it", { ...zero, events: 2 });
  const view = await render(badge("en"));
  expect(screen.queryByLabelText("Needs attention")).toBeNull();

  await view.rerender(badge("it"));
  expect(screen.getByLabelText("Da verificare")).toBeVisible();
  await act(() => seed("it", { ...zero, groups: 2 }));
  await waitFor(() => expect(screen.queryByLabelText("Da verificare")).toBeNull());
  expect(listFixture.reads).toEqual([]);
});
