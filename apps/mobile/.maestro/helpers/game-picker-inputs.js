function required(name) {
  var value = typeof globalThis[name] === "string" ? globalThis[name].trim() : "";
  if (!value) throw new Error(name + " required for real game picker acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var locale = required("PICKER_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("Select EN/IT");
if (required("PICKER_BUILD_ACK") !== "owned-development-preview-build")
  throw new Error("Verify an owned Development/Preview build");
if (required("PICKER_FIXTURE_ACK") !== "owned-planning-event-linked-collection")
  throw new Error("Verify owned editable fixture and linked collection");
var eventId = required("PICKER_EVENT_ID");
if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(eventId))
  throw new Error("Canonical fixture UUID required");
var first = required("PICKER_FIRST_GAME"),
  later = required("PICKER_LATER_GAME");
if (first === later) throw new Error("Distinct first-page and later-page games required");
var it = locale === "it";
output.picker = {
  eventLink: "bgo-dev:///event/wizard?eventId=" + eventId,
  eventName: literal(required("PICKER_EVENT_NAME")),
  next: it ? "^Avanti$" : "^Next$",
  choose: it ? "^Scegli un gioco$" : "^Choose a game$",
  back: it ? "^Indietro$" : "^Back$",
  first: literal(first),
  later: literal(later),
  selectFirst: literal((it ? "Seleziona" : "Select") + ": " + first),
};
