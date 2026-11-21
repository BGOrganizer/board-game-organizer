var ack = typeof TABLE_GUEST_ACK === "undefined" ? "" : TABLE_GUEST_ACK;
var locale = typeof TABLE_GUEST_LOCALE === "undefined" ? "" : TABLE_GUEST_LOCALE;
var input = typeof TABLE_GUEST_INPUT === "undefined" ? {} : JSON.parse(TABLE_GUEST_INPUT);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  ack !== "owned-disposable-private-planning-table" ||
  !["en", "it"].includes(locale) ||
  !uuid.test(input.eventId) ||
  !uuid.test(input.tableId) ||
  typeof input.name !== "string" ||
  !input.name.trim() ||
  typeof input.game !== "string" ||
  !input.game.trim()
)
  throw new Error(
    "Owned disposable private planning fixture, EN/IT locale, unique guest name and exact game name required",
  );
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var italian = locale === "it";
var edit = italian ? "Modifica voti dell’ospite" : "Edit guest votes";
output.tableGuest = {
  name: input.name,
  help: literal(italian ? "Come funzionano gli ospiti" : "About guests"),
  helpText: literal(
    italian
      ? "Aggiungi una persona senza account su Board Game Organizer."
      : "Add someone who does not have a Board Game Organizer account.",
  ),
  invite: literal(italian ? "Invita giocatori" : "Invite players"),
  place: literal(italian ? "Posto libero" : "Free place"),
  link: "bgo-dev:///event/table?eventId=" + input.eventId + "&tableId=" + input.tableId,
  editor: literal(edit),
  edit: literal(edit + ": " + input.name),
  yes: literal(input.game + ": " + (italian ? "Sì" : "Yes")),
  voter: literal(input.name + " (" + (italian ? "Sì" : "Yes") + ")"),
  voterDetails: literal(input.name + ", " + (italian ? "Ospite" : "Guest")),
  no: literal(input.game + ": No"),
  submit: literal(italian ? "Vota" : "Vote"),
};
