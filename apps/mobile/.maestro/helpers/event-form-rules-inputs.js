// Owned Development, fresh local Event draft, unique approved Public group managed by actor.
var ack = typeof FORM_RULES_ACK === "undefined" ? "" : FORM_RULES_ACK;
var locale = typeof FORM_RULES_LOCALE === "undefined" ? "" : FORM_RULES_LOCALE;
var group =
  typeof FORM_RULES_PUBLIC_GROUP === "undefined" ? "" : String(FORM_RULES_PUBLIC_GROUP).trim();
if (
  ack !== "owned-development-groups" ||
  !["en", "it"].includes(locale) ||
  group.length < 5 ||
  group.length > 120
)
  throw new Error("FORM_RULES_ACK, FORM_RULES_LOCALE and exact FORM_RULES_PUBLIC_GROUP required");
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
};
