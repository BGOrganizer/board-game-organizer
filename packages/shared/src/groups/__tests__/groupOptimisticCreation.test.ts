import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { type GroupCreationIntent, groupCreationRecord } from "../groupOptimisticCreation";

const cid = "11111111-1111-4111-8111-111111111111";
const intent: GroupCreationIntent = {
  draftId: "1",
  submittedAt: Date.parse("2030-01-01T12:00:00Z"),
  status: "pending",
  error: null,
  variables: { type: "PRIVATE", name: "Friday group", invitedUserIds: [], clientRequestId: cid },
};

describe("provisional Group creation", () => {
  it("shows private requested fields without fabricating approved access or an API ID", () => {
    const row = groupCreationRecord(intent, "owner");
    expect(row).toMatchObject({
      id: `optimistic:${cid}`,
      clientRequestId: cid,
      name: "Friday group",
      type: "PRIVATE",
      approved: { name: "Friday group" },
      memberCount: 1,
      eventCount: null,
      myMembership: null,
      role: "admin",
      logo: null,
      reservedNames: [],
      optimistic: { draftId: "1", phase: "saving" },
    });
    expect([
      row.canEdit,
      row.canInvite,
      row.canViewEvents,
      row.canViewMembers,
      row.canViewRankings,
      row.canSocialInteract,
    ]).toEqual(Array(6).fill(false));
    expect(row).not.toHaveProperty("proposal");
    expect(
      groupCreationRecord(
        { ...intent, variables: { ...intent.variables, clientRequestId: undefined } },
        "owner",
      ).id,
    ).toBe("optimistic:1");
  });
  it("keeps public proposal, known local artwork/venue and failure status separate from approval", () => {
    const location = {
      id: cid,
      name: "Club",
      address: "Via Roma 1",
      latitude: 41.9,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    };
    const variables = {
      ...intent.variables,
      type: "PUBLIC" as const,
      logoAssetId: cid,
      location,
      clientDraft: { logoPreview: "https://images.test/logo.webp" },
    };
    const row = groupCreationRecord(
      {
        ...intent,
        variables,
        status: "error",
        error: Object.assign(new Error("Rejected"), { status: 409 }),
      },
      "owner",
    );
    expect(row).toMatchObject({
      proposal: { name: variables.name, logoAssetId: cid, location },
      reviewStatus: "PENDING",
      logoAssetId: cid,
      location,
      logo: variables.clientDraft.logoPreview,
      reservedNames: [variables.name],
      optimistic: { phase: "failed" },
    });
    expect(row).not.toHaveProperty("approved");
    expect(row.canViewEvents).toBe(false);
  });
  it("uses only a real response for canonical ID/version/permissions while list synchronization continues", () => {
    const { optimistic: _client, ...base } = groupCreationRecord(intent, "owner");
    const receipt: GroupRecordResponse = {
      ...base,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Canonical group",
      canEdit: true,
      version: 2,
    };
    expect(
      groupCreationRecord(
        { ...intent, context: { receipt, operation: { uncertain: true } } },
        "owner",
      ),
    ).toEqual({ ...receipt, optimistic: { draftId: "1", phase: "verifying" } });
  });
});
