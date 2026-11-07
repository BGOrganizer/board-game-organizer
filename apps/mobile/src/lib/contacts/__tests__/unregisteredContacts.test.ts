import { expect, it } from "vitest";
import { unregisteredContacts } from "../unregisteredContacts";

it("keeps only named contacts with fully checked identifiers and no BGO match", () => {
  const contacts = [
    { id: "phone-match", fullName: "Phone Member", phones: [{ number: "+39 333 123 4567" }] },
    { id: "email-match", fullName: "Email Member", emails: [{ address: " Member@BGO.test " }] },
    { id: "new", fullName: "  New Friend  ", phones: [{ number: "+39 333 765 4321" }] },
    { id: "unsent", fullName: "Unsent Contact", emails: [{ address: "unsent@example.test" }] },
    { id: "blank", fullName: " ", emails: [{ address: "blank@example.test" }] },
    { id: "invalid", fullName: "No address", phones: [{ number: "123" }] },
    {
      id: "mixed",
      fullName: "Mixed",
      emails: [{ address: "new@example.test" }],
      phones: [{ number: "+39 333 123 4567" }],
    },
  ];
  expect(
    unregisteredContacts(
      contacts,
      {
        emails: ["member@bgo.test", "blank@example.test", "new@example.test"],
        phoneNumbers: ["393331234567", "393337654321"],
      },
      { emails: ["member@bgo.test"], phoneNumbers: ["393331234567"] },
    ),
  ).toEqual([{ id: "new", name: "New Friend" }]);
});
