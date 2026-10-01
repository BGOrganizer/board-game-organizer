import { type SyncedContactIdentifiers, syncContactsWithToken } from "@board-game-organizer/shared";
import * as Contacts from "expo-contacts";
import { contactSyncPayload } from "@/lib/contacts";

const SCAN_PAGE_SIZE = 200;

export type SyncedContacts = {
  submitted: SyncedContactIdentifiers;
  registered: SyncedContactIdentifiers;
};

const inFlight = new Map<string, Promise<SyncedContacts | null>>();

export async function scanContactIdentifiers(): Promise<SyncedContactIdentifiers> {
  const emails = new Set<string>();
  const phoneNumbers = new Set<string>();
  let offset = 0;
  while (true) {
    const page = await Contacts.Contact.getAllDetails(
      [Contacts.ContactField.EMAILS, Contacts.ContactField.PHONES],
      { limit: SCAN_PAGE_SIZE, offset, sortOrder: Contacts.ContactsSortOrder.GivenName },
    );
    const identifiers = contactSyncPayload(page);
    for (const email of identifiers.emails) if (emails.size < 1000) emails.add(email);
    for (const phone of identifiers.phoneNumbers)
      if (phoneNumbers.size < 1000) phoneNumbers.add(phone);
    offset += page.length;
    if (page.length < SCAN_PAGE_SIZE) break;
  }
  return { emails: [...emails], phoneNumbers: [...phoneNumbers] };
}

export function pendingRegisteredContacts(
  userId: string,
): Promise<SyncedContacts | null> | undefined {
  return inFlight.get(userId);
}

export function warmRegisteredContacts(
  userId: string,
  apiUrl: string,
  getToken: () => Promise<string | null>,
  isCurrent: () => boolean,
): Promise<SyncedContacts | null> {
  const pending = inFlight.get(userId);
  if (pending) return pending;
  const promise = (async () => {
    const permission = await Contacts.getPermissionsAsync();
    if (!permission.granted || !isCurrent()) return null;
    const submitted = await scanContactIdentifiers();
    if (!isCurrent()) return null;
    const result = await syncContactsWithToken(
      apiUrl,
      submitted.emails,
      submitted.phoneNumbers,
      null,
      getToken,
    );
    return { submitted, registered: result.registeredIdentifiers };
  })();
  inFlight.set(userId, promise);
  void promise
    .finally(() => {
      if (inFlight.get(userId) === promise) inFlight.delete(userId);
    })
    .catch(() => {});
  return promise;
}
