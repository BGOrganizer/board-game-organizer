import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, it } from "vitest";
import { GroupCard } from "@/components/groups/GroupCard";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itCatalog } from "../../../../../../messages/it.js";
import { EventCard } from "../EventCard";
import { EventCardSchedule } from "../EventCardSchedule";
import { EventTableCard } from "../EventTableCard";

function localized(ui: ReactElement, locale: "en" | "it") {
  const i18n = setupI18n({ locale, messages: { en, it: itCatalog } });
  return renderWithI18n(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
}
it.each(["en", "it"] as const)(
  "uses localized readable dates, explicit parent names and accent counters in %s",
  (locale) => {
    const schedule = {
      localStartsAt: "2030-06-03T18:15",
      location: plannedEvent.locations[0],
      dateCount: 2,
      locationCount: 3,
    };
    const q = localized(
      <EventTableCard
        table={{
          ...plannedTable,
          groupId: groupRecord.id,
          groupName: groupRecord.name,
          eventSchedule: schedule,
          gamesDetail: [
            ...plannedTable.gamesDetail,
            { ...plannedTable.gamesDetail[0], id: 2, name: "Second game" },
          ],
        }}
      />,
      locale,
    );
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date("2030-06-03T18:15Z"),
    );
    expect(screen.getByText(date)).not.toBeNull();
    expect(
      screen
        .getByText(`${locale === "it" ? "Evento" : "Event"}: ${plannedTable.eventName}`)
        .previousElementSibling?.classList.contains("lucide-calendar-days"),
    ).toBe(true);
    expect(
      screen
        .getByText(`${locale === "it" ? "Gruppo" : "Group"}: ${groupRecord.name}`)
        .previousElementSibling?.classList.contains("lucide-users-round"),
    ).toBe(true);
    const dateMore = screen.getByRole("img", {
      name: locale === "it" ? "2 date proposte" : "2 proposed dates",
    });
    const locationMore = screen.getByRole("img", {
      name: locale === "it" ? "3 luoghi proposti" : "3 proposed locations",
    });
    expect(dateMore.textContent).toBe("+2");
    expect(locationMore.textContent).toBe("+3");
    for (const count of [
      dateMore,
      locationMore,
      screen.getByText(locale === "it" ? "+1 gioco" : "+1 game"),
    ])
      expect(count.className).toContain("text-accent-soft-foreground");
    const address = screen.getByText(/Club venue · Via Roma 1/);
    expect(
      dateMore.compareDocumentPosition(address) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date("2030-06-03T18:15Z"));
    expect(screen.getByText(time)).not.toBeNull();
    q.rerender(
      <I18nProvider i18n={setupI18n({ locale, messages: { en, it: itCatalog } })}>
        <EventTableCard
          context="event"
          table={{
            ...plannedTable,
            groupId: groupRecord.id,
            groupName: groupRecord.name,
            eventSchedule: schedule,
          }}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText(date)).toBeNull();
    expect(screen.queryByText(/Club venue/)).toBeNull();
    expect(screen.queryByText(/^(Event|Evento|Group|Gruppo):/)).toBeNull();
    expect(screen.getByText("Chess")).not.toBeNull();
  },
);
it("shares Group/Event/Table title typography and keeps Group metadata at the same body size", () => {
  const group = {
    ...groupRecord,
    location: plannedEvent.locations[0],
    memberCount: 4,
    eventCount: 2,
  };
  renderWithI18n(
    <>
      <GroupCard group={group} />
      <EventCard event={plannedEvent} />
      <EventTableCard table={plannedTable} />
    </>,
  );
  const titles = [group.name, plannedEvent.name, plannedTable.name].map((name) =>
    screen.getByText(name),
  );
  expect(new Set(titles.map((title) => title.className)).size).toBe(1);
  expect(
    titles[0].parentElement?.previousElementSibling?.classList.contains("lucide-users-round"),
  ).toBe(true);
  const card = screen.getByRole("link", { name: `Open group: ${group.name}` });
  for (const label of ["Private", "Via Roma 1", "4 members", "2 Events"])
    expect(within(card).getByText(label).closest(".text-sm")).not.toBeNull();
});
it("distinguishes missing cached metadata from known empty or single-option schedules", () => {
  const q = renderWithI18n(<EventCardSchedule />);
  expect(q.container.querySelectorAll(".skeleton")).toHaveLength(2);
  q.rerender(
    <EventCardSchedule
      schedule={{ localStartsAt: null, location: null, dateCount: 0, locationCount: 0 }}
    />,
  );
  expect(screen.getByText("Dates to agree")).not.toBeNull();
  expect(screen.getByText("Locations to agree")).not.toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
  q.rerender(
    <EventCardSchedule
      schedule={{
        localStartsAt: "2030-06-03T20:00",
        location: plannedEvent.locations[0],
        dateCount: 1,
        locationCount: 1,
      }}
    />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  expect(q.container.querySelectorAll("time")).toHaveLength(2);
});
