var values = {
  RESULTS_FIXTURE_ACK: typeof RESULTS_FIXTURE_ACK === "undefined" ? "" : RESULTS_FIXTURE_ACK,
  RESULTS_BUILD_ACK: typeof RESULTS_BUILD_ACK === "undefined" ? "" : RESULTS_BUILD_ACK,
  RESULTS_LOCALE: typeof RESULTS_LOCALE === "undefined" ? "" : RESULTS_LOCALE,
  RESULTS_EVENT_ID: typeof RESULTS_EVENT_ID === "undefined" ? "" : RESULTS_EVENT_ID,
  RESULTS_TABLE_ID: typeof RESULTS_TABLE_ID === "undefined" ? "" : RESULTS_TABLE_ID,
  RESULTS_EXCLUDED_TABLE_ID:
    typeof RESULTS_EXCLUDED_TABLE_ID === "undefined" ? "" : RESULTS_EXCLUDED_TABLE_ID,
  RESULTS_EVENT_NAME: typeof RESULTS_EVENT_NAME === "undefined" ? "" : RESULTS_EVENT_NAME,
  RESULTS_TABLE_NAME: typeof RESULTS_TABLE_NAME === "undefined" ? "" : RESULTS_TABLE_NAME,
  RESULTS_EXCLUDED_NAME: typeof RESULTS_EXCLUDED_NAME === "undefined" ? "" : RESULTS_EXCLUDED_NAME,
  RESULTS_PLAYER_1_ID: typeof RESULTS_PLAYER_1_ID === "undefined" ? "" : RESULTS_PLAYER_1_ID,
  RESULTS_PLAYER_2_ID: typeof RESULTS_PLAYER_2_ID === "undefined" ? "" : RESULTS_PLAYER_2_ID,
};
function required(key) {
  var value = String(values[key] || "").trim();
  if (!value) throw new Error(key + " required for owned Table-result acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
function uuid(key) {
  var id = required(key);
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error("Invalid " + key);
  return id;
}
if (
  required("RESULTS_FIXTURE_ACK") !== "owned-unfinalized-development-event" ||
  required("RESULTS_BUILD_ACK") !== "owned-preview-build"
)
  throw new Error(
    "Owned disposable Development/Preview Event and verified non-Production APK required; finalization is irreversible",
  );
var locale = required("RESULTS_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("RESULTS_LOCALE must be en or it");
var eventId = uuid("RESULTS_EVENT_ID"),
  tableId = uuid("RESULTS_TABLE_ID"),
  excludedId = uuid("RESULTS_EXCLUDED_TABLE_ID"),
  first = required("RESULTS_PLAYER_1_ID"),
  second = required("RESULTS_PLAYER_2_ID");
if (
  tableId === excludedId ||
  first === second ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(first) ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(second)
)
  throw new Error("Distinct included/excluded Tables and frozen players required");
var it = locale === "it";
output.results = {
  event: literal(required("RESULTS_EVENT_NAME")),
  table: literal(required("RESULTS_TABLE_NAME")),
  excluded: literal(required("RESULTS_EXCLUDED_NAME")),
  eventLink: "bgo-dev:///event/" + eventId,
  tableLink: "bgo-dev:///event/table?eventId=" + eventId + "&tableId=" + tableId,
  excludedLink: "bgo-dev:///event/table?eventId=" + eventId + "&tableId=" + excludedId,
  open1: "table-score-open-" + first,
  open2: "table-score-open-" + second,
  input1: "table-score-input-" + first,
  input2: "table-score-input-" + second,
  register: literal(it ? "Registra Risultato" : "Register result"),
  done: literal(it ? "Fine" : "Done"),
  finalize: literal(it ? "Finalizza evento" : "Finalize event"),
  finalizeTitle: literal(it ? "Finalizzare evento?" : "Finalize event?"),
  terminated: literal(it ? "Terminata" : "Terminated"),
  results: literal(it ? "Risultati" : "Results"),
};
