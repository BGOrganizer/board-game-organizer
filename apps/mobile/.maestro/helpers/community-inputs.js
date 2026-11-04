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
output.community = {
  visible: literal(required("COMMUNITY_VISIBLE_TEXT")),
  friend: literal(required("COMMUNITY_FRIEND_TEXT")),
  followed: literal(required("COMMUNITY_FOLLOWED_TEXT")),
  privateText: literal(required("COMMUNITY_PRIVATE_TEXT")),
  beforeText: literal(required("COMMUNITY_BEFORE_TEXT")),
  activities: it ? "^Attività$" : "^Activities$",
  market: it ? "^Mercatino$" : "^Marketplace$",
  coming: it ? "^Prossimamente$" : "^Coming soon$",
  network: it ? "^Rete$" : "^Network$",
  friends: it ? "^Amici$" : "^Friends$",
  following: it ? "^Seguiti$" : "^Followed users$",
  readOnly: literal(
    it
      ? "Vista pubblica in sola lettura. Unisciti al gruppo per partecipare."
      : "Public read-only view. Join the group to participate.",
  ),
  tableText: literal(required("COMMUNITY_TABLE_TEXT")),
  register: it ? "^Registra Risultato$" : "^Register result$",
  eventLink: "bgo:///event/" + eventId,
  tableLink: "bgo:///event/table?eventId=" + eventId + "&tableId=" + tableId,
};
