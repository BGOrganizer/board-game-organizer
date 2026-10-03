import { describe, expect, it } from "vitest";
import {
  notificationIdSchema,
  notificationListQuerySchema,
  pushSubscriptionSchema,
  removePushSubscriptionSchema,
} from "../notifications";

describe("notification DTO schemas", () => {
  it("parses bounded list queries and protection bypass", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: 5 });
    expect(
      notificationListQuerySchema.parse({
        limit: "50",
        cursor: "0123456789abcdef01234567",
        "x-vercel-protection-bypass": "token",
      }),
    ).toEqual({
      limit: 50,
      cursor: "0123456789abcdef01234567",
      "x-vercel-protection-bypass": "token",
    });
    expect(notificationListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(notificationListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(notificationListQuerySchema.safeParse({ unexpected: true }).success).toBe(false);
  });

  it("validates notification identifiers", () => {
    expect(notificationIdSchema.safeParse("ABCDEF0123456789abcdef01").success).toBe(true);
    expect(notificationIdSchema.safeParse("not-an-object-id").success).toBe(false);
  });

  it("validates push registration and removal bodies", () => {
    const token = "token-1234567890123456";
    expect(pushSubscriptionSchema.parse({ token, platform: "android", locale: "it" })).toEqual({
      token,
      platform: "android",
      locale: "it",
    });
    expect(removePushSubscriptionSchema.parse({ token })).toEqual({ token });
    expect(
      pushSubscriptionSchema.safeParse({ token: "short", platform: "web", locale: "en" }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ token, platform: "windows", locale: "en" }).success,
    ).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ token, platform: "ios", locale: "fr" }).success).toBe(
      false,
    );
    expect(removePushSubscriptionSchema.safeParse({ token, extra: true }).success).toBe(false);
  });
});
