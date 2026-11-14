function required(name) {
  var value = typeof globalThis[name] === "string" ? globalThis[name].trim() : "";
  if (!value) throw new Error(name + " required for real Community acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var locale = required("COMMUNITY_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("Select EN/IT");
if (required("COMMUNITY_BUILD_ACK") !== "owned-development-preview-build")
  throw new Error("Verify an owned Development/Preview build");
var eventId = required("COMMUNITY_EVENT_ID"),
  tableId = required("COMMUNITY_TABLE_ID"),
  uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
if (!uuid.test(eventId) || !uuid.test(tableId)) throw new Error("Canonical fixture UUIDs required");
var it = locale === "it";
var kind = required("COMMUNITY_ACTIVITY_KIND");
var kinds = {
  played: it ? "Partita giocata" : "Game played",
  friendship: it ? "Nuova amicizia" : "New friendship",
  event_join: it ? "Partecipazione a un evento" : "Joined an event",
  table_join: it ? "Partecipazione a un tavolo" : "Joined a table",
  group_join: it ? "Ingresso in un gruppo" : "Joined a group",
  follower: it ? "Nuovo follower" : "New follower",
  milestone: it ? "Traguardo di vittorie" : "Victory milestone",
};
if (!Object.hasOwn(kinds, kind)) throw new Error("Select a canonical activity kind");
output.community = {
  visible: literal(required("COMMUNITY_VISIBLE_TEXT")),
  filtered: literal(required("COMMUNITY_FILTERED_TEXT")),
  privateText: literal(required("COMMUNITY_PRIVATE_TEXT")),
  beforeText: literal(required("COMMUNITY_BEFORE_TEXT")),
  activities: it ? "^Attività$" : "^Activities$",
  market: it ? "^Mercatino$" : "^Marketplace$",
  coming: it ? "^Prossimamente$" : "^Coming soon$",
  type: it ? "^Tipo di attività$" : "^Activity type$",
  kind: literal(kinds[kind]),
  allTypes: it ? "^Tutti i tipi di attività$" : "^All activity types$",
  readOnly: literal(
    it
      ? "Vista pubblica in sola lettura. Unisciti al gruppo per partecipare."
      : "Public read-only view. Join the group to participate.",
  ),
  tableText: literal(required("COMMUNITY_TABLE_TEXT")),
  register: it ? "^Registra Risultato$" : "^Register result$",
  eventLink: "bgo-dev:///event/" + eventId,
  tableLink: "bgo-dev:///event/table?eventId=" + eventId + "&tableId=" + tableId,
};
