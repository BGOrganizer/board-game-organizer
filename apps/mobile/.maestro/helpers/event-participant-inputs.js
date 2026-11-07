var ack = typeof EVENT_PEOPLE_FIXTURE_ACK === "undefined" ? "" : EVENT_PEOPLE_FIXTURE_ACK;
var build = typeof EVENT_PEOPLE_BUILD_ACK === "undefined" ? "" : EVENT_PEOPLE_BUILD_ACK;
var locale = typeof EVENT_PEOPLE_LOCALE === "undefined" ? "" : EVENT_PEOPLE_LOCALE;
if (
  ack !== "owned-disposable-event-participants" ||
  build !== "owned-preview-build" ||
  (locale !== "en" && locale !== "it")
)
  throw new Error(
    "Owned disposable Event participants, current Preview APK and EN/IT locale required; remove/ban are real and no reset runs",
  );
var p = JSON.parse(EVENT_PEOPLE_INPUT);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !uuid.test(p.eventId) ||
  !uuid.test(p.groupId) ||
  ![p.eventName, p.groupName, p.targetName, p.firstTableName].every(
    (s) => typeof s === "string" && s.trim().length >= 1,
  ) ||
  !["remove", "ban"].includes(p.mode) ||
  !Number.isInteger(p.targetOffset) ||
  p.targetOffset < 20
)
  throw new Error(
    "Valid disposable Event/Group, names, later-page target offset and remove|ban mode required",
  );
function exact(s) {
  return "^" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = locale === "it",
  action =
    p.mode === "remove"
      ? it
        ? "Rimuovi dall’evento"
        : "Remove from event"
      : it
        ? "Banna dal gruppo"
        : "Ban from group";
output.eventPeople = {
  link: "bgo:///event/" + p.eventId,
  event: exact(p.eventName),
  groupLink: "bgo:///group/" + p.groupId,
  group: exact(p.groupName),
  people: exact(it ? "Partecipanti" : "Participants"),
  tables: exact(it ? "Tavoli" : "Tables"),
  edit: exact(it ? "Modifica evento" : "Edit event"),
  members: exact(it ? "Membri" : "Members"),
  target: exact(p.targetName),
  table: exact(p.firstTableName),
  manage: exact((it ? "Gestisci partecipante" : "Manage participant") + ": " + p.targetName),
  action: exact(action),
  title: exact(p.mode === "remove" ? action : action + ": " + p.targetName),
  cancel: exact(it ? "Annulla" : "Cancel"),
  removedOnly: p.mode === "remove",
};
