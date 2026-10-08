import { contactEmailSchema, normalizePhoneNumberForMatching } from "@board-game-organizer/schemas";
import type { ContactUser } from "@board-game-organizer/shared";

interface DeviceContact {
  emails?: Array<{ address?: string | null }> | null;
  phones?: Array<{ number?: string | null }> | null;
}

const CONTACT_TABS = ["connections", "requests", "search"] as const;

export type ContactTab = (typeof CONTACT_TABS)[number];

export function contactTab(value: string | string[] | undefined): ContactTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "friends" || candidate === "following" || candidate === "followers")
    return "connections";
  if (candidate === "blocked") return "requests";
  if (candidate === "suggestions") return "search";
  return CONTACT_TABS.includes(candidate as ContactTab) ? (candidate as ContactTab) : "connections";
}

export function contactSearchRows(
  searchResults: ContactUser[],
  registered: ContactUser[],
  unregistered: Array<{ id: string; name: string }>,
) {
  return [
    ...searchResults.map((user) => ({ kind: "user" as const, id: `user:${user.id}`, user })),
    { kind: "device-header" as const, id: "device-header" },
    ...registered.map((user) => ({ kind: "bgo" as const, id: `bgo:${user.id}`, user })),
    ...unregistered.map((contact) => ({
      kind: "device" as const,
      id: `device:${contact.id}`,
      contact,
    })),
  ];
}

function nonEmpty(value: string | null | undefined): value is string {
  return Boolean(value);
}

export function contactSyncPayload(contacts: DeviceContact[]) {
  const emails = Array.from(
    new Set(
      contacts
        .flatMap((contact) => contact.emails ?? [])
        .map((email) => email.address?.trim().toLowerCase())
        .filter(nonEmpty)
        .filter((email) => contactEmailSchema.safeParse(email).success),
    ),
  ).slice(0, 1000);

  const phoneNumbers = Array.from(
    new Set(
      contacts
        .flatMap((contact) => contact.phones ?? [])
        .map((phone) => normalizePhoneNumberForMatching(phone.number))
        .filter(nonEmpty),
    ),
  ).slice(0, 1000);

  return { emails, phoneNumbers };
}
