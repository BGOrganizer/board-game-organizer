import {
  type NotificationChangeRow,
  type NotificationChangesPage,
  type NotificationChangesScope,
  notificationItemId,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  notificationChangesWindow,
  projectNotificationChanges,
  sameNotificationChange,
} from "../notificationChangeProjection";
import {
  displayedNotificationReferences,
  notificationChangeFieldTabs,
  notificationChangeMessage,
  notificationChangeTab,
} from "../notificationChanges";
import { projectNotificationItemRead } from "../notificationItemRead";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const scope = (kind: NotificationChangesScope["kind"]): NotificationChangesScope => ({
  kind,
  id,
  tab: "details",
});
const reference = {
  notificationId: "111111111111111111111111",
  effectiveAt: "2026-01-01T00:00:00.000Z",
};
const row: NotificationChangeRow = {
  ...reference,
  messageCode: "information",
  requiresResponse: false,
  readReference: reference,
};
const page = (changes = [row]): NotificationChangesPage => ({
  asOf: reference.effectiveAt,
  changes,
  nextCursor: null,
  tabCounts: { details: 1, members: 0, tables: 0, participants: 0 },
});

describe("notificationChanges canonical classification", () => {
  it("classifies every supported canonical field independently of old section metadata", () => {
    for (const kind of ["group", "event", "table"] as const) {
      for (const [field, tab] of Object.entries(notificationChangeFieldTabs[kind])) {
        expect(
          notificationChangeTab(
            scope(kind),
            "event_updated",
            JSON.stringify([kind, id, field, null]),
          ),
        ).toBe(tab);
      }
    }
    expect(
      notificationChangeTab(
        scope("group"),
        "group_membership_updated",
        notificationItemId(id, "overview", undefined, "group"),
      ),
    ).toBe("details");
    expect(
      notificationChangeTab(scope("table"), "event_updated", notificationItemId(other, "game", 1)),
    ).toBeNull();
    expect(
      notificationChangeTab(scope("table"), "event_updated", notificationItemId(id, "date", other)),
    ).toBeNull();
    expect(
      notificationChangeTab(
        scope("table"),
        "event_updated",
        JSON.stringify(["table", id, "unknown", null]),
      ),
    ).toBeNull();
    expect(notificationChangeTab(scope("table"), "event_updated", "broken")).toBeNull();
  });
  it("puts all Table participation only under Participants and never invents SELF approval", () => {
    for (const kind of [
      "table_invitation",
      "event_booking_requested",
      "event_booking_confirmed",
      "event_booking_removed",
      "event_demonstrator",
    ])
      expect(notificationChangeTab(scope("table"), kind)).toBe("participants");
    // Invited users cannot open Members: their invitation must remain in Details.
    expect(notificationChangeTab(scope("group"), "group_invitation")).toBe("details");
    expect(
      notificationChangeTab(
        scope("group"),
        "group_invitation",
        notificationItemId(id, "invitation", undefined, "group"),
      ),
    ).toBe("details");
    for (const kind of [
      "group_membership_requested",
      "group_membership_updated",
      "group_invitation_accepted",
    ])
      expect(notificationChangeTab(scope("group"), kind)).toBe("members");
    expect(notificationChangeTab(scope("event"), "event_booking_confirmed")).toBe("participants");
    expect(notificationChangeTab(scope("group"), "group_reviewed")).toBe("details");
    expect(notificationChangeTab(scope("table"), "event_updated")).toBe("details");
  });
  it("uses only truthful persisted categories, not translated descriptions or invented old/new labels", () => {
    for (const field of [
      "date",
      "dates",
      "location",
      "locations",
      "game",
      "games",
      "tables",
      "invitation",
    ] as const)
      expect(
        notificationChangeMessage(
          scope("event"),
          "event_updated",
          JSON.stringify(["event", id, field, null]),
        ),
      ).toBe(field);
    for (const field of ["member", "members"])
      expect(
        notificationChangeMessage(
          scope("group"),
          "group_membership_updated",
          JSON.stringify(["group", id, field, null]),
        ),
      ).toBe("member_update");
    expect(
      notificationChangeMessage(
        scope("table"),
        "event_updated",
        notificationItemId(id, "overview", undefined, "table"),
      ),
    ).toBe("table_settings");
    expect(
      notificationChangeMessage(
        scope("group"),
        "group_membership_updated",
        notificationItemId(id, "overview", undefined, "group"),
      ),
    ).toBe("group_info");
    expect(
      notificationChangeMessage(
        scope("event"),
        "event_updated",
        notificationItemId(id, "overview"),
      ),
    ).toBe("information");
    for (const [kind, message] of [
      ["table_invitation", "invitation"],
      ["event_booking_confirmed", "participation"],
      ["group_membership_updated", "member_update"],
      ["group_invitation_accepted", "member_update"],
      ["event_proposal_created", "proposal"],
      ["group_reviewed", "review"],
      ["event_confirmed", "event_confirmed"],
      ["group_banned", "group_info"],
      ["event_updated", "information"],
    ])
      expect(
        notificationChangeMessage(scope(kind.startsWith("group") ? "group" : "table"), kind),
      ).toBe(message);
  });
});

describe("notificationChanges captured display projection", () => {
  it("omits protected invitations and preserves exact revisions, later changes, hidden pages and authoritative counters", () => {
    const protectedRow = { ...row, requiresResponse: true };
    const revised = { ...row, revision: 2, readReference: { ...reference, revision: 2 } };
    const later = {
      ...row,
      effectiveAt: "2026-01-02T00:00:00.000Z",
      readReference: { ...reference, effectiveAt: "2026-01-02T00:00:00.000Z" },
    };
    const data = { pages: [page([row, protectedRow, revised, later])], pageParams: [undefined] };
    expect(displayedNotificationReferences([row, protectedRow])).toEqual([reference]);
    const result = projectNotificationChanges(data, [reference]) as typeof data;
    expect(result.pages[0].changes).toEqual([protectedRow, revised, later]);
    expect(result.pages[0].tabCounts).toBe(data.pages[0].tabCounts);
    expect(projectNotificationChanges(undefined, [reference])).toBeUndefined();
    expect(
      sameNotificationChange(reference, {
        ...reference,
        notificationId: "222222222222222222222222",
      }),
    ).toBe(false);
    expect(
      sameNotificationChange(reference, {
        ...reference,
        itemId: notificationItemId(id, "overview"),
      }),
    ).toBe(false);
  });
  it("iterates only the bounded revealed window, not all retained pages", () => {
    const pages = Array.from({ length: 10 }, (_, index) =>
      page([{ ...row, notificationId: String(index) }]),
    );
    Object.defineProperty(pages, 0, {
      get: () => {
        throw new Error("hidden retained page visited");
      },
    });
    expect(notificationChangesWindow(pages, 9).map((value) => value.notificationId)).toEqual([
      "7",
      "8",
      "9",
    ]);
    expect(notificationChangesWindow([], 0)).toEqual([]);
    expect(notificationChangesWindow([page(), page()], 0)).toEqual([row]);
    expect(
      notificationChangesWindow([page(Array.from({ length: 50 }, () => row)), page()], 1),
    ).toHaveLength(50);
  });
});

describe("notificationChanges decision reconciliation", () => {
  it("keeps protected rows for informational reads but projects explicit invitation decisions in every owned cached tab", () => {
    const invitationId = notificationItemId(id, "invitation", undefined, "table");
    const invitation = {
      ...row,
      itemId: invitationId,
      requiresResponse: true,
      readReference: { ...reference, itemId: invitationId },
    };
    const data = {
      pages: [
        {
          ...page([invitation]),
          tabCounts: { details: 0, members: 0, tables: 0, participants: 1 },
        },
      ],
      pageParams: [undefined],
    };
    const source = {
      target: { kind: "item" as const, id: invitationId },
      count: 1,
      direct: 1,
      events: 0,
      sections: { connections: 0, requests: 0, search: 0 },
      readEffect: {
        unread: 1,
        summary: {
          tables: 1,
          events: 0,
          groups: 0,
          contacts: 0,
          sections: { connections: 0, requests: 0, search: 0 },
        },
        targets: [],
      },
    };
    const key = ["notification-changes", "api", "user", "table", id];
    expect(
      projectNotificationItemRead(data, key, source, reference.effectiveAt, reference.effectiveAt),
    ).toBe(data);
    const read = projectNotificationItemRead(
      data,
      key,
      source,
      reference.effectiveAt,
      reference.effectiveAt,
      true,
    ) as typeof data;
    expect(read.pages[0].changes).toEqual([]);
    expect(read.pages[0].tabCounts.participants).toBe(0);
    expect(
      (
        projectNotificationItemRead(
          data,
          [...key.slice(0, 4), other],
          source,
          reference.effectiveAt,
          reference.effectiveAt,
          true,
        ) as typeof data
      ).pages[0].tabCounts.participants,
    ).toBe(1);
    const later = {
      ...data,
      pages: [
        {
          ...data.pages[0],
          asOf: "2026-01-02T00:00:00.000Z",
          changes: [{ ...invitation, effectiveAt: "2026-01-02T00:00:00.000Z" }],
        },
      ],
    };
    expect(
      (
        projectNotificationItemRead(
          later,
          key,
          source,
          reference.effectiveAt,
          reference.effectiveAt,
          true,
        ) as typeof later
      ).pages[0],
    ).toEqual(later.pages[0]);
    expect(
      projectNotificationItemRead(
        data,
        key,
        { ...source, target: { kind: "table", id } },
        reference.effectiveAt,
        reference.effectiveAt,
        true,
      ),
    ).toBe(data);
  });
});

it.each([
  "event_agreement_ready",
  "event_agreement_blocked",
  "event_confirmed",
  "event_replanning",
  "event_terminated",
  "event_cancelled",
])("preserves the specific Event state %s even for an overview change", (kind) => {
  const s = { kind: "event", id: "11111111-1111-4111-8111-111111111111", tab: "details" } as const;
  expect(notificationChangeMessage(s, kind)).toBe(kind);
  expect(notificationChangeMessage(s, kind, notificationItemId("event", s.id, "overview"))).toBe(
    kind,
  );
});
