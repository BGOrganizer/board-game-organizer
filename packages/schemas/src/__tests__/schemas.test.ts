import { describe, expect, it } from "vitest";
import {
  blockParamsSchema,
  cancelFriendRequestParamsSchema,
  claimInviteParamsSchema,
  createInviteParamsSchema,
  followParamsSchema,
  friendsParamsSchema,
  INVITE_TTL_DAYS,
  limitSchema,
  listParamsSchema,
  presenceUpdateParamsSchema,
  respondFriendRequestParamsSchema,
  searchContactsParamsSchema,
  sendFriendRequestParamsSchema,
  targetUserIdSchema,
  unfriendParamsSchema,
} from "../index";

describe("targetUserIdSchema", () => {
  it("accepts a Clerk user id", () => {
    expect(targetUserIdSchema.parse("user_2abc")).toBe("user_2abc");
  });

  it("rejects empty and whitespace-only ids", () => {
    expect(targetUserIdSchema.safeParse("").success).toBe(false);
    expect(targetUserIdSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(targetUserIdSchema.safeParse(42).success).toBe(false);
  });
});

describe("listParamsSchema / limitSchema", () => {
  it("defaults the limit to 20 and accepts a cursor", () => {
    const parsed = listParamsSchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.cursor).toBeUndefined();
  });

  it("caps the limit at 50 and floors it at 1", () => {
    expect(limitSchema.parse(99)).toBe(50);
    expect(limitSchema.parse(0)).toBe(1);
    expect(limitSchema.parse(-5)).toBe(1);
  });

  it("rejects non-integer limits", () => {
    expect(limitSchema.safeParse(2.5).success).toBe(false);
  });
});

describe("searchContactsParamsSchema", () => {
  it("accepts a valid query with defaults", () => {
    const parsed = searchContactsParamsSchema.parse({ query: "alessandro" });
    expect(parsed.query).toBe("alessandro");
    expect(parsed.limit).toBe(20);
  });

  it("trims the query", () => {
    expect(searchContactsParamsSchema.parse({ query: "  bob  " }).query).toBe("bob");
  });

  it("rejects empty, too-long, or missing queries", () => {
    expect(searchContactsParamsSchema.safeParse({}).success).toBe(false);
    expect(searchContactsParamsSchema.safeParse({ query: "" }).success).toBe(false);
    expect(searchContactsParamsSchema.safeParse({ query: "x".repeat(101) }).success).toBe(false);
  });
});

describe("relationship payload schemas", () => {
  it("follow / unfollow / block / cancel / send / unfriend accept a target user", () => {
    const body = { targetUserId: "user_1" };
    for (const schema of [
      followParamsSchema,
      unfriendParamsSchema,
      blockParamsSchema,
      cancelFriendRequestParamsSchema,
      sendFriendRequestParamsSchema,
    ]) {
      expect(schema.parse(body)).toEqual(body);
    }
  });

  it("rejects missing targetUserId", () => {
    expect(followParamsSchema.safeParse({}).success).toBe(false);
    expect(blockParamsSchema.safeParse({}).success).toBe(false);
  });
});

describe("respondFriendRequestParamsSchema", () => {
  it("accepts accept/reject actions", () => {
    expect(
      respondFriendRequestParamsSchema.parse({ requestId: "user_1", action: "accept" }),
    ).toEqual({
      requestId: "user_1",
      action: "accept",
    });
    expect(
      respondFriendRequestParamsSchema.parse({ requestId: "user_1", action: "reject" }),
    ).toEqual({
      requestId: "user_1",
      action: "reject",
    });
  });

  it("rejects unknown actions", () => {
    expect(
      respondFriendRequestParamsSchema.safeParse({ requestId: "user_1", action: "maybe" }).success,
    ).toBe(false);
  });
});

describe("friendsParamsSchema", () => {
  it("accepts pagination params", () => {
    expect(friendsParamsSchema.parse({ limit: 10, cursor: "abc==" })).toEqual({
      limit: 10,
      cursor: "abc==",
    });
  });
});

describe("invite DTOs", () => {
  it("create: accepts with or without email", () => {
    expect(createInviteParamsSchema.parse({}).email).toBeUndefined();
    expect(createInviteParamsSchema.parse({ email: "a@b.it" }).email).toBe("a@b.it");
  });

  it("create: rejects invalid emails", () => {
    expect(createInviteParamsSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("claim: accepts a token and rejects short ones", () => {
    expect(claimInviteParamsSchema.parse({ token: "abcdefgh" }).token).toBe("abcdefgh");
    expect(claimInviteParamsSchema.safeParse({ token: "short" }).success).toBe(false);
  });
});

describe("presenceUpdateParamsSchema", () => {
  it("accepts online/offline/away", () => {
    for (const status of ["online", "offline", "away"]) {
      expect(presenceUpdateParamsSchema.parse({ status }).status).toBe(status);
    }
  });

  it("rejects unknown statuses", () => {
    expect(presenceUpdateParamsSchema.safeParse({ status: "ghost" }).success).toBe(false);
  });
});

describe("invite TTL constant", () => {
  it("is 7 days", () => {
    expect(INVITE_TTL_DAYS).toBe(7);
  });
});
