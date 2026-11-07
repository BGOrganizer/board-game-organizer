import { expect, it } from "vitest";
import { notificationListQuerySchema } from "../../notifications/dto/notifications";
import { updatePreferredLanguageSchema } from "../dto/user";

it("accepts only supported app language values and never another user's identity", () => {
  for (const preferredLanguage of ["en", "it"])
    expect(updatePreferredLanguageSchema.parse({ preferredLanguage })).toEqual({
      preferredLanguage,
    });
  for (const input of [
    {},
    { preferredLanguage: "fr" },
    { preferredLanguage: "it-IT" },
    { preferredLanguage: "it", userId: "other" },
  ])
    expect(updatePreferredLanguageSchema.safeParse(input).success).toBe(false);
  expect(notificationListQuerySchema.parse({ locale: "it" })).toEqual({ limit: 5, locale: "it" });
  expect(notificationListQuerySchema.safeParse({ locale: "it-IT" }).success).toBe(false);
});
