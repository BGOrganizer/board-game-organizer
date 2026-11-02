import { z } from "zod";
import { targetUserIdSchema } from "../common/dto/common";

export const notificationItemFields = [
  "date",
  "location",
  "game",
  "invitation",
  "dates",
  "locations",
  "games",
  "overview",
  "tables",
  "member",
  "members",
] as const;
export type NotificationItemField = (typeof notificationItemFields)[number];
const parts = z.tuple([
  z.enum(["event", "table", "group"]),
  z.uuid(),
  z.enum(notificationItemFields),
  z.string().max(512).nullable(),
]);
export const notificationItemIdSchema = z
  .string()
  .max(1000)
  .refine((value) => {
    try {
      const result = parts.safeParse(JSON.parse(value));
      if (!result.success) return false;
      const [resource, , field, option] = result.data;
      if (resource === "group" && !["invitation", "member", "members", "overview"].includes(field))
        return false;
      if (["member", "members"].includes(field) && resource !== "group") return false;
      if (field === "member") return targetUserIdSchema.safeParse(option).success;
      if (["game", "games"].includes(field) && resource !== "table") return false;
      if (
        ["date", "dates", "location", "locations", "tables"].includes(field) &&
        resource !== "event"
      )
        return false;
      if (field === "invitation" && resource === "event") return false;
      if (field === "date" || field === "location") return z.uuid().safeParse(option).success;
      if (field === "game")
        return option !== null && /^[1-9]\d*$/.test(option) && Number.isSafeInteger(Number(option));
      return option === null;
    } catch {
      return false;
    }
  }, "Invalid notification item");
/** Stable resource/option identity, never a translated label or an invented domain ID. */
export function notificationItemId(
  scopeId: string,
  field: NotificationItemField,
  optionId?: string | number,
  resource: "event" | "table" | "group" = field === "invitation" ||
  field === "member" ||
  field === "members"
    ? "group"
    : field === "game" || field === "games"
      ? "table"
      : "event",
) {
  return JSON.stringify([
    resource,
    scopeId,
    field,
    optionId === undefined ? null : String(optionId),
  ]);
}
export interface NotificationItem {
  id: string;
  revision: number;
  sectionId?: string;
  eventId?: string;
  groupId?: string;
  tableIds?: string[];
  readAt?: Date;
  changedAt?: Date;
}
export interface NotificationItemDto {
  id: string;
  revision: number;
  sectionId?: string;
  changedAt?: string;
  readAt: string | null;
}
