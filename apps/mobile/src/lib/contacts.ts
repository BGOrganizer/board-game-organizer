import { contactEmailSchema, normalizePhoneNumberForMatching } from "@board-game-organizer/schemas";

interface DeviceContact {
  emails?: Array<{ address?: string | null }> | null;
  phones?: Array<{ number?: string | null }> | null;
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
