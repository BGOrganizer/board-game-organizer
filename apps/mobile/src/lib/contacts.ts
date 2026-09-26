import { contactEmailSchema, normalizePhoneNumberForMatching } from "@board-game-organizer/schemas";

interface DeviceContact {
  emails?: Array<{ address?: string | null }> | null;
  phones?: Array<{ number?: string | null }> | null;
}

const CONTACT_TABS = [
  "following",
  "followers",
  "friends",
  "requests",
  "blocked",
  "suggestions",
  "search",
] as const;

export type ContactTab = (typeof CONTACT_TABS)[number];

export function contactTab(value: string | string[] | undefined): ContactTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return CONTACT_TABS.includes(candidate as ContactTab) ? (candidate as ContactTab) : "following";
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
