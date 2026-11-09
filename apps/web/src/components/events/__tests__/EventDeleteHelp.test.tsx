import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDeleteAction } from "../EventDeleteAction";

const m = vi.hoisted(() => ({
  busy: false,
  verifying: false,
  remove: vi.fn(),
  removeTable: vi.fn(),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventRecordActions: () => ({
    busy: m.busy,
    remove: { mutate: m.remove },
    removeTable: { mutate: m.removeTable },
  }),
  useClientMutationDraft: () => (m.verifying ? { phase: "verifying" } : null),
}));
const event = { ...plannedEvent, canManage: true, canEdit: true, tableCount: 2 };
const table = { ...plannedTable, canManage: true };
beforeEach(() => {
  m.busy = false;
  m.verifying = false;
  vi.clearAllMocks();
});
it.each([
  ["last", "An event must keep at least one table. Delete the event instead."],
  ["deadline", "Deletion is unavailable after the registration deadline."],
  ["unverified", "Wait until current event and table data are verified."],
  ["busy", "Another event action is in progress."],
  ["verifying", "Checking whether the previous deletion was saved. Do not submit it again."],
  ["cutoff", "Deletion is unavailable after the registration deadline."],
] as const)(
  "explains %s immediately before disabled deletion without deciding anything",
  async (reason, message) => {
    m.busy = reason === "busy";
    m.verifying = reason === "verifying";
    renderWithI18n(
      <EventDeleteAction
        event={{
          ...event,
          tableCount: reason === "last" ? 1 : 2,
          canEdit: reason !== "deadline",
          ...(reason === "cutoff"
            ? { groupType: "PUBLIC", bookingClosesAt: "2000-01-01T00:00:00Z" }
            : {}),
        }}
        table={table}
        disabled={reason === "unverified"}
      />,
    );
    const help = screen.getByRole("button", { name: "Deletion availability" }),
      trash = screen.getByRole("button", { name: "Delete table" }) as HTMLButtonElement;
    expect(trash.disabled).toBe(true);
    expect(help.compareDocumentPosition(trash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(help);
    expect(within(await screen.findByRole("dialog")).getByText(message)).toBeTruthy();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.removeTable).not.toHaveBeenCalled();
  },
);
it.each([true, false])(
  "explains enabled deletion (Table=%s) without opening destructive confirmation",
  async (isTable) => {
    renderWithI18n(<EventDeleteAction event={event} table={isTable ? table : undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Deletion availability" }));
    expect(
      await screen.findByText(
        isTable
          ? "Delete this table and cancel its active registrations?"
          : "Permanently delete this event, all its tables, registrations and votes?",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /Delete (table|event)\?/ })).toBeNull();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.removeTable).not.toHaveBeenCalled();
  },
);
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "hides both help and trash outside planning (%s)",
  (status) => {
    renderWithI18n(
      <EventDeleteAction event={{ ...event, status }} table={{ ...table, eventStatus: status }} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  },
);
