function required(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error("Missing " + name);
  return value;
}
function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var language = required(typeof CARD_LOCALE === "undefined" ? "" : CARD_LOCALE, "CARD_LOCALE");
if (language !== "en" && language !== "it") throw new Error("CARD_LOCALE must be en or it");
var italian = language === "it";
output.cardGroupName = required(
  typeof CARD_GROUP_NAME === "undefined" ? "" : CARD_GROUP_NAME,
  "CARD_GROUP_NAME",
);
output.cardEventName = required(
  typeof CARD_EVENT_NAME === "undefined" ? "" : CARD_EVENT_NAME,
  "CARD_EVENT_NAME",
);
output.cardTableName = required(
  typeof CARD_TABLE_NAME === "undefined" ? "" : CARD_TABLE_NAME,
  "CARD_TABLE_NAME",
);
output.cardGroup =
  "^" + (italian ? "Apri gruppo: " : "Open group: ") + escaped(output.cardGroupName) + "$";
output.cardEvent =
  "^" + (italian ? "Apri evento: " : "Open event: ") + escaped(output.cardEventName) + "$";
output.cardTable =
  "^" + (italian ? "Apri tavolo: " : "Open table: ") + escaped(output.cardTableName) + "$";
output.cardGroupParent =
  "^" + (italian ? "Gruppo: " : "Group: ") + escaped(output.cardGroupName) + "$";
output.cardEventParent =
  "^" + (italian ? "Evento: " : "Event: ") + escaped(output.cardEventName) + "$";
output.cardDate =
  ".*" +
  escaped(
    required(
      typeof CARD_EVENT_DATE_LABEL === "undefined" ? "" : CARD_EVENT_DATE_LABEL,
      "CARD_EVENT_DATE_LABEL",
    ),
  ) +
  ".*";
output.cardTime =
  ".*" +
  escaped(
    required(
      typeof CARD_EVENT_TIME_LABEL === "undefined" ? "" : CARD_EVENT_TIME_LABEL,
      "CARD_EVENT_TIME_LABEL",
    ),
  ) +
  ".*";
output.cardVenue =
  ".*" +
  escaped(required(typeof CARD_VENUE === "undefined" ? "" : CARD_VENUE, "CARD_VENUE")) +
  ".*";
output.cardAddress =
  ".*" +
  escaped(
    required(
      typeof CARD_VENUE_ADDRESS === "undefined" ? "" : CARD_VENUE_ADDRESS,
      "CARD_VENUE_ADDRESS",
    ),
  ) +
  ".*";
output.cardZone = "^[A-Za-z_]+/[A-Za-z_]+$";
output.cardPrivate = italian ? "^Privato$" : "^Private$";
output.cardMembers = italian ? "^[0-9]+ Membr[oi]$" : "^[0-9]+ Members?$";
output.cardGroupEvents = italian ? "^[0-9]+ Event[oi]$" : "^[0-9]+ Events?$";
output.cardGroupTitle = "^" + escaped(output.cardGroupName) + "$";
output.cardEventTitle = "^" + escaped(output.cardEventName) + "$";
output.cardTableTitle = "^" + escaped(output.cardTableName) + "$";
output.cardOverview = italian ? "^Dettagli$" : "^Details$";
output.cardDateCount = italian ? "2 date proposte" : "2 proposed dates";
output.cardLocationCount = italian ? "2 luoghi proposti" : "2 proposed locations";
output.cardDatesPopover =
  "^" + (italian ? "Date e orari: " : "Dates and times: ") + escaped(output.cardTableName) + "$";
output.cardLocationsPopover =
  "^" + (italian ? "Luoghi: " : "Locations: ") + escaped(output.cardTableName) + "$";
output.cardGamesPopover =
  "^" + (italian ? "Giochi da tavolo: " : "Board games: ") + escaped(output.cardTableName) + "$";
output.cardRatio = italian ? "^[0-9]+/[0-9]+ partecipant[ei]$" : "^[0-9]+/[0-9]+ participants?$";
output.cardTables = italian ? "^Tavoli$" : "^Tables$";
output.cardGamesTitle = italian ? "^Giochi da tavolo$" : "^Board games$";
output.cardNoGames = italian ? "^Nessun gioco trovato$" : "^No games found$";
output.cardEventState = italian ? "^In pianificazione$" : "^Planning$";
output.cardEventAccepted = italian ? "^Partecipante accettato$" : "^Accepted participant$";
output.cardEventTableCount = italian ? "^[0-9]+ Tavol[oi]$" : "^[0-9]+ Tables?$";
var person = JSON.parse(
  required(typeof CARD_PEOPLE_INPUT === "undefined" ? "" : CARD_PEOPLE_INPUT, "CARD_PEOPLE_INPUT"),
);
var handle = required(person.username, "username").trim().replace(/^@+/, "");
if (
  !handle ||
  ["admin", "moderator", "member"].indexOf(person.groupRole) < 0 ||
  ["admin", "moderator", "participant"].indexOf(person.eventRole) < 0 ||
  ["participant", "awaiting", "waiting"].indexOf(person.tableStatus) < 0
)
  throw new Error(
    "Known first-page username and authoritative Group/Event roles/Table status required",
  );
var roleLabels = {
  admin: "Admin",
  moderator: italian ? "Moderatore" : "Moderator",
  member: italian ? "Membro" : "Member",
  participant: italian ? "Partecipante" : "Participant",
  awaiting: italian ? "In attesa di accettazione" : "Awaiting acceptance",
  waiting: italian ? "Lista d'attesa" : "Waiting list",
};
output.cardPerson = "^@" + escaped(handle) + "$";
output.cardGroupRole = "^" + escaped(roleLabels[person.groupRole]) + "$";
output.cardEventRole =
  "^" + escaped(roleLabels[person.eventRole]) + "(?: · " + escaped(roleLabels.waiting) + ")?$";
output.cardTableStatus =
  "^" +
  escaped(roleLabels[person.tableStatus]) +
  (person.tableStatus === "awaiting" ? "(?: · " + escaped(roleLabels.waiting) + ")?" : "") +
  "$";
output.cardMembersTab = italian ? "^Membri$" : "^Members$";
output.cardParticipantsTab = italian ? "^Partecipanti$" : "^Participants$";
output.cardRankingTab = "^Ranking$";
output.cardUnconfirmed = italian ? "^Giocatori non confermati$" : "^Unconfirmed players$";
