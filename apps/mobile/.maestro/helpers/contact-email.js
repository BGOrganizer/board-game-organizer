// Search values are literal owned fixture identifiers, never regexes.
if (typeof CONTACT_EMAIL !== "string" || !/^[^\s@]+@[^\s@]+$/.test(CONTACT_EMAIL)) {
  throw new Error("A valid owned fixture CONTACT_EMAIL is required");
}
output.contactEmailPattern = `^${CONTACT_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
