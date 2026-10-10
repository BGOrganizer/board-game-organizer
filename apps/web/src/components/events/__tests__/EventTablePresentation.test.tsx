import type {
  EventResponse,
  EventTableResponse,
  MatchDetailResponse,
} from "@board-game-organizer/schemas";
import type { useEventTableContext } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { messages } from "../../../../../../messages/en.js";
import { EventTableEditAction } from "../EventTableEditAction";
import { EventTableHeading } from "../EventTableHeading";
import { EventTableOverview } from "../EventTableOverview";

const s = vi.hoisted(() => ({
  ctx: {} as ReturnType<typeof useEventTableContext>,
  eventRetry: vi.fn(),
  tableRetry: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventTableContext: () => s.ctx,
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "me" }) }));
function mount(ui: ReactElement) {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  );
  const v = render(ui, { wrapper });
  return { ...v, refresh: (next = ui) => v.rerender(cloneElement(next)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  s.ctx = {
    event: {
      role: "admin",
      canModify: true,
      timeZone: "Europe/Rome",
      location: { name: "Club", address: "Verified address" },
    } as EventResponse,
    table: {
      status: "PLANNING",
      name: "Azul table",
      startsAt: "2030-06-12T15:00:00Z",
      endsAt: "2030-06-12T16:00:00Z",
      gameName: "Azul",
      image: "https://example.test/cover",
      minPlayers: 2,
      maxPlayers: 4,
      confirmedCount: 1,
      reservedCount: 3,
      demonstrator: { userId: "demo", username: "Demo", avatarUrl: null },
    } as EventTableResponse,
    open: true,
    eventQuery: { error: null, refetch: s.eventRetry },
    tableQuery: { error: null, refetch: s.tableRetry },
  } as unknown as ReturnType<typeof useEventTableContext>;
});
it("keeps an icon-bearing Table name label, the name below, optional blue Rating and no legend", () => {
  const v = mount(<EventTableHeading name="A long table name" ratingsEnabled />);
  expect(screen.getByText("Table name")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "A long table name" })).toBeTruthy();
  expect(screen.getByText("Rating").closest("span")?.className).toContain("chip");
  expect(screen.queryByRole("button")).toBeNull();
  v.refresh(<EventTableHeading name="A long table name" ratingsEnabled={false} />);
  expect(screen.queryByText("Rating")).toBeNull();
});
it("shows authorized timezone, cover/game, location, counts and demonstrator while cached fields survive errors", () => {
  const v = mount(<EventTableOverview eventId="event" tableId="table" />);
  expect(screen.getByText("Azul")).toBeTruthy();
  expect(screen.getByText("Club")).toBeTruthy();
  expect(screen.getByText("Verified address")).toBeTruthy();
  expect(screen.getByText("2–4")).toBeTruthy();
  expect(screen.getByText(/1\/4 confirmed players.*3 reserved places/)).toBeTruthy();
  expect(screen.getByText("Demonstrator: Demo")).toBeTruthy();
  expect(screen.getByText(/5:00 PM/)).toBeTruthy();
  s.ctx.eventQuery.error = new Error("network");
  v.refresh();
  expect(screen.getByText("Azul")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.eventRetry).toHaveBeenCalledOnce();
  expect(s.tableRetry).toHaveBeenCalledOnce();
  s.ctx.eventQuery.error = null;
  s.ctx.tableQuery.error = new Error("network");
  s.ctx.open = false;
  s.ctx.table = {
    ...s.ctx.table,
    image: null,
    demonstrator: { userId: "demo", username: null, avatarUrl: null },
  } as EventTableResponse;
  v.refresh();
  expect(screen.getByText("Demonstrator: Username unavailable")).toBeTruthy();
  expect(screen.getByText("Bookings are closed. Results can still be recorded.")).toBeTruthy();
});
it("uses partial skeletons, preserving frozen match fields and never inventing a confirmed administrator seat", () => {
  s.ctx.event = undefined;
  s.ctx.table = undefined;
  s.ctx.tableQuery.error = new Error("denied");
  const match = {
    match: {
      status: "CREATED",
      eventTable: { endsAt: "2030-06-12T16:00:00Z" },
      selectedDate: "2030-06-12T15:00:00Z",
      selectedGameId: 1,
      minPlayers: 2,
      maxPlayers: 4,
      locations: [{ name: "Frozen venue", address: "Historic address" }],
    },
    administrator: { id: "owner" },
    invitedPlayers: [
      {
        id: "player",
        name: "Player",
        email: "player@example.test",
        avatarUrl: null,
        invitation: { status: "ACCEPTED" },
      },
    ],
    games: [{ id: 1, name: "Frozen game", thumbnail: "https://example.test/frozen" }],
  } as MatchDetailResponse;
  const v = mount(<EventTableOverview eventId="event" tableId="table" match={match} />);
  expect(screen.getByText("Frozen game")).toBeTruthy();
  expect(screen.getByText("Frozen venue")).toBeTruthy();
  expect(screen.getByText(/1\/4 confirmed players.*1 reserved places/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.tableRetry).not.toHaveBeenCalled();
  v.refresh(
    <EventTableOverview
      eventId="event"
      tableId="table"
      match={{
        ...match,
        match: {
          ...match.match,
          status: "PLANNING",
          eventTable: undefined,
          locations: [],
          selectedDate: undefined,
          selectedGameId: undefined,
        },
      }}
    />,
  );
  expect(screen.queryByText("Frozen game")).toBeNull();
  expect(screen.queryByText(/confirmed players/)).toBeNull();
  v.refresh(<EventTableOverview eventId="event" tableId="table" />);
  expect(screen.queryByText("2–4")).toBeNull();
});
it.each(["member", "visitor"] as const)("never exposes the edit FAB to %s", (role) => {
  s.ctx.event = { ...s.ctx.event, role } as EventResponse;
  const v = mount(<EventTableEditAction eventId="event" tableId="table" />);
  expect(v.container.textContent).toBe("");
});
it("links only the owner to the contextual table editor and disables it for deadline, denied modification or fixed table", () => {
  const v = mount(<EventTableEditAction eventId="event/a" tableId="table/b" />);
  expect(screen.getByRole("link", { name: "Edit table" }).getAttribute("href")).toBe(
    "/events/event%2Fa/tables/table%2Fb/edit",
  );
  s.ctx.event = { ...s.ctx.event, canModify: false } as EventResponse;
  v.refresh();
  expect(screen.getByRole("link", { name: "Edit table" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
  s.ctx.event.canModify = true;
  s.ctx.open = false;
  v.refresh();
  expect(screen.getByRole("link", { name: "Edit table" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
  s.ctx.open = true;
  s.ctx.table = { ...s.ctx.table, status: "CREATED" } as EventTableResponse;
  v.refresh();
  expect(screen.getByRole("link", { name: "Edit table" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
  s.ctx.table = undefined;
  v.refresh();
  expect(v.container.textContent).toBe("");
  s.ctx.event = undefined;
  v.refresh();
  expect(v.container.textContent).toBe("");
});
