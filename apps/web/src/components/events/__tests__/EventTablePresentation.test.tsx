import type {
  EventResponse,
  EventTableResponse,
  MatchDetailResponse,
} from "@board-game-organizer/schemas";
import type { useEventTableContext } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
      yearPublished: 2017,
      average: 7.8,
      rank: 85,
      image: "https://example.test/cover",
      minPlayers: 2,
      maxPlayers: 4,
      confirmedCount: 1,
      reservedCount: 3,
      demonstrator: { userId: "demo", name: "Demo Player", username: "demo_nick", avatarUrl: null },
    } as EventTableResponse,
    open: true,
    eventQuery: { error: null, refetch: s.eventRetry },
    tableQuery: { error: null, refetch: s.tableRetry },
  } as unknown as ReturnType<typeof useEventTableContext>;
});
it("keeps an icon-bearing Table name label, the name below, optional blue Rating and an actual-icon legend", async () => {
  const v = mount(<EventTableHeading name="A long table name" ratingsEnabled />);
  expect(screen.getByText("Table name")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "A long table name" })).toBeTruthy();
  expect(screen.getByText("Rating").closest("span")?.className).toContain("chip");
  fireEvent.click(screen.getByRole("button", { name: "Table name help" }));
  const legend = await screen.findByRole("dialog");
  expect(within(legend).getByText("Confirmed players.")).toBeTruthy();
  expect(within(legend).getByText("Maximum seats here; free places in Seats.")).toBeTruthy();
  expect(within(legend).getByText("Reserved places, including pending requests.")).toBeTruthy();
  for (const icon of ["users-round", "armchair", "lock-keyhole"])
    expect(legend.querySelector(`.lucide-${icon}`)).toBeTruthy();
  v.refresh(<EventTableHeading name="A long table name" ratingsEnabled={false} />);
  expect(screen.queryByText("Rating")).toBeNull();
});
it("shows authorized timezone, cover/game, counts and full demonstrator identity without repeating the venue; cached fields survive errors", () => {
  const v = mount(<EventTableOverview eventId="event" tableId="table" />);
  expect(screen.getByText("Azul")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Average: 7.80" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Rank: 85" })).toBeTruthy();
  expect(screen.queryByText("Club")).toBeNull();
  expect(screen.queryByText("Verified address")).toBeNull();
  expect(screen.getByRole("heading", { name: "Date and time" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Location" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Demonstrator" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Board games" })).toBeTruthy();
  for (const label of ["Date and time help", "Table game help", "Demonstrator help"])
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  expect(screen.getByText("confirmed players:").parentElement?.textContent).toBe(
    "confirmed players: 1",
  );
  expect(screen.getByText("Maximum players:").parentElement?.textContent).toBe(
    "Maximum players: 4",
  );
  expect(screen.getByText("reserved places:").parentElement?.textContent).toBe(
    "reserved places: 3",
  );
  expect(screen.getByText("Demo Player")).toBeTruthy();
  expect(screen.getByText("demo_nick")).toBeTruthy();
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
  expect(screen.getAllByText("Username unavailable")).toHaveLength(2);
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
  expect(screen.queryByText("Frozen venue")).toBeNull();
  expect(screen.queryByText("Historic address")).toBeNull();
  expect(screen.getByText("confirmed players:").parentElement?.textContent).toBe(
    "confirmed players: 1",
  );
  expect(screen.getByText("Maximum players:").parentElement?.textContent).toBe(
    "Maximum players: 4",
  );
  expect(screen.getByText("reserved places:").parentElement?.textContent).toBe(
    "reserved places: 1",
  );
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
