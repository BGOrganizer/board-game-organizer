import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import type { useEventTableContext, useEventTableMatch } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { messages } from "../../../../../../messages/en.js";
import { EventTable } from "../EventTable";

const s = vi.hoisted(() => ({
  ctx: {} as ReturnType<typeof useEventTableContext>,
  match: {} as ReturnType<typeof useEventTableMatch>,
  eventRetry: vi.fn(),
  tableRetry: vi.fn(),
  matchRetry: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventTableContext: () => s.ctx,
  useEventTableMatch: () => s.match,
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "me" }) }));
vi.mock("@/components/matches/MatchDetail", () => ({
  MatchDetail: ({
    matchId,
    backHref,
    initialTab,
  }: {
    matchId: string;
    backHref: string;
    initialTab: string;
  }) => (
    <div>
      Canonical match {matchId} {backHref} {initialTab}
    </div>
  ),
}));
vi.mock("../EventTablePlayers", () => ({ EventTablePlayers: () => <div>Table players</div> }));
vi.mock("../EventTableOverview", () => ({ EventTableOverview: () => <div>Table overview</div> }));
vi.mock("../EventTableEditAction", () => ({ EventTableEditAction: () => null }));
function mount() {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  );
  const ui = <EventTable eventId="event/a" tableId="table" />;
  const v = render(ui, { wrapper });
  return { ...v, refresh: () => v.rerender(cloneElement(ui)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  s.ctx = {
    event: { role: "member" } as EventResponse,
    table: { name: "Table title", openSkill: false } as EventTableResponse,
    eventQuery: { isPending: false, refetch: s.eventRetry },
    tableQuery: { isPending: false, refetch: s.tableRetry },
  } as unknown as ReturnType<typeof useEventTableContext>;
  s.match = { data: undefined, error: null, refetch: s.matchRetry } as unknown as ReturnType<
    typeof useEventTableMatch
  >;
});
it("uses the same table content, Players tab and contextual Back without an intermediate table button", () => {
  mount();
  expect(screen.getByRole("link", { name: "Back to event" }).getAttribute("href")).toBe(
    "/events/event%2Fa",
  );
  expect(screen.getByText("Table overview")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Table title" })).toBeTruthy();
  expect(screen.queryByText("Open event table")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Players" }));
  expect(screen.getByText("Table players")).toBeTruthy();
});
it("preserves the selected Players tab when match authorization arrives, including frozen former participants", () => {
  s.ctx.table = { ...s.ctx.table, matchId: "match" } as EventTableResponse;
  const v = mount();
  fireEvent.click(screen.getByRole("tab", { name: "Players" }));
  s.ctx.event = { role: "visitor" } as EventResponse;
  s.match.data = { match: { id: "match" } } as NonNullable<typeof s.match.data>;
  v.refresh();
  expect(screen.getByText("Canonical match match /events/event%2Fa players")).toBeTruthy();
});
it("keeps public table content on a match-network error with an explicit retry", () => {
  s.match.error = new Error("network");
  mount();
  expect(screen.getByText("Table overview")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.matchRetry).toHaveBeenCalledOnce();
});
it("shows bounded loading and distinguishes missing/denied metadata from success", () => {
  s.ctx.event = undefined;
  s.ctx.table = undefined;
  s.ctx.eventQuery.isPending = true;
  const v = mount();
  expect(screen.queryByRole("alert")).toBeNull();
  s.ctx.eventQuery.isPending = false;
  v.refresh();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.eventRetry).toHaveBeenCalledOnce();
  expect(s.tableRetry).not.toHaveBeenCalled();
  s.ctx.event = { role: "admin" } as EventResponse;
  s.ctx.tableQuery.isPending = true;
  v.refresh();
  expect(screen.queryByRole("alert")).toBeNull();
  s.ctx.tableQuery.isPending = false;
  v.refresh();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(s.tableRetry).toHaveBeenCalledOnce();
});
