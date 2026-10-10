import type {
  EventBookingResponse,
  EventResponse,
  EventTableResponse,
} from "@board-game-organizer/schemas";
import type { useEventTableParticipation } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { cloneElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { messages } from "../../../../../../messages/en.js";
import { EventTablePlayers } from "../EventTablePlayers";

const s = vi.hoisted(() => ({
  flow: {} as ReturnType<typeof useEventTableParticipation>,
  submit: vi.fn(),
  openJoin: vi.fn(),
  openBooking: vi.fn(),
  dismiss: vi.fn(),
  advance: vi.fn(),
  more: vi.fn(),
  eventRetry: vi.fn(),
  tableRetry: vi.fn(),
  booksRetry: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventTableParticipation: () => s.flow,
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "me" }) }));
vi.mock("@/lib/useInfiniteScroll", () => ({ useInfiniteScroll: () => vi.fn() }));
vi.mock("../EventTableInvitationPicker", () => ({
  EventTableInvitationPicker: ({
    onClose,
    occupied,
  }: {
    onClose: () => void;
    occupied: string[];
  }) => (
    <button type="button" onClick={onClose}>
      Close picker {occupied.join(",")}
    </button>
  ),
}));
const booking = (patch: Partial<EventBookingResponse> = {}): EventBookingResponse => ({
  id: "one",
  eventId: "event",
  tableId: "table",
  userId: "other",
  username: "Ada",
  avatarUrl: null,
  kind: "REQUEST",
  status: "PENDING",
  createdAt: "2030-01-01T00:00:00Z",
  updatedAt: "2030-01-01T00:00:00Z",
  ...patch,
});
function mount(actions = false) {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  );
  const ui = (
    <EventTablePlayers
      eventId="event"
      tableId="table"
      renderActions={actions ? (id) => <span>Social {id}</span> : undefined}
    />
  );
  const view = render(ui, { wrapper });
  return { ...view, refresh: () => view.rerender(cloneElement(ui)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  s.submit.mockResolvedValue(undefined);
  s.more.mockResolvedValue(undefined);
  s.advance.mockResolvedValue(undefined);
  s.flow = {
    event: { role: "admin", status: "PUBLISHED" } as EventResponse,
    table: { maxPlayers: 4, reservedCount: 2 } as EventTableResponse,
    live: [booking()],
    seats: [
      {
        index: 0,
        user: {
          id: "one",
          userId: "other",
          name: "Ada",
          avatarUrl: "https://example.test/avatar",
          secondary: "ada@example.test",
        },
        reserved: true,
      },
      { index: 1, reserved: true },
      { index: 2, reserved: false },
    ],
    loading: false,
    error: null,
    visitor: false,
    admin: true,
    open: true,
    busy: false,
    canJoin: true,
    canManage: () => true,
    canRespond: () => false,
    canLeave: () => true,
    dialog: null,
    submit: s.submit,
    openJoin: s.openJoin,
    openBooking: s.openBooking,
    dismiss: s.dismiss,
    advance: s.advance,
    hasMore: false,
    eventQuery: { refetch: s.eventRetry },
    tableQuery: { refetch: s.tableRetry },
    bookings: {
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: s.more,
      refetch: s.booksRetry,
    },
  } as unknown as ReturnType<typeof useEventTableParticipation>;
});
it("renders known, anonymous reserved and empty places without treating reservations as available", async () => {
  const user = { click: fireEvent.click };
  mount(true);
  expect(screen.getByText("Ada")).toBeTruthy();
  expect(screen.getByText("ada@example.test")).toBeTruthy();
  expect(screen.getByText("Awaiting admin approval")).toBeTruthy();
  expect(screen.getByLabelText("Pending")).toBeTruthy();
  expect(screen.getByText("Reserved place")).toBeTruthy();
  expect(screen.getByText("Social other")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Reserve a place: 3" }));
  expect(s.openJoin).toHaveBeenCalledWith(2);
  expect(s.submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Respond to participation request: Ada" }));
  expect(s.openBooking).toHaveBeenLastCalledWith(s.flow.live[0], "manage");
  await user.click(screen.getByRole("button", { name: "Remove player: Ada" }));
  expect(s.openBooking).toHaveBeenLastCalledWith(s.flow.live[0], "remove");
});
it("explains pending approval and notification before reserving, retaining failure feedback ownership", async () => {
  s.flow.dialog = { kind: "join", index: 2 };
  s.submit.mockRejectedValueOnce(new Error("network"));
  const user = { click: fireEvent.click };
  mount();
  const dialog = screen.getByRole("dialog", { name: "Reserve a place" });
  expect(within(dialog).getByText(/administrator reviews your request/)).toBeTruthy();
  expect(within(dialog).getByText(/notified when it is accepted or rejected/)).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Reserve a place" }));
  expect(s.submit).toHaveBeenCalledWith(undefined);
  expect(document.body.contains(dialog)).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(s.dismiss).toHaveBeenCalledOnce();
});
it.each(["manage", "invitation"] as const)(
  "offers Accept, Reject, Cancel and no Ban for %s",
  async (mode) => {
    s.flow.dialog = {
      kind: "booking",
      id: "one",
      status: "PENDING",
      bookingKind: mode === "manage" ? "REQUEST" : "INVITATION",
      updatedAt: s.flow.live[0].updatedAt,
      mode,
    };
    const user = { click: fireEvent.click };
    mount();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /ban/i })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));
    expect(s.submit).toHaveBeenLastCalledWith(mode === "manage" ? "approve" : "accept");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(s.submit).toHaveBeenLastCalledWith(mode === "manage" ? "reject" : "decline");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(s.dismiss).toHaveBeenCalledOnce();
  },
);
it.each(["cancel", "remove"] as const)(
  "requires destructive %s confirmation with independent cancellation",
  async (mode) => {
    s.flow.dialog = {
      kind: "booking",
      id: "one",
      status: "PENDING",
      bookingKind: "REQUEST",
      updatedAt: s.flow.live[0].updatedAt,
      mode,
    };
    const user = { click: fireEvent.click };
    mount();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/place will become available again/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", {
        name: mode === "remove" ? "Remove player" : "Leave table",
      }),
    );
    expect(s.submit).toHaveBeenCalledWith(mode);
  },
);
it("shows recipient invitation controls and safe own-name fallback", async () => {
  s.flow.live = [booking({ userId: "me", kind: "INVITATION", username: null })];
  s.flow.seats = [
    { index: 0, user: { id: "one", userId: "me", name: "", avatarUrl: null }, reserved: true },
  ];
  s.flow.canManage = () => false;
  s.flow.canRespond = () => true;
  const user = { click: fireEvent.click };
  mount();
  expect(screen.getByText("You")).toBeTruthy();
  expect(screen.getByText("Invited")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Respond to table invitation: You" }));
  expect(s.openBooking).toHaveBeenLastCalledWith(s.flow.live[0], "invitation");
  await user.click(screen.getByRole("button", { name: "Leave table: You" }));
  expect(s.openBooking).toHaveBeenLastCalledWith(s.flow.live[0], "cancel");
});
it("keeps frozen users visible and prevents leave/removal without a live authorized booking", () => {
  s.flow.live = [];
  s.flow.admin = false;
  s.flow.open = false;
  s.flow.canJoin = false;
  s.flow.seats = [
    { index: 0, user: { id: "frozen", userId: "me", name: "", avatarUrl: null }, reserved: true },
    {
      index: 1,
      user: { id: "unknown", userId: "other", name: "", avatarUrl: null },
      reserved: true,
    },
    { index: 2, reserved: false },
  ];
  mount();
  expect(screen.getByText("Username unavailable")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Leave table: You" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(screen.getByRole("button", { name: "Reserve a place: 3" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(screen.queryByRole("button", { name: /Remove player/ })).toBeNull();
});
it("disables busy, forbidden-leave, full-table and next-page controls", () => {
  s.flow.busy = true;
  s.flow.canJoin = false;
  s.flow.canLeave = () => false;
  s.flow.canRespond = () => true;
  s.flow.live[0].userId = "me";
  s.flow.seats[0].user = { id: "one", userId: "me", name: "Ada", avatarUrl: null };
  s.flow.table = { ...s.flow.table, reservedCount: 4 } as EventTableResponse;
  s.flow.hasMore = true;
  s.flow.bookings.isFetchingNextPage = true;
  mount();
  for (const name of [
    "Respond to participation request: Ada",
    "Respond to table invitation: Ada",
    "Leave table: Ada",
    "Invite organization members",
    "Load more",
  ])
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
});
it("retains cached players on failure and retries only permitted resources", async () => {
  s.flow.error = new Error("network");
  const user = { click: fireEvent.click };
  const view = mount();
  expect(screen.getByText("Ada")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.eventRetry).toHaveBeenCalledOnce();
  expect(s.tableRetry).toHaveBeenCalledOnce();
  expect(s.booksRetry).toHaveBeenCalledOnce();
  s.flow.visitor = true;
  view.refresh();
  expect(screen.queryByText("Ada")).toBeNull();
  expect(screen.getByText(/Only confirmed organization members/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.booksRetry).toHaveBeenCalledOnce();
  s.flow.visitor = false;
  s.flow.loading = true;
  view.refresh();
  expect(screen.queryByText("Ada")).toBeNull();
});
it("opens the reused organization-member picker and restores the players view on Back", async () => {
  const user = { click: fireEvent.click };
  mount();
  await user.click(screen.getByRole("button", { name: "Invite organization members" }));
  await user.click(screen.getByRole("button", { name: "Close picker other" }));
  expect(screen.getByText("Ada")).toBeTruthy();
});
it("pages on demand and lets explicit retry recover a failed page without automatic loops", async () => {
  s.flow.hasMore = true;
  const user = { click: fireEvent.click };
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(s.advance).toHaveBeenCalledOnce();
  s.flow.bookings.isFetchNextPageError = true;
  s.more.mockRejectedValueOnce(new Error("network"));
  view.refresh();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.more).toHaveBeenCalledOnce();
});
