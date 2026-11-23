// Owned Development, fresh local Event draft, unique approved Public group managed by actor.
var ack = typeof FORM_RULES_ACK === "undefined" ? "" : FORM_RULES_ACK;
var locale = typeof FORM_RULES_LOCALE === "undefined" ? "" : FORM_RULES_LOCALE;
var group =
  typeof FORM_RULES_PUBLIC_GROUP === "undefined" ? "" : String(FORM_RULES_PUBLIC_GROUP).trim();
var eventId = typeof FORM_RULES_PUBLIC_EVENT_ID === "undefined" ? "" : FORM_RULES_PUBLIC_EVENT_ID;
var tableNumber =
  typeof FORM_RULES_PUBLIC_TABLE_NUMBER === "undefined"
    ? ""
    : String(FORM_RULES_PUBLIC_TABLE_NUMBER);
if (
  ack !== "owned-development-groups" ||
  !["en", "it"].includes(locale) ||
  group.length < 5 ||
  group.length > 120 ||
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId) ||
  !/^[1-9]\d*$/.test(tableNumber)
)
  throw new Error("Owned Public group, planning Event ID and a positive table number required");
function exact(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = locale === "it";
output.formRules = {
  unavailable: exact(it ? "Non disponibile" : "Unavailable"),
  publicHelp: exact(it ? "Visibilità dell’evento: Guida al campo" : "Event visibility: Field help"),
  publicGuide: exact(
    it
      ? "Gli eventi pubblici sono visibili a tutti e puoi partecipare senza essere membro del gruppo. Seleziona un gruppo pubblico approvato per abilitare questa opzione."
      : "Public events are visible to everyone and can be joined without group membership. Select an approved public group to enable this option.",
  ),
  name: exact(it ? "Nome evento" : "Event name"),
  invalidName: exact(
    it
      ? "Inserisci un nome per l'evento da 5 a 30 caratteri."
      : "Enter an event name between 5 and 30 characters.",
  ),
  next: exact(it ? "Avanti" : "Next"),
  groupQuery: group,
  group: exact(group),
  admin: exact(it ? "Amministratore del gruppo" : "Group admin"),
  eventLink: "bgo-dev:///event/wizard?eventId=" + eventId,
  table: exact((it ? "Tavolo" : "Table") + " #" + tableNumber),
  tableNameField: exact(it ? "Nome tavolo" : "Table name"),
  guestName: exact(it ? "Nome dell’ospite" : "Guest name"),
  addGuest: exact(it ? "Aggiungi un ospite" : "Add a guest"),
  chooseDemonstrator: exact(it ? "Scegli dimostratore" : "Choose demonstrator"),
  guestSelected: exact((it ? "Scegli dimostratore" : "Choose demonstrator") + ": Guest Guide"),
  removeDemonstrator: exact(it ? "Rimuovi dimostratore" : "Remove demonstrator"),
};
