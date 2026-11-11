import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { NotificationChangesAlert } from "../NotificationChangesAlert";

// Unit tests exercise actual Alert/ListBox controls, not virtualized geometry in JSDOM.
vi.mock("@heroui/react/rac", async (original) => ({
  ...(await original<typeof import("@heroui/react/rac")>()),
  Virtualizer: ({ children }: { children: ReactNode }) => children,
}));
type Model = ReturnType<typeof useNotificationChanges>;
const at = "2026-01-01T00:00:00.000Z";
function row(
  messageCode: NotificationChangeRow["messageCode"],
  requiresResponse = false,
  id = "111111111111111111111111",
): NotificationChangeRow {
  const ref = { notificationId: id, effectiveAt: at };
  return { ...ref, messageCode, requiresResponse, readReference: ref };
}
function model(overrides: Partial<Model> = {}): Model {
  return {
    changes: [row("date"), row("invitation", true, "222222222222222222222222")],
    tabCounts: { details: 1, members: 0, tables: 0, participants: 1 },
    hasNextPage: false,
    fetchNextPage: vi.fn(async () => {}),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(async () => ({}) as never),
    markDisplayedAsRead: vi.fn(),
    isReading: false,
    readError: null,
    ...overrides,
  };
}

describe("NotificationChangesAlert explicit selected-tab information reads", () => {
  it("renders no empty-success Alert and a skeleton only when initially uncached", () => {
    const q = renderWithI18n(<NotificationChangesAlert model={model({ changes: [] })} />);
    expect(q.container.firstChild).toBeNull();
    q.rerender(<NotificationChangesAlert model={model({ changes: [], isPending: true })} />);
    expect(screen.queryByTestId("notification-changes-alert")).toBeNull();
    expect(q.container.firstChild).not.toBeNull();
  });
  it("lists information and protected invitations, with exactly one compact warning read action", async () => {
    const m = model();
    renderWithI18n(<NotificationChangesAlert model={m} />);
    expect(screen.getByText("Date updated")).toBeTruthy();
    expect(screen.getByText("Invitation awaiting a response")).toBeTruthy();
    expect(screen.getByText("Invitations remain unread until you respond.")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Unread updates" })).toHaveLength(1);
    const read = screen.getByRole("button", { name: "Mark displayed changes as read" });
    expect(read.className).toContain("button--ghost");
    expect(read.className).toContain("min-h-11");
    expect(read.querySelector(".text-warning")).toBeTruthy();
    expect(read.querySelector("svg")?.classList.contains("size-4")).toBe(true);
    expect(read.className).not.toContain("danger");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(m.markDisplayedAsRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Date updated"));
    expect(m.markDisplayedAsRead).not.toHaveBeenCalled();
    fireEvent.click(read);
    await waitFor(() => expect(m.markDisplayedAsRead).toHaveBeenCalledTimes(1));
  });
  it("cannot consume an invitation-only selection or resubmit while pending", () => {
    const m = model({ changes: [row("invitation", true)] });
    const q = renderWithI18n(<NotificationChangesAlert model={m} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark displayed changes as read" }));
    expect(m.markDisplayedAsRead).not.toHaveBeenCalled();
    const pending = model({ isReading: true, isPending: true });
    q.rerender(<NotificationChangesAlert model={pending} />);
    expect(screen.getByText("Date updated")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark displayed changes as read" }));
    expect(pending.markDisplayedAsRead).not.toHaveBeenCalled();
  });
  it("uses truthful categories/current labels and never calls a resolved invitation pending", () => {
    const codes: NotificationChangeRow["messageCode"][] = [
      "date",
      "dates",
      "location",
      "locations",
      "game",
      "games",
      "table_settings",
      "tables",
      "group_info",
      "member_update",
      "participation",
      "event_state",
      "invitation",
      "proposal",
      "review",
      "information",
    ];
    const m = model({
      changes: codes.map((c, i) => ({
        ...row(c, false, (i + 1).toString(16).padStart(24, "0")),
        ...(c === "group_info" ? { currentLabel: "Current club" } : {}),
      })),
    });
    renderWithI18n(<NotificationChangesAlert model={m} />);
    for (const text of [
      "Date options changed",
      "Location updated",
      "Location options changed",
      "Game updated",
      "Games changed",
      "Table settings updated",
      "Tables changed",
      "Group information updated: Current club",
      "Membership updated",
      "Participation updated",
      "Event updated",
      "Invitation updated",
      "Proposal updated",
      "Review updated",
      "Information updated",
    ])
      expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText("Invitation awaiting a response")).toBeNull();
    expect(m.markDisplayedAsRead).not.toHaveBeenCalled();
  });
  it("keeps cached rows and observable errors; retries a failed next page without resetting the feed", async () => {
    const first = model({ isError: true });
    const q = renderWithI18n(<NotificationChangesAlert model={first} />);
    expect(screen.getByText("Date updated")).toBeTruthy();
    expect(screen.getByText("Could not load changes. Try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(first.refetch).toHaveBeenCalledTimes(1));
    const next = model({ isError: true, isFetchNextPageError: true });
    q.rerender(<NotificationChangesAlert model={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(next.fetchNextPage).toHaveBeenCalledTimes(1));
    expect(next.refetch).not.toHaveBeenCalled();
    q.rerender(<NotificationChangesAlert model={model({ readError: new Error("failure") })} />);
    expect(screen.getByText("Could not mark changes as read. Try again.")).toBeTruthy();
  });
  it("supports bounded progressive paging and does not replace usable rows while fetching", async () => {
    const m = model({ hasNextPage: true });
    const q = renderWithI18n(<NotificationChangesAlert model={m} />);
    fireEvent.click(screen.getByRole("button", { name: "More changes" }));
    await waitFor(() => expect(m.fetchNextPage).toHaveBeenCalledTimes(1));
    const waiting = model({ hasNextPage: true, isFetchingNextPage: true });
    q.rerender(<NotificationChangesAlert model={waiting} />);
    expect(screen.getByText("Date updated")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More changes" })).toBeNull();
    expect(waiting.fetchNextPage).not.toHaveBeenCalled();
  });
});

it("renders a descriptive planning warning without an optional current label", () => {
  renderWithI18n(
    <NotificationChangesAlert model={model({ changes: [row("event_agreement_blocked")] })} />,
  );
  expect(
    screen.getByText("Event planning needs review. Check participant availability and votes."),
  ).toBeTruthy();
  expect(screen.getByRole("listbox").style.height).toBe("56px");
});
