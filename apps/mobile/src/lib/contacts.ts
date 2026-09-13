import { contactEmailSchema, normalizePhoneNumberForMatching } from "@board-game-organizer/schemas";

interface DeviceContact {
  emails?: Array<{ email?: string | null }> | null;
  phoneNumbers?: Array<{ digits?: string | null; number?: string | null }> | null;
}

function nonEmpty(value: string | null | undefined): value is string {
  return Boolean(value);
}

export function contactSyncPayload(contacts: DeviceContact[]) {
  const emails = Array.from(
    new Set(
      contacts
        .flatMap((contact) => contact.emails ?? [])
        .map((email) => email.email?.trim().toLowerCase())
        .filter(nonEmpty)
        .filter((email) => contactEmailSchema.safeParse(email).success),
    ),
  ).slice(0, 1000);

  const phoneNumbers = Array.from(
    new Set(
      contacts
        .flatMap((contact) => contact.phoneNumbers ?? [])
        .map(
          (phone) =>
            normalizePhoneNumberForMatching(phone.number) ??
            normalizePhoneNumberForMatching(phone.digits),
        )
        .filter(nonEmpty),
    ),
  ).slice(0, 1000);

  return { emails, phoneNumbers };
}
