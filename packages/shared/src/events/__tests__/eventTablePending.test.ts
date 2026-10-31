import type { TableSeatResponse } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { pendingInvitationPlaces, pendingParticipationPlaces } from "../eventTablePending";
import type { EventTablePlace } from "../eventTableRoster";

const player: EventTablePlace = {
  key: "registration",
  kind: "player",
  user: { userId: "known" } as TableSeatResponse,
};
const reserved: EventTablePlace = { key: "reserved", kind: "reserved", queue: false };
const free: EventTablePlace = { key: "free", kind: "empty", queue: false };
const queue: EventTablePlace = { key: "queue", kind: "empty", queue: true };

describe("sending invitation places, not server seats", () => {
  it("deduplicates canonical users including source rows outside the current render page", () => {
    const rows = [player, reserved, free];
    expect(
      pendingInvitationPlaces(
        rows,
        [
          { key: "old", userId: "known" },
          { key: "outside", userId: "paged" },
        ],
        ["paged"],
      ),
    ).toEqual(rows);
    expect(pendingInvitationPlaces(rows, [])).toEqual(rows);
    expect(pendingInvitationPlaces([], [])).toEqual([]);
  });
  it("pins the latest known profile without fabricating registration, priority, seat or consent", () => {
    const rows = [player, reserved, free];
    const result = pendingInvitationPlaces(rows, [
      {
        key: "old",
        userId: "guest",
        person: { name: "Before", username: "before", avatarUrl: null },
      },
      {
        key: "sending:2",
        userId: "guest",
        person: { name: "Guest", username: "guest", avatarUrl: "https://images.test/avatar" },
      },
    ]);
    expect(result).toEqual([
      {
        key: "sending:2",
        kind: "pending",
        userId: "guest",
        name: "Guest",
        avatarUrl: "https://images.test/avatar",
      },
      ...rows,
    ]);
    expect(result[0]).not.toHaveProperty("registrationId");
    expect(result[0]).not.toHaveProperty("priorityAt");
    expect(result[0]).not.toHaveProperty("sequence");
    expect(result[0]).not.toHaveProperty("position");
    expect(result[0]).not.toHaveProperty("status");
    expect(rows).toEqual([player, reserved, free]);
  });
  it("keeps existing reservations and the join-queue action, replacing only surplus free placeholders", () => {
    const extra: EventTablePlace = { key: "free:2", kind: "empty", queue: false };
    const rows = [player, reserved, free, extra, queue];
    const result = pendingInvitationPlaces(rows, [
      { key: "sending:1", userId: "guest" },
      { key: "sending:2", userId: "other" },
    ]);
    expect(result.filter((row) => row.kind === "pending")).toHaveLength(2);
    expect(result).toContainEqual(reserved);
    expect(result).toContainEqual(queue);
    expect(result.filter((row) => row.kind === "empty" && !row.queue)).toHaveLength(1);
    expect(
      pendingInvitationPlaces([player, queue], [{ key: "sending", userId: "guest" }]),
    ).toContainEqual(queue);
  });
  it("uses only the selected known name, username or Clerk ID fallback", () => {
    const rows = pendingInvitationPlaces(
      [],
      [
        {
          key: "one",
          userId: "one",
          person: { name: null, username: "Known username", avatarUrl: null },
        },
        { key: "two", userId: "two", person: { name: "", username: null, avatarUrl: null } },
        { key: "three", userId: "three" },
      ],
    );
    expect(rows).toMatchObject([
      { name: "Known username", avatarUrl: null },
      { name: "two", avatarUrl: null },
      { name: "three", avatarUrl: null },
    ]);
  });
  it("shows explicit self-consent, never an accepted seat, replacing only the actor's prior pending row", () => {
    const own: EventTablePlace = {
      key: "own",
      kind: "player",
      user: {
        ...player.user,
        userId: "owner",
        name: "Owner",
        username: "owner",
        avatarUrl: "https://images.test/owner",
        status: "PENDING",
      },
    };
    const rows = [own, player, reserved, free, queue];
    const changed = pendingParticipationPlaces(
      rows,
      { key: "joining:1", action: "accept", phase: "saving" },
      "owner",
      false,
    );
    expect(changed).toEqual([
      {
        key: "joining:1",
        kind: "pending",
        action: "accept",
        phase: "saving",
        userId: "owner",
        name: "Owner",
        avatarUrl: "https://images.test/owner",
      },
      player,
      reserved,
      free,
      queue,
    ]);
    for (const field of ["id", "registrationId", "status", "position", "sequence", "priorityAt"])
      expect(changed[0]).not.toHaveProperty(field);
    expect(rows[0]).toBe(own);
  });
  it("uses only the actor's known profile or the UI's self label while a cold roster verifies", () => {
    expect(
      pendingParticipationPlaces(
        [player, reserved, free],
        { key: "joining:1", action: "join", phase: "verifying" },
        "owner",
        false,
      )[0],
    ).toMatchObject({
      userId: "owner",
      name: "",
      avatarUrl: null,
      action: "join",
      phase: "verifying",
    });
    for (const username of ["owner", null]) {
      const own: EventTablePlace = {
        key: "own",
        kind: "player",
        user: { ...player.user, userId: "owner", name: null, username, avatarUrl: null },
      };
      expect(
        pendingParticipationPlaces(
          [own],
          { key: "joining:1", action: "accept", phase: "saving" },
          "owner",
          false,
        )[0],
      ).toMatchObject({ name: username ?? "", avatarUrl: null });
    }
  });
  it("uses a matching canonical cached self profile before any registration exists, never another actor's profile", () => {
    const intent = { key: "joining:1", action: "join" as const, phase: "saving" as const },
      profile = { id: "owner", name: "Mario Rossi", avatarUrl: "https://images.test/mario" };
    expect(pendingParticipationPlaces([free], intent, "owner", false, profile)[0]).toMatchObject({
      kind: "pending",
      name: "Mario Rossi",
      avatarUrl: profile.avatarUrl,
    });
    expect(
      pendingParticipationPlaces([free], intent, "owner", false, { ...profile, id: "foreign" })[0],
    ).toMatchObject({ name: "", avatarUrl: null });
    const own: EventTablePlace = {
      key: "own",
      kind: "player",
      user: { ...player.user, userId: "owner", name: null, avatarUrl: null },
    };
    expect(pendingParticipationPlaces([own], intent, "owner", false, profile)[0]).toMatchObject({
      name: "Mario Rossi",
      avatarUrl: profile.avatarUrl,
    });
  });
  it("hands off only to authoritative accepted roster data and drops definite rejected/superseded or foreign-owner intents", () => {
    const rows = [player, reserved, free],
      intent = { key: "joining:1", action: "join" as const, phase: "saving" as const };
    expect(pendingParticipationPlaces(rows, undefined, "owner", false)).toEqual(rows);
    expect(pendingParticipationPlaces(rows, intent, undefined, false)).toEqual(rows);
    expect(
      pendingParticipationPlaces(rows, { ...intent, phase: undefined }, "owner", false),
    ).toEqual(rows);
    expect(
      pendingParticipationPlaces(rows, { ...intent, phase: "failed" }, "owner", false),
    ).toEqual(rows);
    expect(pendingParticipationPlaces(rows, intent, "owner", true)).toEqual(rows);
  });
});
