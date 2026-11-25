import type { PlannedTableResponse, TableCardSummary } from "@board-game-organizer/schemas";
import {
  type ClientEventRecord,
  type ClientGroupRecord,
  RECORD_USER_ROLES,
  type RecordUserRole,
} from "@board-game-organizer/shared";
import { render, screen } from "@testing-library/react-native";
import { createContext, type ReactNode, useContext } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupCardIndicators } from "@/components/groups/GroupCardIndicators";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventCardIndicators } from "../EventCardIndicators";
import { EventCardTableSummaries } from "../EventCardTableSummaries";
import { EventRolePopover } from "../EventRolePopover";
import { EventTableCardIndicators } from "../EventTableCardIndicators";

const Auth = createContext({ userId: "owner" });
vi.mock("@clerk/expo", () => ({ useAuth: () => useContext(Auth) }));

function Fixture({
  children,
  locale = "en",
  userId = "owner",
}: {
  children: ReactNode;
  locale?: "en" | "it";
  userId?: string;
}) {
  return (
    <NativeTestProviders locale={locale}>
      <Auth value={{ userId }}>{children}</Auth>
    </NativeTestProviders>
  );
}
function summary(patch: Partial<TableCardSummary> = {}): TableCardSummary {
  return {
    tableId: plannedTable.id,
    name: "Legacy table name",
    order: 0,
    confirmed: false,
    ready: false,
    blockers: [],
    myParticipation: "NONE",
    exclusionReasons: [],
    winners: [],
    ...patch,
  };
}
const frozen = { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" };
function event(patch: Partial<ClientEventRecord> = {}): ClientEventRecord {
  return { ...plannedEvent, ...patch };
}
function table(patch: Partial<PlannedTableResponse> = {}): PlannedTableResponse {
  return { ...plannedTable, ...patch };
}
async function open(label: string) {
  await pressMeasuredPopover(screen.getByRole("button", { name: label }));
}
function nativeGlyphs(root = screen.container, size = 16) {
  return root.queryAll(
    (node) =>
      node.type.startsWith("RNSVG") &&
      Number(node.props.bbWidth) === size &&
      Number(node.props.bbHeight) === size,
  );
}
function nativeStroke(glyph: ReturnType<typeof nativeGlyphs>[number]) {
  const group = glyph.queryAll(
    (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
  )[0];
  expect(group).toBeDefined();
  const brush = group.props.stroke;
  expect(brush.type).toBe(0);
  expect(typeof brush.payload).toBe("number");
  expect((brush.payload >>> 24) & 255).toBe(255);
  return brush.payload as number;
}

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it("renders every authorized role with its own actual 16dp glyph, wrap-safe text and invitation help", async () => {
  const roles = Object.keys(RECORD_USER_ROLES) as RecordUserRole[];
  await render(
    <Fixture>
      <EventRolePopover roles={roles} action="reply" />
    </Fixture>,
  );
  const trigger = screen.getByRole("button", { name: "Roles and participation" });
  expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44 });
  await pressMeasuredPopover(trigger);
  expect(screen.getByRole("heading", { name: "Roles and participation" })).toBeVisible();
  for (const role of roles) {
    const text = screen.getByText(RECORD_USER_ROLES[role].message);
    expect(text).toBeVisible();
    expect(text).toHaveStyle({ flex: 1, minWidth: 0 });
    expect(text.props.numberOfLines).toBeUndefined();
    const glyph = nativeGlyphs(text.parent ?? undefined)[0];
    expect(glyph).toHaveStyle({ flexShrink: 0 });
    nativeStroke(glyph);
  }
  expect(screen.getByText("Open details to accept or decline your invitation.")).toBeVisible();
  // These values come from actual compiled HeroUI tokens, not undefined JS style comparisons.
  const adminGlyph = nativeGlyphs(screen.getByText("Admin").parent ?? undefined)[0];
  const moderatorGlyph = nativeGlyphs(screen.getByText("Moderator").parent ?? undefined)[0];
  const participantGlyph = nativeGlyphs(
    screen.getByText("Accepted participant").parent ?? undefined,
  )[0];
  expect(nativeStroke(adminGlyph)).not.toBe(nativeStroke(moderatorGlyph));
  expect(nativeStroke(adminGlyph)).not.toBe(nativeStroke(participantGlyph));
});

it.each([false, true])("keeps absent roles explicit while pending=%s", async (pending) => {
  await render(
    <Fixture>
      <EventRolePopover roles={[]} pending={pending} />
    </Fixture>,
  );
  await open("Roles and participation");
  expect(screen.getByText(pending ? "Loading…" : "You are not registered.")).toBeVisible();
  expect(screen.queryByText("Open details to accept or decline your invitation.")).toBeNull();
});

it("combines event management, demonstration, pending invitation, waiting and accepted roles", async () => {
  const accepted = seat("owner");
  const waiting = {
    ...accepted,
    id: "44444444-4444-4444-8444-444444444444",
    position: "WAITING" as const,
    status: "PENDING" as const,
  };
  await render(
    <Fixture>
      <EventCardIndicators
        event={event({
          canManage: true,
          managementRole: "admin",
          myDemonstrator: true,
          myRegistrations: [accepted, waiting],
        })}
      />
    </Fixture>,
  );
  await open("Roles and participation");
  for (const label of [
    "Admin",
    "Demonstrator",
    "Participant with pending invitation",
    "Participant on the waiting list",
    "Accepted participant",
  ])
    expect(screen.getByText(label)).toBeVisible();
  expect(screen.getByText("Open details to accept or decline your invitation.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Dates and times:/ })).toBeNull();
});

it("combines table moderator, demonstration and pending waiting-list consent without inventing an accepted seat", async () => {
  await render(
    <Fixture>
      <EventTableCardIndicators
        table={table({
          canManage: true,
          managementRole: "moderator",
          demonstratorUserId: "owner",
          canRespond: true,
          myRegistration: { ...seat("owner"), status: "PENDING" },
          myPosition: "WAITING",
        })}
      />
    </Fixture>,
  );
  await open("Roles and participation");
  for (const label of [
    "Moderator",
    "Demonstrator",
    "Player with pending invitation",
    "Player on the waiting list",
  ])
    expect(screen.getByText(label)).toBeVisible();
  expect(screen.queryByText("Confirmed player")).toBeNull();
  expect(screen.getByText("Open details to accept or decline your invitation.")).toBeVisible();
});

it("does not turn a pending SELF registration into an invitation or an accepted table role", async () => {
  await render(
    <Fixture>
      <EventTableCardIndicators
        table={table({
          myRegistration: { ...seat("owner"), kind: "SELF", status: "PENDING" },
          myPosition: "SEATED",
          canRespond: true,
        })}
      />
    </Fixture>,
  );
  await open("Roles and participation");
  expect(screen.getByText("You are not registered.")).toBeVisible();
  expect(screen.queryByText("Open details to accept or decline your invitation.")).toBeNull();
});

it.each(["readOnly", "optimistic"] as const)(
  "does not expose management/seat claims from an event %s projection",
  async (kind) => {
    await render(
      <Fixture>
        <EventCardIndicators
          event={event({
            canManage: true,
            managementRole: "admin",
            myDemonstrator: true,
            myRegistrations: [seat("owner")],
            ...(kind === "readOnly"
              ? { readOnly: true }
              : { optimistic: { draftId: "draft", phase: "saving" } }),
          })}
        />
      </Fixture>,
    );
    await open("Roles and participation");
    expect(screen.queryByText("Admin")).toBeNull();
    expect(screen.queryByText("Accepted participant")).toBeNull();
    expect(
      screen.getByText(kind === "optimistic" ? "Loading…" : "You are not registered."),
    ).toBeVisible();
  },
);

it.each(["event", "table"] as const)(
  "explains every unmet planning requirement in the %s status popover",
  async (kind) => {
    const details = summary({
      blockers: [
        "MIN_PLAYERS",
        "PENDING_INVITATIONS",
        "DATE_AGREEMENT",
        "LOCATION_AGREEMENT",
        "GAME_AGREEMENT",
        "COMBINED_AGREEMENT",
      ],
    });
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators
            event={event({ cardSummary: { ready: false, tables: [details] } })}
          />
        ) : (
          <EventTableCardIndicators table={table({ cardSummary: details })} />
        )}
      </Fixture>,
    );
    await open("Planning");
    for (const message of [
      "Confirmation requirements are not yet met.",
      "Not enough eligible players to reach the minimum.",
      "Reserved invitations still need to be accepted.",
      "There is no agreement on a date and time.",
      "There is no agreement on a location.",
      "There is no agreement on a game.",
      "No combination of date, location and game satisfies the same players.",
    ])
      expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText("Table #1") != null).toBe(kind === "event");
    expect(screen.queryByRole("button", { name: /Board games:/ })).toBeNull();
  },
);

it.each(["event", "table"] as const)(
  "shows manager confirmation readiness for a ready %s",
  async (kind) => {
    const details = summary({ ready: true });
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators event={event({ cardSummary: { ready: true, tables: [details] } })} />
        ) : (
          <EventTableCardIndicators table={table({ cardSummary: details })} />
        )}
      </Fixture>,
    );
    await open("Planning");
    expect(screen.getByText("Ready for a manager to confirm.")).toBeVisible();
    expect(screen.getByText("This table is ready for confirmation.")).toBeVisible();
  },
);

it.each(["event", "table"] as const)(
  "keeps missing %s planning facts unknown instead of reporting readiness",
  async (kind) => {
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators event={event()} />
        ) : (
          <EventTableCardIndicators table={table()} />
        )}
      </Fixture>,
    );
    await open("Planning");
    expect(
      screen.getAllByLabelText("Loading…", { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Ready for a manager to confirm.")).toBeNull();
  },
);

it("lists only the viewer's confirmed tables and retains each relevant exclusion explanation", async () => {
  const tables = [
    summary({ confirmedGameName: "Chess", myParticipation: "CONFIRMED", confirmed: true }),
    summary({
      tableId: "second",
      confirmedGameName: "Backgammon",
      order: 1,
      myParticipation: "CONFIRMED",
      confirmed: true,
    }),
    summary({
      tableId: "excluded",
      order: 2,
      myParticipation: "EXCLUDED",
      exclusionReasons: ["GAME_AGREEMENT"],
    }),
    summary({ tableId: "other", order: 3 }),
  ];
  await render(
    <Fixture>
      <EventCardIndicators
        event={event({ status: "CONFIRMED", cardSummary: { ready: true, tables } })}
      />
    </Fixture>,
  );
  await open("Confirmed");
  for (const label of [
    "The event has been confirmed.",
    "Tables where you are confirmed:",
    "Chess",
    "Backgammon",
    "Table #3",
    "Your votes do not agree with the chosen game.",
  ])
    expect(screen.getByText(label)).toBeVisible();
  expect(screen.queryByText("Table #4")).toBeNull();
});

it.each(["event", "table"] as const)(
  "explains every authoritative exclusion reason for an excluded %s",
  async (kind) => {
    const details = summary({
      myParticipation: "EXCLUDED",
      exclusionReasons: [
        "TABLE_EXCLUDED",
        "PENDING_INVITATION",
        "DATE_AGREEMENT",
        "LOCATION_AGREEMENT",
        "GAME_AGREEMENT",
        "NOT_SELECTED",
      ],
    });
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators
            event={event({ status: "CONFIRMED", cardSummary: { ready: false, tables: [details] } })}
          />
        ) : (
          <EventTableCardIndicators
            table={table({ eventStatus: "CONFIRMED", confirmed: frozen, cardSummary: details })}
          />
        )}
      </Fixture>,
    );
    await open("You are excluded");
    for (const message of [
      "The table was excluded from confirmation.",
      "The invitation was not accepted before confirmation.",
      "Your votes do not agree with the chosen date and time.",
      "Your votes do not agree with the chosen location.",
      "Your votes do not agree with the chosen game.",
      "You were not included in the final roster.",
    ])
      expect(screen.getByText(message)).toBeVisible();
  },
);

it.each(["event", "table"] as const)(
  "describes a current %s manager's duty without fabricating a player seat",
  async (kind) => {
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators
            event={event({
              status: "CONFIRMED",
              canManage: true,
              managementRole: "moderator",
              cardSummary: { ready: true, tables: [] },
            })}
          />
        ) : (
          <EventTableCardIndicators
            table={table({
              eventStatus: "CONFIRMED",
              confirmed: { ...frozen, playerIds: ["other", "guest"] },
              canManage: true,
              managementRole: "moderator",
              cardSummary: summary(),
            })}
          />
        )}
      </Fixture>,
    );
    await open("Confirmed");
    expect(screen.getByText("You have an assigned role without a player seat.")).toBeVisible();
    expect(screen.getByText("Moderator")).toBeVisible();
    expect(screen.queryByText("You have a confirmed place at a table.")).toBeNull();
  },
);

it.each(["event", "table"] as const)(
  "keeps a %s observer distinct from current management and participation",
  async (kind) => {
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators
            event={event({ status: "CONFIRMED", cardSummary: { ready: true, tables: [] } })}
          />
        ) : (
          <EventTableCardIndicators
            table={table({
              eventStatus: "CONFIRMED",
              confirmed: { ...frozen, playerIds: ["other", "guest"] },
              cardSummary: summary(),
            })}
          />
        )}
      </Fixture>,
    );
    await open("Confirmed");
    expect(screen.getByText("You are not registered.")).toBeVisible();
  },
);

it("keeps old confirmed event projections pending until authoritative participation arrives", async () => {
  const first = event({ status: "CONFIRMED", myRegistrations: [seat("owner")] });
  const view = await render(
    <Fixture>
      <EventCardIndicators event={first} />
    </Fixture>,
  );
  await open("Confirmed");
  expect(
    screen.getAllByLabelText("Loading…", { includeHiddenElements: true }).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText("Tables where you are confirmed:")).toBeNull();
  await view.rerender(
    <Fixture>
      <EventCardIndicators
        event={{
          ...first,
          cardSummary: {
            ready: true,
            tables: [summary({ confirmed: true, myParticipation: "CONFIRMED" })],
          },
        }}
      />
    </Fixture>,
  );
  expect(screen.getByText("Tables where you are confirmed:")).toBeVisible();
  expect(screen.getByText("Table #1")).toBeVisible();
});

it("distinguishes an excluded table from an excluded person and does not render an unconfirmed schedule", async () => {
  await render(
    <Fixture>
      <EventTableCardIndicators table={table({ eventStatus: "CONFIRMED" })} />
    </Fixture>,
  );
  await open("Table excluded");
  expect(screen.getByText("The table was excluded from confirmation.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Dates and times:/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Locations:/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Board games:/ })).toBeNull();
});

it("shows confirmed personal table counts and reconciles current names without remounting the open popup", async () => {
  const first = table({
    eventStatus: "CONFIRMED",
    confirmed: frozen,
    demonstratorUserId: "guide",
    acceptedCount: 3,
    waitingCount: 2,
    pendingRegistrationCount: 1,
    cardSummary: summary({ confirmed: true, myParticipation: "CONFIRMED" }),
  });
  const view = await render(
    <Fixture>
      <EventTableCardIndicators table={first} />
    </Fixture>,
  );
  await open("Confirmed");
  expect(screen.getByText("You have a confirmed place at a table.")).toBeVisible();
  for (const label of [
    "Minimum players",
    "Maximum players",
    "Accepted players",
    "Waiting list",
    "Unconfirmed players",
  ])
    expect(screen.getByText(label)).toBeVisible();
  expect(screen.getByText("Demonstrator: Loading…")).toBeVisible();
  await view.rerender(
    <Fixture>
      <EventTableCardIndicators table={{ ...first, demonstratorName: "Current guide" }} />
    </Fixture>,
  );
  expect(screen.getByText("Demonstrator: Current guide")).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "Dates and times: Chess",
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Board games: Chess", includeHiddenElements: true }),
  ).toBeTruthy();
});

it.each([null, ""])("keeps a nameless demonstrator explicit (%j)", async (demonstratorName) => {
  await render(
    <Fixture>
      <EventTableCardIndicators table={table({ demonstratorUserId: "guide", demonstratorName })} />
    </Fixture>,
  );
  await open("Planning");
  expect(screen.getByText("Demonstrator: Unknown")).toBeVisible();
});

it.each(["event", "table"] as const)(
  "renders terminated %s winners with normalized handles and without live counts",
  async (kind) => {
    const result = summary({
      confirmed: true,
      winners: [
        { userId: "a", username: "@alice" },
        { userId: "b", username: "bob" },
        { userId: "c", username: null },
        ...(kind === "table" ? [{ userId: "guest", username: null, guestName: "Guest" }] : []),
      ],
    });
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators
            event={event({
              status: "TERMINATED",
              cardSummary: {
                ready: true,
                tables: [
                  result,
                  summary({
                    tableId: "excluded",
                    name: "Never confirmed",
                    winners: [{ userId: "x", username: "excluded" }],
                  }),
                ],
              },
            })}
          />
        ) : (
          <EventTableCardIndicators
            table={table({ eventStatus: "TERMINATED", confirmed: frozen, cardSummary: result })}
          />
        )}
      </Fixture>,
    );
    await open("Terminated");
    expect(screen.queryByText("Never confirmed")).toBeNull();
    expect(screen.queryByText("@excluded")).toBeNull();
    expect(screen.queryByText("Accepted players")).toBeNull();
    if (kind === "event") {
      const winners = screen.getByText("@alice, @bob, Username unavailable");
      expect(winners).toBeVisible();
      const name = screen.getByText("Table #1");
      expect(name).toBeVisible();
      expect(winners.parent?.parent).toBe(name.parent);
      expect(name.parent).toHaveStyle({ flexDirection: "row", flexWrap: "wrap" });
      const glyph = nativeGlyphs(winners.parent ?? undefined)[0];
      expect(glyph).toHaveStyle({ flexShrink: 0 });
      nativeStroke(glyph);
    } else {
      expect(screen.queryByText("Table #1")).toBeNull();
      expect(screen.getByText("The game has ended.")).toBeVisible();
      const heading = screen.getByText("Winners");
      const glyph = nativeGlyphs(heading.parent ?? undefined)[0];
      expect(glyph).toHaveStyle({ flexShrink: 0 });
      nativeStroke(glyph);
      const rows = ["@alice", "@bob", "Username unavailable", "Guest"].map((label) =>
        screen.getByText(label),
      );
      for (const row of rows) {
        expect(row).toBeVisible();
        expect(row.parent).toBe(heading.parent?.parent);
      }
    }
  },
);

it.each([true, false])(
  "renders the localized finished Table result with winner=%s",
  async (won) => {
    await render(
      <Fixture locale="it">
        <EventTableCardIndicators
          table={table({
            eventStatus: "TERMINATED",
            confirmed: frozen,
            cardSummary: summary({ winners: won ? [{ userId: "a", username: "alice" }] : [] }),
          })}
        />
      </Fixture>,
    );
    for (const name of [/^Date e Orari:/, /^Luoghi:/, /^Giochi da tavolo:/])
      expect(screen.queryByRole("button", { name })).toBeNull();
    await open("Terminata");
    expect(screen.getByText("La partita è terminata.")).toBeVisible();
    expect(screen.getByText(won ? "Vincitore" : "Nessun vincitore.")).toBeVisible();
    expect(screen.queryByText("@alice") !== null).toBe(won);
  },
);

it.each(["event", "table"] as const)(
  "keeps terminated %s results loading when no authorized summary is cached",
  async (kind) => {
    await render(
      <Fixture>
        {kind === "event" ? (
          <EventCardIndicators event={event({ status: "TERMINATED" })} />
        ) : (
          <EventTableCardIndicators
            table={table({ eventStatus: "TERMINATED", confirmed: frozen })}
          />
        )}
      </Fixture>,
    );
    await open("Terminated");
    expect(screen.getByLabelText("Loading…", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText("No winners.")).toBeNull();
  },
);

it.each(["planning", "exclusions", "results", "confirmed"] as const)(
  "makes an empty %s table summary explicit",
  async (mode) => {
    await render(
      <Fixture>
        <EventCardTableSummaries tables={[]} mode={mode} />
      </Fixture>,
    );
    expect(
      screen.getByText(
        mode === "results"
          ? "No winners."
          : mode === "confirmed"
            ? "No tables found"
            : "No tables are ready for confirmation.",
      ),
    ).toBeVisible();
  },
);

it("keeps a confirmed table without winner names explicit", async () => {
  await render(
    <Fixture>
      <EventCardTableSummaries tables={[summary({ confirmed: true })]} mode="results" />
    </Fixture>,
  );
  expect(screen.getByText("Table #1")).toBeVisible();
  expect(screen.getByText("No winners.")).toBeVisible();
  expect(nativeGlyphs()).toHaveLength(0);
});

it.each([
  {
    planningMode: "MANUAL",
    playerPreference: "MORE_PLAYERS",
    text: "Managers arrange seats and the waiting list. Confirmation requirements still apply.",
    preference: "Prefers the solution that seats more people, respecting votes and constraints.",
    reduction: false,
  },
  {
    planningMode: "ASSISTED",
    playerPreference: "BEST",
    text: "The app seeks compatible players, dates, locations and games. A manager must still confirm.",
    preference: "Prefers the player count marked Best on BGG.",
    reduction: true,
  },
] as const)(
  "explains $planningMode / $playerPreference without changing planning settings",
  async (choice) => {
    await render(
      <Fixture>
        <EventCardIndicators
          event={event({
            planningMode: choice.planningMode,
            playerPreference: choice.playerPreference,
            allowBestReduction: true,
          })}
        />
      </Fixture>,
    );
    await open("Settings");
    expect(
      screen.getByText(new RegExp(choice.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    ).toBeVisible();
    expect(
      screen.getByText(new RegExp(choice.preference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "Assisted planning may seat fewer players to improve the BGG recommendation.",
      ) != null,
    ).toBe(choice.reduction);
  },
);

it.each(["sharedResultsOnly", "personalAccessOnly"] as const)(
  "does not expose event settings through a $0 projection",
  async (key) => {
    await render(
      <Fixture>
        <EventCardIndicators event={event({ [key]: true })} />
      </Fixture>,
    );
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  },
);

it.each(["PRIVATE", "PUBLIC"] as const)("explains %s event enrollment", async (visibility) => {
  await render(
    <Fixture>
      <EventCardIndicators event={event({ visibility, groupType: "PUBLIC" })} />
    </Fixture>,
  );
  await open(visibility === "PUBLIC" ? "Public event" : "Private event");
  expect(
    screen.getByText(
      visibility === "PUBLIC"
        ? "Authenticated users can enroll without joining the group."
        : "Participation is limited to authorized group members or invited users.",
    ),
  ).toBeVisible();
});

it.each([true, false])("explains rating eligibility when enabled=%s", async (enabled) => {
  await render(
    <Fixture>
      <EventTableCardIndicators table={table({ rankingEnabled: enabled })} />
    </Fixture>,
  );
  await open(enabled ? "Rating enabled" : "Rating disabled");
  expect(
    screen.getByText(
      enabled
        ? "This table contributes to player ratings when eligible results are finalized."
        : "This table does not update player ratings.",
    ),
  ).toBeVisible();
});

it.each([
  ["admin", "Admin", "You administer this item."],
  ["moderator", "Moderator", "Your current permissions allow managing this item."],
  ["accepted", "Accepted member", "You are a member of this group."],
  ["invited", "Member with pending invitation", "You have received an invitation."],
  ["requested", "Member with pending request", "Your request is awaiting approval."],
] as const)(
  "shows the current %s group role with the real role popover",
  async (role, label, message) => {
    await render(
      <Fixture>
        <GroupCardIndicators group={{ ...groupRecord, role }} />
      </Fixture>,
    );
    await open(label);
    expect(screen.getByText(message)).toBeVisible();
  },
);

it("does not invent a group role for an unrelated viewer", async () => {
  await render(
    <Fixture>
      <GroupCardIndicators group={{ ...groupRecord, role: "none" }} />
    </Fixture>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  await open("Private");
  expect(screen.getByText("Private groups are invitation-only.")).toBeVisible();
  expect(screen.getByText("1 Member")).toBeVisible();
  expect(screen.getByText("0 Events")).toBeVisible();
});

it.each([
  {
    reviewStatus: "PENDING",
    label: "Awaiting review",
    message: "This public group is awaiting review.",
  },
  { reviewStatus: "REJECTED", label: "Changes rejected", message: "These changes were rejected." },
  { reviewStatus: undefined, label: "Approved", message: "This public group is approved." },
] as const)(
  "renders public group review $reviewStatus without losing the authoritative message",
  async ({ reviewStatus, label, message }) => {
    const group: ClientGroupRecord = {
      ...groupRecord,
      type: "PUBLIC",
      reviewStatus,
      rejectionReason: "Please correct the venue",
    };
    await render(
      <Fixture>
        <GroupCardIndicators group={group} />
      </Fixture>,
    );
    await open(label);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText("Please correct the venue") != null).toBe(
      reviewStatus === "REJECTED",
    );
    expect(
      screen.queryByText("Approved information remains visible while changes are reviewed.") !=
        null,
    ).toBe(reviewStatus === "PENDING");
  },
);

it.each(["saving", "verifying", "failed"] as const)(
  "keeps optimistic group %s metadata, withholding role/review claims",
  async (phase) => {
    await render(
      <Fixture>
        <GroupCardIndicators
          group={{ ...groupRecord, type: "PUBLIC", optimistic: { draftId: "draft", phase } }}
        />
      </Fixture>,
    );
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approved" })).toBeNull();
    await open("Public");
    expect(screen.getByText("Public groups accept membership requests.")).toBeVisible();
    expect(screen.getByText("1 Member")).toBeVisible();
  },
);

it("reconciles table authority across account contexts without granting a former user's demonstrator role", async () => {
  const record = table({
    eventStatus: "CONFIRMED",
    confirmed: frozen,
    readOnly: true,
    personalAccessOnly: true,
    demonstratorUserId: "owner",
    cardSummary: summary(),
  });
  const view = await render(
    <Fixture>
      <EventTableCardIndicators table={record} />
    </Fixture>,
  );
  await open("Roles and participation");
  expect(screen.getByText("Demonstrator")).toBeVisible();
  expect(screen.getByText("Your roles at this table:")).toBeVisible();
  await view.rerender(
    <Fixture userId="other-account">
      <EventTableCardIndicators table={record} />
    </Fixture>,
  );
  expect(screen.queryByText("Demonstrator")).toBeNull();
  expect(screen.queryByText("Your roles at this table:")).toBeNull();
  expect(screen.getByText("You are not registered.")).toBeVisible();
});

it("retains a confirmed player role from an authorized personal projection without exposing management", async () => {
  await render(
    <Fixture>
      <EventTableCardIndicators
        table={table({
          eventStatus: "CONFIRMED",
          confirmed: frozen,
          readOnly: true,
          canManage: true,
          managementRole: "admin",
          cardSummary: summary({ myParticipation: "CONFIRMED", confirmed: true }),
        })}
      />
    </Fixture>,
  );
  await open("Roles and participation");
  expect(screen.getByText("Confirmed player")).toBeVisible();
  expect(screen.queryByText("Admin")).toBeNull();
});

it("keeps old table count projections partial until current server facts arrive", async () => {
  const first = table({
    acceptedCount: undefined,
    pendingRegistrationCount: undefined,
    cardSummary: summary(),
  });
  const view = await render(
    <Fixture>
      <EventTableCardIndicators table={first} />
    </Fixture>,
  );
  await open("Planning");
  expect(screen.getAllByLabelText("Loading…", { includeHiddenElements: true })).toHaveLength(2);
  await view.rerender(
    <Fixture>
      <EventTableCardIndicators
        table={{ ...first, acceptedCount: 3, waitingCount: 2, pendingRegistrationCount: 1 }}
      />
    </Fixture>,
  );
  expect(screen.queryByLabelText("Loading…", { includeHiddenElements: true })).toBeNull();
  expect(screen.getByText("3")).toBeVisible();
  expect(screen.getByText("1")).toBeVisible();
});

it("explains group pending invitation consent separately from read attention", async () => {
  const invited: ClientGroupRecord = {
    ...groupRecord,
    role: "invited",
    myMembership: {
      id: "44444444-4444-4444-8444-444444444444",
      groupId: groupRecord.id,
      userId: "owner",
      kind: "INVITATION",
      status: "PENDING",
      version: 1,
      createdAt: plannedEvent.createdAt,
      updatedAt: plannedEvent.updatedAt,
    },
  };
  await render(
    <Fixture>
      <GroupCardIndicators group={invited} />
    </Fixture>,
  );
  await open("Member with pending invitation · Reply required");
  expect(screen.getByText("You have received an invitation.")).toBeVisible();
  expect(screen.getByText("Open details to accept or decline your invitation.")).toBeVisible();
});

it("shows group membership requests as explicit manager decisions", async () => {
  await render(
    <Fixture>
      <GroupCardIndicators group={{ ...groupRecord, pendingRequestCount: 2 }} />
    </Fixture>,
  );
  await open("Admin · Requests to review");
  expect(screen.getByText("Open Members to approve or reject membership requests.")).toBeVisible();
});

it("shows public group review as pending without approved data, withholding inaccessible event totals", async () => {
  await render(
    <Fixture>
      <GroupCardIndicators
        group={{
          ...groupRecord,
          type: "PUBLIC",
          approved: undefined,
          canViewEvents: false,
          eventCount: null,
          location: plannedEvent.locations[0],
        }}
      />
    </Fixture>,
  );
  await open("Awaiting review");
  expect(screen.getByText("This public group is awaiting review.")).toBeVisible();
  expect(
    screen.queryByText("Approved information remains visible while changes are reviewed."),
  ).toBeNull();
});

it("formats accessible group totals and location without claiming unknown event access", async () => {
  await render(
    <Fixture>
      <GroupCardIndicators
        group={{
          ...groupRecord,
          canViewEvents: false,
          eventCount: null,
          memberCount: 2,
          location: plannedEvent.locations[0],
        }}
      />
    </Fixture>,
  );
  await open("Private");
  expect(screen.getByText("2 Members")).toBeVisible();
  expect(screen.getByText("Via Roma 1")).toBeVisible();
  expect(screen.queryByText("0 Events")).toBeNull();
});

it("retains an older frozen event registration without inventing the detailed table summary", async () => {
  const first = event({
    status: "CONFIRMED",
    myRegistrations: [{ ...seat("owner"), position: "FROZEN" }],
  });
  await render(
    <Fixture>
      <EventCardIndicators event={first} />
    </Fixture>,
  );
  await open("Confirmed");
  expect(screen.getByText("The event has been confirmed.")).toBeVisible();
  expect(screen.getAllByLabelText("Loading…", { includeHiddenElements: true })).not.toHaveLength(0);
  expect(screen.queryByText("Tables where you are confirmed:")).toBeNull();
});

it("does not fabricate an exclusion reason when an older frozen table lacks the authoritative summary", async () => {
  await render(
    <Fixture>
      <EventTableCardIndicators
        table={table({
          eventStatus: "CONFIRMED",
          confirmed: { ...frozen, playerIds: ["another-player"] },
          myRegistration: seat("owner"),
        })}
      />
    </Fixture>,
  );
  await open("You are excluded");
  expect(screen.getAllByLabelText("Loading…", { includeHiddenElements: true })).not.toHaveLength(0);
  expect(screen.queryByText("You were not included in the final roster.")).toBeNull();
});
