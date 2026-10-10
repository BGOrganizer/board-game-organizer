import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import type { useEventActions, useEventTableContext } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps, cloneElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { messages } from "../../../../../../messages/en.js";
import type { ContactConfirmDialog } from "../../common/ui/ContactConfirmDialog";
import { EventTableEdit } from "../EventTableEdit";
import type { EventTableEditor } from "../EventTableEditor";

const s = vi.hoisted(() => ({
  ctx: {} as ReturnType<typeof useEventTableContext>,
  actions: {} as ReturnType<typeof useEventActions>,
  editor: {} as ComponentProps<typeof EventTableEditor>,
  confirm: {} as ComponentProps<typeof ContactConfirmDialog>,
  update: vi.fn(),
  push: vi.fn(),
  eventRetry: vi.fn(),
  tableRetry: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventTableContext: () => s.ctx,
  useEventActions: () => s.actions,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: s.push }) }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "admin" }) }));
vi.mock("../EventTableEditor", () => ({
  EventTableEditor: (props: ComponentProps<typeof EventTableEditor>) => {
    s.editor = props;
    return <h1>Table editor</h1>;
  },
}));
vi.mock("@/components/common/ui/ContactConfirmDialog", () => ({
  ContactConfirmDialog: (props: ComponentProps<typeof ContactConfirmDialog>) => {
    s.confirm = props;
    return (
      <div role="dialog" aria-label={props.title}>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        {props.actions?.map((a) => (
          <button type="button" key={a.label} onClick={a.onPress}>
            {a.label}
          </button>
        ))}
      </div>
    );
  },
}));
const event = {
  id: "event",
  organizationId: "org",
  name: "Game night",
  role: "admin",
  canModify: true,
  status: "PUBLISHED",
  timeZone: "Europe/Rome",
  startsAt: "2030-06-12T14:00:30.000Z",
  endsAt: "2030-06-12T18:00:30.000Z",
  bookingClosesAt: "2030-06-11T14:00:30.000Z",
  version: 7,
  location: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Club venue",
    address: "Verified address",
    latitude: 41,
    longitude: 12,
  },
} as EventResponse;
const table = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Azul table",
  status: "PLANNING",
  startsAt: "2030-06-12T14:15:30.000Z",
  endsAt: "2030-06-12T17:45:30.000Z",
  minPlayers: 2,
  maxPlayers: 4,
  gameId: 1,
  openSkill: true,
  demonstratorUserId: "demo",
  demonstrator: { userId: "demo", username: "Demo", avatarUrl: null },
  gameName: "Azul",
  image: null,
} as EventTableResponse;
function mount() {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  );
  const ui = <EventTableEdit eventId="event" tableId="table/a" />;
  const v = render(ui, { wrapper });
  return { ...v, refresh: () => v.rerender(cloneElement(ui)) };
}
const changed = () => ({
  ...s.editor.draft,
  input: { ...s.editor.draft.input, name: "Changed table" },
});
beforeEach(() => {
  vi.clearAllMocks();
  s.update.mockResolvedValue(undefined);
  s.ctx = {
    event: { ...event },
    table: { ...table },
    open: true,
    eventQuery: { isPending: false, refetch: s.eventRetry },
    tableQuery: { isPending: false, refetch: s.tableRetry },
  } as unknown as ReturnType<typeof useEventTableContext>;
  s.actions = { busy: false, update: { mutateAsync: s.update } } as unknown as ReturnType<
    typeof useEventActions
  >;
});
it("reuses the table editor, leaves unchanged drafts without writes, and respects busy Back/save guards", () => {
  mount();
  expect(screen.getByRole("heading", { name: "Table editor" })).toBeTruthy();
  expect(s.editor.draft.input.id).toBe(table.id);
  expect(s.editor.timeZone).toBe("Europe/Rome");
  act(() => s.editor.onSave(s.editor.draft));
  expect(s.update).not.toHaveBeenCalled();
  expect(s.push).toHaveBeenCalledWith("/events/event/tables/table%2Fa");
  s.actions.busy = true;
  act(() => {
    s.editor.onClose();
    s.editor.onSave(changed());
  });
  expect(s.push).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
  s.actions.busy = false;
  act(() => s.editor.onClose());
  expect(s.push).toHaveBeenCalledTimes(2);
});
it("requires explicit reservation reset, cancels independently and preserves the initial concurrency version", async () => {
  const v = mount();
  act(() => s.editor.onSave(changed()));
  expect(s.update).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Reset reservations" })).toBeTruthy();
  s.actions.busy = true;
  act(() => s.confirm.onCancel());
  expect(screen.getByRole("dialog")).toBeTruthy();
  act(() => s.confirm.actions?.[0].onPress());
  expect(s.update).not.toHaveBeenCalled();
  s.actions.busy = false;
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  s.ctx.event = { ...event, version: 8 };
  s.ctx.table = { ...table, demonstrator: null };
  v.refresh();
  act(() => s.editor.onSave(changed()));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(s.push).toHaveBeenCalledOnce());
  expect(s.update).toHaveBeenCalledWith({
    id: "event",
    input: expect.objectContaining({
      version: 7,
      removedTableIds: [],
      tables: [expect.objectContaining({ id: table.id, name: "Changed table" })],
    }),
  });
  expect(s.update.mock.calls[0][0].input.tables).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps failed resets and the draft available for retry instead of navigating or losing other tables", async () => {
  s.update.mockRejectedValueOnce(new Error("conflict"));
  mount();
  act(() => s.editor.onSave(changed()));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Could not save event"),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(s.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(s.push).toHaveBeenCalledOnce());
});
it.each([
  "missing-event",
  "missing-table",
  "member",
  "denied",
  "deadline",
  "fixed",
  "event-loading",
  "table-loading",
])("does not mount the editor for %s", (why) => {
  if (why === "missing-event") s.ctx.event = undefined;
  if (why === "missing-table") s.ctx.table = undefined;
  if (why === "member") s.ctx.event = { ...event, role: "member" };
  if (why === "denied") s.ctx.event = { ...event, canModify: false };
  if (why === "deadline") s.ctx.open = false;
  if (why === "fixed") s.ctx.table = { ...table, status: "CREATED" };
  if (why === "event-loading") {
    s.ctx.event = undefined;
    s.ctx.eventQuery.isPending = true;
  }
  if (why === "table-loading") {
    s.ctx.table = undefined;
    s.ctx.tableQuery.isPending = true;
  }
  mount();
  expect(screen.queryByText("Table editor")).toBeNull();
  expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(
    "/events/event/tables/table%2Fa",
  );
  const retry = screen.queryByRole("button", { name: "Retry" });
  if (retry) {
    fireEvent.click(retry);
    expect(s.eventRetry).toHaveBeenCalledOnce();
    expect(s.tableRetry).toHaveBeenCalledTimes(s.ctx.event ? 1 : 0);
  } else expect(screen.queryByRole("alert")).toBeNull();
});
