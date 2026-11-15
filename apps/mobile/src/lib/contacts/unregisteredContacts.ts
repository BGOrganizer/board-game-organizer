import type { SyncedContactIdentifiers } from "@board-game-organizer/shared";
import { contactSyncPayload } from "./contacts";

interface DeviceContact {
  id: string;
  fullName?: string | null;
  emails?: Array<{ address?: string | null }> | null;
  phones?: Array<{ number?: string | null }> | null;
}

// Keep names on device only. Never classify a contact whose identifiers were
// truncated by the 1,000-item sync limit as unregistered.
export function unregisteredContacts(
  contacts: DeviceContact[],
  submitted: SyncedContactIdentifiers,
  registered: SyncedContactIdentifiers,
): Array<{ id: string; name: string }> {
  const sentEmails = new Set(submitted.emails);
  const sentPhones = new Set(submitted.phoneNumbers);
  const knownEmails = new Set(registered.emails);
  const knownPhones = new Set(registered.phoneNumbers);
  return contacts.flatMap((contact) => {
    const name = contact.fullName?.trim();
    const { emails, phoneNumbers } = contactSyncPayload([contact]);
    if (!name || (emails.length === 0 && phoneNumbers.length === 0)) return [];
    if (emails.some((email) => !sentEmails.has(email) || knownEmails.has(email))) return [];
    if (phoneNumbers.some((phone) => !sentPhones.has(phone) || knownPhones.has(phone))) return [];
    return [{ id: contact.id, name }];
  });
}
