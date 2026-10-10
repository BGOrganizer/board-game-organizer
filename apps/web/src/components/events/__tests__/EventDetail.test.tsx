import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { renderWithI18n } from "@/test-utils";
import { EventDetail } from "../EventDetail";

const mocks = vi.hoisted(() => ({
  denied: false,
  open: true,
  busy: false,
  pending: false,
  data: undefined as EventResponse | undefined,
  items: [] as EventTableResponse[],
  tablePending: false,
  tableError: false,
  next: false,
  nextPending: false,
  nextError: false,
  refetch: vi.fn(),
  tableRefetch: vi.fn(),
  fetchNext: vi.fn(),
  cancel: vi.fn(),
  replace: vi.fn(),
  tableOptions: vi.fn(),
  scrollOptions: vi.fn(),
  confirm: undefined as ComponentProps<typeof ContactConfirmDialog> | undefined,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "admin" }),
}));
vi.mock("@/lib/useInfiniteScroll", () => ({
  useInfiniteScroll: (o: unknown) => {
    mocks.scrollOptions(o);
    return null;
  },
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  communityAccessDenied: () => mocks.denied,
  useEvent: () => ({
    data: mocks.data,
    isPending: mocks.pending,
    error: null,
    refetch: mocks.refetch,
  }),
  useEventWindow: () => mocks.open,
  useEventActions: () => ({ busy: mocks.busy, cancel: { mutateAsync: mocks.cancel } }),
  useEventTables: (o: unknown) => {
    mocks.tableOptions(o);
    return {
      items: mocks.items,
      isPending: mocks.tablePending,
      isError: mocks.tableError,
      hasNextPage: mocks.next,
      isFetchingNextPage: mocks.nextPending,
      isFetchNextPageError: mocks.nextError,
      refetch: mocks.tableRefetch,
      fetchNextPage: mocks.fetchNext,
    };
  },
}));
vi.mock("@/components/common/ui/ContactConfirmDialog", () => ({
  ContactConfirmDialog: (props: ComponentProps<typeof ContactConfirmDialog>) => {
    mocks.confirm = props;
    return (
      <div role="dialog" aria-label={props.title}>
        <p>{props.description}</p>
        <button type="button" disabled={props.busy} onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" disabled={props.busy} onClick={props.actions[0].onPress}>
          Confirm cancellation
        </button>
      </div>
    );
  },
}));

const event: EventResponse = {
  id: "event",
  organizationId: "org",
  adminUserId: "admin",
  name: "Games evening",
  organizationName: "Game club",
  logo: "",
  organizationApproved: true,
  tableCount: 1,
  confirmedParticipantCount: 3,
  role: "admin",
  canModify: true,
  canPublish: true,
  status: "PUBLISHED",
  location: {
    id: "venue",
    name: "Club venue",
    address: "Via Roma 1, Italia",
    latitude: 41,
    longitude: 12,
  },
  timeZone: "UTC",
  startsAt: "2030-06-12T14:00:00.000Z",
  endsAt: "2030-06-12T18:00:00.000Z",
  bookingClosesAt: "2030-06-11T14:00:00.000Z",
  version: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
const table: EventTableResponse = {
  id: "table",
  eventId: "event",
  name: "Azul table",
  gameId: 1,
  gameName: "Azul",
  image: null,
  startsAt: "2030-06-12T14:01:00.000Z",
  endsAt: "2030-06-12T17:59:00.000Z",
  minPlayers: 2,
  maxPlayers: 4,
  openSkill: true,
  status: "PLANNING",
  confirmedCount: 2,
  reservedCount: 3,
  myBooking: null,
  canBook: true,
  demonstrator: { userId: "demo", username: "Demo", avatarUrl: null },
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
const tablesTab = () => fireEvent.click(screen.getByRole("tab", { name: "Tables" }));
const detailsTab = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks, {
    denied: false,
    open: true,
    busy: false,
    pending: false,
    data: event,
    items: [],
    tablePending: false,
    tableError: false,
    next: false,
    nextPending: false,
    nextError: false,
    confirm: undefined,
  });
  mocks.cancel.mockResolvedValue(event);
});

it("defaults to details, reserves table fetching for its tab and keeps edit outside both panels", () => {
  const { container } = renderWithI18n(<EventDetail eventId="event" />);
  expect(mocks.tableOptions.mock.lastCall?.[0].enabled).toBe(false);
  expect(screen.queryByText("Game club")).toBeNull();
  expect(screen.getByText("3")).toBeTruthy();
  expect(container.querySelector(".lucide-layout-grid")).toBeNull();
  const cancel = screen.getByRole("button", { name: "Cancel event" });
  expect(cancel.closest("header")).toBeTruthy();
  expect(cancel.textContent).toBe("");
  expect(screen.getByRole("link", { name: "Edit event" }).getAttribute("href")).toBe(
    "/events/event/edit",
  );
  tablesTab();
  expect(mocks.tableOptions.mock.lastCall?.[0].enabled).toBe(true);
  expect(screen.getByText("No tables found")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Edit event" }).closest('[role="tabpanel"]')).toBeNull();
  detailsTab();
  expect(screen.getByRole("link", { name: "Edit event" })).toBeTruthy();
});
it.each(["PLANNING", "CREATED", "TERMINATED", "CANCELLED"] as const)(
  "shares read-only draft-card content for %s without row edit/delete",
  (status) => {
    mocks.items = [{ ...table, status }];
    renderWithI18n(<EventDetail eventId="event" />);
    tablesTab();
    expect(screen.getByRole("link", { name: "Open table: Azul table" }).getAttribute("href")).toBe(
      "/events/event/tables/table",
    );
    expect(screen.getByText("Azul")).toBeTruthy();
    expect(screen.getByText("2–4")).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Global ratings enabled" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Edit table|Remove table/ })).toBeNull();
    expect(screen.getByText("2/4 confirmed players")).toBeTruthy();
  },
);
it("keeps table failures observable, retries them and loads/retries subsequent pages", () => {
  mocks.tableError = true;
  mocks.next = true;
  mocks.nextError = true;
  renderWithI18n(<EventDetail eventId="event" />);
  tablesTab();
  expect(screen.queryByText("No tables found")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Could not load tables. Retry" }));
  expect(mocks.tableRefetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mocks.fetchNext).toHaveBeenCalledOnce();
  mocks.scrollOptions.mock.lastCall?.[0].fetchNextPage();
  expect(mocks.fetchNext).toHaveBeenCalledTimes(2);
  mocks.tableError = false;
  mocks.nextError = false;
  mocks.nextPending = true;
  detailsTab();
  tablesTab();
  expect(screen.getByRole("button", { name: "Load more" }).hasAttribute("disabled")).toBe(true);
  mocks.nextPending = false;
  detailsTab();
  tablesTab();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(mocks.fetchNext).toHaveBeenCalledTimes(3);
});
it("uses initial skeletons without replacing cached table rows", () => {
  mocks.tablePending = true;
  renderWithI18n(<EventDetail eventId="event" />);
  tablesTab();
  expect(screen.queryByText("No tables found")).toBeNull();
  mocks.items = [table];
  detailsTab();
  tablesTab();
  expect(screen.getByText("Azul table")).toBeTruthy();
});
it.each(["closed", "readonly", "draft"])(
  "respects deadline and server modification rights: %s",
  (mode) => {
    mocks.open = mode === "readonly";
    mocks.data = {
      ...event,
      canModify: mode !== "readonly",
      status: mode === "draft" ? "DRAFT" : "PUBLISHED",
    };
    renderWithI18n(<EventDetail eventId="event" />);
    expect(screen.queryByRole("link", { name: "Edit event" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel event" })).toBeNull();
    expect(Boolean(screen.queryByText("Bookings are closed. Results can still be recorded."))).toBe(
      mode === "closed",
    );
  },
);
it("shows loading, retryable detail failure and hides unauthorized cached details", () => {
  mocks.data = undefined;
  mocks.pending = true;
  renderWithI18n(<EventDetail eventId="event" />);
  expect(screen.queryByRole("alert")).toBeNull();
});
it.each([false, true])("retries a missing/unauthorized detail, denied=%s", (denied) => {
  mocks.denied = denied;
  mocks.data = denied ? event : undefined;
  renderWithI18n(<EventDetail eventId="event" />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Games evening")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
});
it("requires confirmation, permits dismissal and navigates only after successful cancellation", async () => {
  renderWithI18n(<EventDetail eventId="event" />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
  expect(mocks.cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/events"));
  expect(mocks.cancel).toHaveBeenCalledWith("event");
});
it("keeps failure confirmation open, blocks repeated submission/dismissal and rechecks cutoff", async () => {
  mocks.cancel.mockRejectedValue(new Error("network"));
  renderWithI18n(<EventDetail eventId="event" />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
  await act(async () => {
    mocks.confirm?.actions[0].onPress();
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.busy = true;
  tablesTab();
  act(() => {
    mocks.confirm?.onCancel();
    mocks.confirm?.actions[0].onPress();
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mocks.cancel).toHaveBeenCalledOnce();
  mocks.busy = false;
  mocks.open = false;
  detailsTab();
  act(() => mocks.confirm?.actions[0].onPress());
  expect(mocks.cancel).toHaveBeenCalledOnce();
});
