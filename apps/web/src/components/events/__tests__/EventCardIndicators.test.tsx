import type { TableCardSummary } from "@board-game-organizer/schemas";
import { CARD_EXCLUSION_MESSAGES, CARD_PLANNING_MESSAGES } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { HelpPopover } from "@/components/common/ui/HelpPopover";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../messages/it.js";
import { EventCardIndicators } from "../EventCardIndicators";
import { EventCardTableSummaries } from "../EventCardTableSummaries";
import { EventRolePopover } from "../EventRolePopover";
import { EventTableCardIndicators } from "../EventTableCardIndicators";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));
vi.mock("@/components/common/ui/HelpPopover", () => ({
  HelpPopover: ({
    label,
    title,
    icon: Icon,
    tone = "muted",
    triggerVariant = "ghost",
    children,
  }: ComponentProps<typeof HelpPopover>) => (
    <section data-tone={tone} data-variant={triggerVariant} aria-label={title ?? label}>
      <button type="button" aria-label={label}>
        {Icon ? <Icon /> : null}
      </button>
      {children}
    </section>
  ),
}));
vi.mock("../EventSchedulePopover", () => ({
  EventSchedulePopover: ({ kind }: { kind: string }) => <span>{`event-${kind}`}</span>,
}));
vi.mock("../EventTableSchedulePopover", () => ({
  EventTableSchedulePopover: ({ kind }: { kind: string }) => <span>{`table-${kind}`}</span>,
}));
vi.mock("../EventTableGamesPopover", () => ({ EventTableGamesPopover: () => <span>games</span> }));

const tableSummary = (patch: Partial<TableCardSummary> = {}): TableCardSummary => ({
  tableId: plannedTable.id,
  name: plannedTable.name,
  confirmed: false,
  ready: false,
  blockers: ["MIN_PLAYERS"],
  myParticipation: "NONE",
  exclusionReasons: [],
  winners: [],
  ...patch,
});
const finalTable = {
  ...plannedTable,
  eventStatus: "CONFIRMED" as const,
  confirmed: { gameId: 1, startsAt: plannedEvent.createdAt, playerIds: [] },
};
afterEach(cleanup);

it("translates dynamic planning and exclusion categories using the real Italian catalog", () => {
  render(
    <I18nProvider i18n={setupI18n({ locale: "it", messages: { it: italian } })}>
      <EventCardTableSummaries
        tables={[
          tableSummary({ blockers: ["DATE_AGREEMENT", "LOCATION_AGREEMENT", "GAME_AGREEMENT"] }),
        ]}
        mode="planning"
      />
      <EventCardTableSummaries
        tables={[
          tableSummary({
            exclusionReasons: ["DATE_AGREEMENT", "LOCATION_AGREEMENT", "GAME_AGREEMENT"],
          }),
        ]}
        mode="exclusions"
      />
    </I18nProvider>,
  );
  for (const message of [
    "Manca l’accordo su data e ora.",
    "Manca l’accordo sul luogo.",
    "Manca l’accordo sul gioco.",
    "I tuoi voti non sono compatibili con la data e l’ora scelte.",
    "I tuoi voti non sono compatibili con il luogo scelto.",
    "I tuoi voti non sono compatibili con il gioco scelto.",
  ])
    expect(screen.getByText(message)).not.toBeNull();
});

it("keeps the role trigger neutral and discloses all roles plus pending decisions without acting", () => {
  renderWithI18n(
    <EventRolePopover roles={["admin", "demonstrator", "waitingPlayer"]} action="reply" />,
  );
  const trigger = screen.getByRole("button", { name: "Roles and participation" });
  expect(trigger.querySelector("svg.lucide-id-card")).not.toBeNull();
  expect(trigger.parentElement?.dataset.tone).toBe("muted");
  for (const label of [
    "Admin",
    "Demonstrator",
    "Player on the waiting list",
    "Open details to accept or decline your invitation.",
  ])
    expect(screen.getByText(label)).not.toBeNull();
});
it.each([false, true])(
  "distinguishes an unregistered viewer from pending draft roles (%s)",
  (pending) => {
    renderWithI18n(<EventRolePopover roles={[]} pending={pending} />);
    expect(screen.getByText(pending ? "Loading…" : "You are not registered.")).not.toBeNull();
  },
);
it.each([true, false])("shows Planning readiness=%s and no proposal icons", (ready) => {
  renderWithI18n(
    <EventCardIndicators
      event={{ ...plannedEvent, cardSummary: { ready, tables: [tableSummary({ ready })] } }}
    />,
  );
  expect(
    screen.getByText(
      ready ? "Ready for a manager to confirm." : "Confirmation requirements are not yet met.",
    ),
  ).not.toBeNull();
  expect(screen.queryByText("event-dates")).toBeNull();
  expect(screen.queryByText("event-locations")).toBeNull();
});
it("leaves old cached Planning and result projections explicitly loading", () => {
  const view = renderWithI18n(<EventCardIndicators event={plannedEvent} />);
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
  view.rerender(<EventCardIndicators event={{ ...plannedEvent, status: "TERMINATED" }} />);
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
});
it.each([
  [undefined, "MORE_PLAYERS", false, "More players"],
  ["MANUAL", "BEST", true, "BGG Best"],
  ["ASSISTED", "BEST", false, "BGG Best"],
  ["ASSISTED", "BEST", true, "BGG Best"],
] as const)(
  "explains effective planning settings %s/%s/%s",
  (planningMode, playerPreference, allowBestReduction, preference) => {
    renderWithI18n(
      <EventCardIndicators
        event={{ ...plannedEvent, planningMode, playerPreference, allowBestReduction }}
      />,
    );
    expect(screen.getByText(preference)).not.toBeNull();
    expect(
      Boolean(
        screen.queryByText(
          "Assisted planning may seat fewer players to improve the BGG recommendation.",
        ),
      ),
    ).toBe(planningMode !== "MANUAL" && playerPreference === "BEST" && allowBestReduction);
  },
);
it.each(["sharedResultsOnly", "personalAccessOnly"] as const)(
  "keeps settings unavailable for %s",
  (scope) => {
    renderWithI18n(<EventCardIndicators event={{ ...plannedEvent, [scope]: true }} />);
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  },
);
it("retains public visibility independently of personal status", () => {
  renderWithI18n(
    <EventCardIndicators event={{ ...plannedEvent, groupType: "PUBLIC", visibility: "PUBLIC" }} />,
  );
  expect(screen.getByRole("button", { name: "Public event" })).not.toBeNull();
  expect(
    screen.getByText("Authenticated users can enroll without joining the group."),
  ).not.toBeNull();
});
it("keeps mixed participation green, counts included Tables, and explains other exclusions", () => {
  renderWithI18n(
    <EventCardIndicators
      event={{
        ...plannedEvent,
        status: "CONFIRMED",
        cardSummary: {
          ready: false,
          tables: [
            tableSummary({ confirmed: true, myParticipation: "CONFIRMED" }),
            tableSummary({
              tableId: "other",
              name: "Other table",
              myParticipation: "EXCLUDED",
              exclusionReasons: ["TABLE_EXCLUDED"],
            }),
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Confirmed" }).parentElement?.dataset.tone).toBe(
    "success",
  );
  expect(screen.getByText("Tables where you are confirmed: 1")).not.toBeNull();
  expect(screen.getByText("Other table")).not.toBeNull();
  expect(screen.getByText("event-dates")).not.toBeNull();
});
it("does not invent a confirmed Table count for a legacy frozen card", () => {
  renderWithI18n(
    <EventCardIndicators
      event={{
        ...plannedEvent,
        status: "CONFIRMED",
        myRegistrations: [{ ...seat("owner"), position: "FROZEN" }],
      }}
    />,
  );
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
});
it.each([true, false])(
  "shows actual exclusion with authoritative reason available=%s",
  (loaded) => {
    renderWithI18n(
      <EventCardIndicators
        event={{
          ...plannedEvent,
          status: "CONFIRMED",
          myRegistrations: [seat("owner")],
          ...(loaded
            ? {
                cardSummary: {
                  ready: false,
                  tables: [
                    tableSummary({
                      myParticipation: "EXCLUDED",
                      exclusionReasons: ["NOT_SELECTED"],
                    }),
                  ],
                },
              }
            : {}),
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: loaded ? "You are excluded" : "Confirmed" }).parentElement
        ?.dataset.tone,
    ).toBe(loaded ? "danger" : "muted");
    expect(
      loaded
        ? screen.getByText("You were not included in the final roster.")
        : screen.getByLabelText("Loading…"),
    ).not.toBeNull();
  },
);
it.each([true, false])("separates duty-only=%s and observer status", (duty) => {
  renderWithI18n(
    <EventCardIndicators
      event={{ ...plannedEvent, status: "CONFIRMED", canManage: duty, managementRole: "moderator" }}
    />,
  );
  expect(screen.getByRole("button", { name: "Confirmed" }).parentElement?.dataset.tone).toBe(
    duty ? "accent" : "muted",
  );
  expect(
    screen.getAllByText(
      duty ? "You have an assigned role without a player seat." : "You are not registered.",
    ).length,
  ).toBeGreaterThan(0);
});
it("shows only confirmed-table winners when the Event has terminated", () => {
  renderWithI18n(
    <EventCardIndicators
      event={{
        ...plannedEvent,
        status: "TERMINATED",
        cardSummary: {
          ready: false,
          tables: [
            tableSummary({ confirmed: true, winners: [{ userId: "owner", username: "owner" }] }),
            tableSummary({ tableId: "excluded", name: "Excluded" }),
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Terminated" }).parentElement?.dataset.tone).toBe(
    "accent",
  );
  expect(screen.getByText("@owner")).not.toBeNull();
  expect(screen.queryByText("Excluded")).toBeNull();
});
it.each([true, false])(
  "describes Table Planning readiness=%s while retaining count information",
  (ready) => {
    renderWithI18n(
      <EventTableCardIndicators
        table={{ ...plannedTable, cardSummary: tableSummary({ ready }) }}
      />,
    );
    expect(
      screen.getByText(
        ready ? "Ready for a manager to confirm." : "Confirmation requirements are not yet met.",
      ),
    ).not.toBeNull();
    expect(screen.getByText("Minimum players")).not.toBeNull();
    expect(screen.queryByText("games")).toBeNull();
  },
);
it("does not turn missing Planning metadata into a guess", () => {
  renderWithI18n(
    <EventTableCardIndicators
      table={{ ...plannedTable, acceptedCount: undefined, pendingRegistrationCount: undefined }}
    />,
  );
  expect(screen.getAllByLabelText("Loading…")).toHaveLength(3);
});
it.each([true, false])(
  "uses a danger-soft button for a personally excluded Table, reason loaded=%s",
  (loaded) => {
    renderWithI18n(
      <EventTableCardIndicators
        table={{
          ...finalTable,
          myRegistration: seat("owner"),
          myPosition: "WAITING",
          ...(loaded
            ? {
                cardSummary: tableSummary({
                  confirmed: true,
                  myParticipation: "EXCLUDED",
                  exclusionReasons: ["NOT_SELECTED"],
                }),
              }
            : {}),
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "You are excluded" }).parentElement?.dataset.variant,
    ).toBe("danger-soft");
    expect(
      loaded
        ? screen.getByText("You were not included in the final roster.")
        : screen.getByLabelText("Loading…"),
    ).not.toBeNull();
  },
);
it("uses full danger when the entire Table is excluded and hides final data icons", () => {
  renderWithI18n(
    <EventTableCardIndicators table={{ ...plannedTable, eventStatus: "CONFIRMED" }} />,
  );
  expect(
    screen.getByRole("button", { name: "Table excluded" }).parentElement?.dataset.variant,
  ).toBe("danger");
  expect(screen.queryByText("games")).toBeNull();
});
it.each(["player", "duty", "observer"] as const)(
  "describes a confirmed Table for its %s",
  (role) => {
    renderWithI18n(
      <EventTableCardIndicators
        table={{
          ...finalTable,
          ...(role === "player"
            ? {
                myPosition: "FROZEN" as const,
                confirmed: { ...finalTable.confirmed, playerIds: ["owner"] },
              }
            : role === "duty"
              ? { canManage: true, managementRole: "admin" as const }
              : {}),
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirmed" }).parentElement?.dataset.tone).toBe(
      role === "player" ? "success" : role === "duty" ? "accent" : "muted",
    );
    expect(screen.getByText("table-dates")).not.toBeNull();
    expect(screen.getByText("games")).not.toBeNull();
  },
);
it.each([true, false])("keeps only winners in a terminated Table status, loaded=%s", (loaded) => {
  renderWithI18n(
    <EventTableCardIndicators
      table={{
        ...finalTable,
        eventStatus: "TERMINATED",
        ...(loaded
          ? { cardSummary: tableSummary({ winners: [{ userId: "winner", username: "winner" }] }) }
          : {}),
      }}
    />,
  );
  expect(loaded ? screen.getByText("@winner") : screen.getByLabelText("Loading…")).not.toBeNull();
  expect(screen.queryByText("Minimum players")).toBeNull();
});
it("shows each tied winner on its own row and never invents missing handles", () => {
  renderWithI18n(
    <EventCardTableSummaries
      mode="results"
      showNames={false}
      tables={[
        tableSummary({
          winners: [
            { userId: "a", username: "@alice" },
            { userId: "b", username: "bob" },
            { userId: "c", username: null },
          ],
        }),
      ]}
    />,
  );
  expect(screen.getByText("@alice").tagName).toBe("LI");
  expect(screen.getByText("@bob").previousElementSibling?.textContent).toBe("@alice");
  expect(screen.getByText("Username unavailable")).not.toBeNull();
});
it.each(["planning", "results"] as const)("has an explicit empty %s state", (mode) => {
  renderWithI18n(<EventCardTableSummaries mode={mode} tables={[]} />);
  expect(
    screen.getByText(mode === "results" ? "No winners." : "No tables are ready for confirmation."),
  ).not.toBeNull();
});
it("keeps no-winner Tables explicit", () => {
  renderWithI18n(<EventCardTableSummaries mode="results" tables={[tableSummary()]} />);
  expect(screen.getByText("No winners.")).not.toBeNull();
});
it("pages a long Event's Tables locally, clamps shrinking data, and preserves boundary focus", () => {
  const rows = Array.from({ length: 10 }, (_, n) =>
    tableSummary({ tableId: String(n), name: `Table ${n}`, ready: true }),
  );
  const view = renderWithI18n(<EventCardTableSummaries mode="planning" tables={rows} />);
  expect(screen.queryByText("Table 8")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Table 8")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(screen.queryByText("Table 8")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  view.rerender(<EventCardTableSummaries mode="planning" tables={rows.slice(0, 1)} />);
  expect(screen.getByText("Table 0")).not.toBeNull();
});

it.each(Object.entries(CARD_PLANNING_MESSAGES))(
  "names Planning blocker %s explicitly",
  (code, message) => {
    renderWithI18n(
      <EventCardTableSummaries
        mode="planning"
        tables={[tableSummary({ blockers: [code as keyof typeof CARD_PLANNING_MESSAGES] })]}
      />,
    );
    expect(screen.getByText(message)).not.toBeNull();
  },
);
it.each(Object.entries(CARD_EXCLUSION_MESSAGES))(
  "names exclusion reason %s explicitly",
  (code, message) => {
    renderWithI18n(
      <EventCardTableSummaries
        mode="exclusions"
        tables={[
          tableSummary({ exclusionReasons: [code as keyof typeof CARD_EXCLUSION_MESSAGES] }),
        ]}
      />,
    );
    expect(screen.getByText(message)).not.toBeNull();
  },
);

it.each(["Demo", null, undefined])(
  "retains nonterminal demonstrator metadata %s without invalid paragraph markup",
  (demonstratorName) => {
    renderWithI18n(
      <EventTableCardIndicators
        table={{
          ...plannedTable,
          demonstratorUserId: "foreign",
          demonstratorName,
          cardSummary: tableSummary(),
        }}
      />,
    );
    if (demonstratorName === undefined) {
      const skeleton = screen.getByLabelText("Loading…");
      expect(skeleton.parentElement?.tagName).toBe("DIV");
    } else
      expect(screen.getByText(`Demonstrator: ${demonstratorName || "Unknown"}`)).not.toBeNull();
  },
);
