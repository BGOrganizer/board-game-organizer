import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itCatalog } from "../../../../../../messages/it.js";
import { EventTableScheduleCard } from "../EventTableScheduleCard";

const table = {
  ...plannedTable,
  eventStatus: "CONFIRMED" as const,
  groupType: "PUBLIC" as const,
  startsAt: "2030-06-01T10:00:00Z",
  games: [
    { gameId: 1, durationMinutes: 120 },
    { gameId: 2, durationMinutes: 30 },
  ],
  confirmed: {
    gameId: 2,
    playerIds: ["owner", "guest"],
    startsAt: "2030-06-03T18:00:00Z",
    endsAt: "2030-06-03T18:30:00Z",
  },
  demonstratorUserId: "demo",
  demonstratorName: "Game guide",
  demonstratorAvatarUrl: "https://example.test/guide.png",
};
it.each(["en", "it"] as const)(
  "shows frozen schedule and an actual demonstrator identity in %s",
  (locale) => {
    const i18n = setupI18n({ locale, messages: { en, it: itCatalog } });
    const q = renderWithI18n(
      <I18nProvider i18n={i18n}>
        <EventTableScheduleCard table={table} timeZone="Asia/Tokyo" />
      </I18nProvider>,
    );
    const card = screen.getByRole("region", {
      name: locale === "it" ? "Programma del tavolo" : "Table schedule",
    });
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Tokyo",
    }).format(new Date(table.confirmed.startsAt));
    const clock = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(table.confirmed.startsAt));
    expect(within(card).getByText(date)).not.toBeNull();
    expect(within(card).getByText(clock)).not.toBeNull();
    expect(within(card).queryByText(/^(Duration|Durata):/)).toBeNull();
    expect(q.container.querySelectorAll(".lucide-calendar-days")).toHaveLength(1);
    expect(q.container.querySelectorAll(".lucide-clock-3")).toHaveLength(1);
    expect(q.container.querySelector(".lucide-clock")).toBeNull();
    const row = within(card).getByRole("listitem");
    expect(within(row).getByText("Game guide")).not.toBeNull();
    expect(within(row).getByText(locale === "it" ? "Dimostratore" : "Demonstrator")).not.toBeNull();
    expect(row.querySelector(".avatar")).not.toBeNull();
    expect(q.container.textContent).not.toContain("120");
  },
);
it("hides planning/excluded snapshots, keeps historical choices and omits nonpublic or absent demonstrators", () => {
  const q = renderWithI18n(
    <EventTableScheduleCard table={{ ...table, eventStatus: "PLANNING" }} timeZone="UTC" />,
  );
  expect(q.container.textContent).toBe("");
  q.rerender(<EventTableScheduleCard table={{ ...table, confirmed: undefined }} timeZone="UTC" />);
  expect(q.container.textContent).toBe("");
  for (const groupType of ["PRIVATE", null] as const) {
    q.rerender(
      <EventTableScheduleCard
        table={{ ...table, groupType, eventStatus: "TERMINATED" }}
        timeZone="UTC"
      />,
    );
    expect(screen.queryByText(/^Duration:/)).toBeNull();
    expect(screen.queryByText("Demonstrator")).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
  }
  q.rerender(
    <EventTableScheduleCard table={{ ...table, demonstratorUserId: undefined }} timeZone="UTC" />,
  );
  expect(screen.queryByRole("listitem")).toBeNull();
});
it("does not invent a duration, identity or device-zone date while metadata is missing", () => {
  const q = renderWithI18n(
    <EventTableScheduleCard
      table={{
        ...table,
        games: [{ gameId: 2 }],
        demonstratorName: undefined,
        demonstratorAvatarUrl: undefined,
      }}
    />,
  );
  expect(screen.getByRole("status", { name: "Loading…" })).not.toBeNull();
  expect(q.container.querySelector("time")).toBeNull();
  expect(screen.queryByText(/^Duration:/)).toBeNull();
  expect(within(screen.getByRole("listitem")).getByText("Unknown")).not.toBeNull();
  q.rerender(
    <EventTableScheduleCard
      table={{ ...table, games: [{ gameId: 2, durationMinutes: 1 }] }}
      timeZone="UTC"
    />,
  );
  expect(screen.queryByText(/^Duration:/)).toBeNull();
});
