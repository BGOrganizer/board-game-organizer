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
  ["uneditable", "This event can no longer be edited."],
  ["unverified", "Wait until current event and table data are verified."],
  ["busy", "Another event action is in progress."],
  ["verifying", "Checking whether the previous deletion was saved. Do not submit it again."],
] as const)(
  "opens %s reasons from the Trash action itself without a destructive request",
  async (reason, message) => {
    m.busy = reason === "busy";
    m.verifying = reason === "verifying";
    renderWithI18n(
      <EventDeleteAction
        event={{
          ...event,
          tableCount: reason === "last" ? 1 : 2,
          canEdit: reason !== "uneditable",
        }}
        table={table}
        disabled={reason === "unverified"}
      />,
    );
    const trash = screen.getByRole("button", { name: "Delete table" }) as HTMLButtonElement;
    expect(trash.getAttribute("aria-disabled")).not.toBe("true");
    expect(trash.hasAttribute("disabled")).toBe(false);
    expect(trash.className).toContain("button--danger-soft");
    expect(trash.className).toContain("opacity-60");
    expect(screen.queryByRole("button", { name: "Deletion availability" })).toBeNull();
    fireEvent.click(trash);
    expect(within(await screen.findByRole("dialog")).getByText(message)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Delete table?" })).toBeNull();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.removeTable).not.toHaveBeenCalled();
  },
);
it.each([true, false])(
  "requires explicit destructive confirmation for an available action (Table=%s), including after cutoff",
  async (isTable) => {
    renderWithI18n(
      <EventDeleteAction
        event={{ ...event, groupType: "PUBLIC", bookingClosesAt: "2000-01-01T00:00:00Z" }}
        table={isTable ? table : undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Deletion availability" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: isTable ? "Delete table" : "Delete event" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: isTable ? "Delete table?" : "Delete event?",
    });
    expect(
      within(dialog).getByText(
        isTable
          ? "Delete this table and cancel its active registrations?"
          : "Permanently delete this event, all its tables, registrations and votes?",
      ),
    ).toBeTruthy();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.removeTable).not.toHaveBeenCalled();
  },
);
it.each(["CONFIRMED", "TERMINATED"] as const)("hides deletion outside Planning (%s)", (status) => {
  renderWithI18n(
    <EventDeleteAction event={{ ...event, status }} table={{ ...table, eventStatus: status }} />,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
