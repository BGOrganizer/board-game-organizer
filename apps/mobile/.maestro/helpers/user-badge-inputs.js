// Existing owned Development fixtures only; no provisioning or persistent mutations.
// Maestro -e values are globals, as in the other fixture helpers.
var locale = typeof BADGE_LOCALE !== "undefined" ? BADGE_LOCALE : "";
if (locale !== "en" && locale !== "it") throw new Error("BADGE_LOCALE must be en or it");
var group = typeof BADGE_GROUP_ID !== "undefined" ? BADGE_GROUP_ID : "";
var event = typeof BADGE_EVENT_ID !== "undefined" ? BADGE_EVENT_ID : "";
var table = typeof BADGE_TABLE_ID !== "undefined" ? BADGE_TABLE_ID : "";
if (![group, event, table].every((id) => /^[\da-f-]{36}$/.test(id)))
  throw new Error("Owned Development Group/Event/Table IDs are required");
var relationship = typeof BADGE_RELATIONSHIP_LABEL !== "undefined" ? BADGE_RELATIONSHIP_LABEL : "";
var explanation =
  typeof BADGE_RELATIONSHIP_EXPLANATION !== "undefined" ? BADGE_RELATIONSHIP_EXPLANATION : "";
var groupRole = typeof BADGE_GROUP_ROLE_LABEL !== "undefined" ? BADGE_GROUP_ROLE_LABEL : "";
var role = typeof BADGE_ROLE_LABEL !== "undefined" ? BADGE_ROLE_LABEL : "";
if (!relationship || !explanation || !role || !groupRole)
  throw new Error(
    "BADGE_RELATIONSHIP_LABEL, BADGE_RELATIONSHIP_EXPLANATION BADGE_GROUP_ROLE_LABEL and multi-role BADGE_ROLE_LABEL are required",
  );
var it = locale === "it";
output.badges = {
  contacts: "bgo-dev:///contacts?tab=connections",
  group: "bgo-dev:///group/" + group,
  event: "bgo-dev:///event/" + event,
  groupRole: groupRole,
  table: "bgo-dev:///event/table?eventId=" + event + "&tableId=" + table,
  relationship: relationship,
  explanation: explanation,
  role: role,
  members: it ? "Membri" : "Members",
  roles: it ? "Ruoli e partecipazione" : "Roles and participation",
  participants: it ? "Partecipanti" : "Participants",
  reorder: it ? "Riordina posti" : "Reorder seats",
  lock: it ? "Blocca giocatore" : "Lock player",
  unlock: it ? "Sblocca giocatore" : "Unlock player",
  discard: it ? "Scarta ordine non salvato" : "Discard unsaved order",
};
