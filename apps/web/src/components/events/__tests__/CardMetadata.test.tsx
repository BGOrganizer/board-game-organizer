import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { GroupCard } from "@/components/groups/GroupCard";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itCatalog } from "../../../../../../messages/it.js";
import { EventCard } from "../EventCard";
import { EventCardSchedule } from "../EventCardSchedule";
import { EventTableCard } from "../EventTableCard";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));
function localized(ui: ReactElement, locale: "en" | "it") {
  return renderWithI18n(
    <I18nProvider i18n={setupI18n({ locale, messages: { en, it: itCatalog } })}>{ui}</I18nProvider>,
  );
}
it.each(["en", "it"] as const)(
  "localizes accepted seat ratios and complete date/location popovers in %s",
  async (locale) => {
    const schedule = {
      localStartsAt: "2030-06-03T18:15",
      location: plannedEvent.locations[0],
      dateCount: 2,
      locationCount: 1,
      timeZone: "Europe/Rome",
      dates: [
        { id: "one", localStartsAt: "2030-06-03T18:15" },
        { id: "two", localStartsAt: "2030-06-04T20:45" },
      ],
      locations: plannedEvent.locations,
    };
    localized(
      <EventTableCard
        table={{
          ...plannedTable,
          groupId: groupRecord.id,
          groupName: groupRecord.name,
          seatedCount: 2,
          eventSchedule: schedule,
        }}
      />,
      locale,
    );
    expect(
      screen.getByText(locale === "it" ? "2/4 partecipanti" : "2/4 participants"),
    ).not.toBeNull();
    expect(
      screen.getByText(groupRecord.name).parentElement?.querySelector("svg.lucide-users-round"),
    ).not.toBeNull();
    expect(
      screen
        .getByText(plannedTable.eventName)
        .parentElement?.querySelector("svg.lucide-calendar-days"),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: `${locale === "it" ? "Date e orari" : "Dates and times"}: First table`,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    for (const date of schedule.dates) {
      expect(
        within(dialog).getByText(
          new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
            new Date(`${date.localStartsAt}Z`),
          ),
        ),
      ).not.toBeNull();
      expect(
        within(dialog).getByText(
          new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          }).format(new Date(`${date.localStartsAt}Z`)),
        ),
      ).not.toBeNull();
    }
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(
      screen.getByRole("button", {
        name: `${locale === "it" ? "Luoghi" : "Locations"}: First table`,
      }),
    );
    expect(await screen.findByText("Club venue")).not.toBeNull();
    expect(screen.getByText("Via Roma 1")).not.toBeNull();
    expect(screen.getByText("Europe/Rome")).not.toBeNull();
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
  const titles = [group.name, plannedEvent.name, plannedTable.name].map(
    (name) => screen.getAllByText(name).find((e) => e.className.includes("font-semibold"))!,
  );
  expect(new Set(titles.map((title) => title.className)).size).toBe(1);
  expect(
    titles[0].parentElement?.previousElementSibling?.classList.contains("lucide-users-round"),
  ).toBe(true);
  const card = screen.getByRole("link", { name: `Open group: ${group.name}` });
  for (const label of ["Private", "Via Roma 1", "4 members", "2 Events"])
    expect(
      within(card.closest(".card") as HTMLElement)
        .getByText(label)
        .closest(".text-sm"),
    ).not.toBeNull();
});
it("distinguishes missing cached metadata from known empty or single-option Event schedules", () => {
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
