var inputs = {
  SCHEDULE_PUBLIC_NAME: typeof SCHEDULE_PUBLIC_NAME === "undefined" ? "" : SCHEDULE_PUBLIC_NAME,
  SCHEDULE_PRIVATE_NAME: typeof SCHEDULE_PRIVATE_NAME === "undefined" ? "" : SCHEDULE_PRIVATE_NAME,
  SCHEDULE_EXCLUDED_NAME:
    typeof SCHEDULE_EXCLUDED_NAME === "undefined" ? "" : SCHEDULE_EXCLUDED_NAME,
  SCHEDULE_PLANNING_NAME:
    typeof SCHEDULE_PLANNING_NAME === "undefined" ? "" : SCHEDULE_PLANNING_NAME,
  SCHEDULE_LOCALE: typeof SCHEDULE_LOCALE === "undefined" ? "" : SCHEDULE_LOCALE,
  SCHEDULE_PUBLIC_PATH: typeof SCHEDULE_PUBLIC_PATH === "undefined" ? "" : SCHEDULE_PUBLIC_PATH,
  SCHEDULE_PRIVATE_PATH: typeof SCHEDULE_PRIVATE_PATH === "undefined" ? "" : SCHEDULE_PRIVATE_PATH,
  SCHEDULE_EXCLUDED_PATH:
    typeof SCHEDULE_EXCLUDED_PATH === "undefined" ? "" : SCHEDULE_EXCLUDED_PATH,
  SCHEDULE_PLANNING_PATH:
    typeof SCHEDULE_PLANNING_PATH === "undefined" ? "" : SCHEDULE_PLANNING_PATH,
  SCHEDULE_PUBLIC_DATE: typeof SCHEDULE_PUBLIC_DATE === "undefined" ? "" : SCHEDULE_PUBLIC_DATE,
  SCHEDULE_PRIVATE_DATE: typeof SCHEDULE_PRIVATE_DATE === "undefined" ? "" : SCHEDULE_PRIVATE_DATE,
  SCHEDULE_PUBLIC_TIME: typeof SCHEDULE_PUBLIC_TIME === "undefined" ? "" : SCHEDULE_PUBLIC_TIME,
  SCHEDULE_PRIVATE_TIME: typeof SCHEDULE_PRIVATE_TIME === "undefined" ? "" : SCHEDULE_PRIVATE_TIME,
  SCHEDULE_DEMONSTRATOR: typeof SCHEDULE_DEMONSTRATOR === "undefined" ? "" : SCHEDULE_DEMONSTRATOR,
  SCHEDULE_DURATION_LABEL:
    typeof SCHEDULE_DURATION_LABEL === "undefined" ? "" : SCHEDULE_DURATION_LABEL,
};
function required(key) {
  var value = String(inputs[key] || "").trim();
  if (!value) throw new Error(key + " required for real Table schedule acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
function link(kind) {
  var parts = required("SCHEDULE_" + kind + "_PATH").match(
    /^\/events\/([\da-f-]{36})\/tables\/([\da-f-]{36})$/,
  );
  if (!parts) throw new Error("Invalid SCHEDULE_" + kind + "_PATH");
  return "bgo-dev:///event/table?eventId=" + parts[1] + "&tableId=" + parts[2];
}
var locale = required("SCHEDULE_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("SCHEDULE_LOCALE must be en or it");
var it = locale === "it";
output.publicName = literal(required("SCHEDULE_PUBLIC_NAME"));
output.privateName = literal(required("SCHEDULE_PRIVATE_NAME"));
output.excludedName = literal(required("SCHEDULE_EXCLUDED_NAME"));
output.planningName = literal(required("SCHEDULE_PLANNING_NAME"));
output.publicLink = link("PUBLIC");
output.privateLink = link("PRIVATE");
output.excludedLink = link("EXCLUDED");
output.planningLink = link("PLANNING");
output.publicDate = literal(required("SCHEDULE_PUBLIC_DATE"));
output.privateDate = literal(required("SCHEDULE_PRIVATE_DATE"));
output.publicTime = literal(required("SCHEDULE_PUBLIC_TIME"));
output.privateTime = literal(required("SCHEDULE_PRIVATE_TIME"));
output.guide = literal(required("SCHEDULE_DEMONSTRATOR"));
output.guideLabel = literal(it ? "Dimostratore" : "Demonstrator");
output.duration = literal(required("SCHEDULE_DURATION_LABEL"));
output.unknownDuration = literal(it ? "Durata: Non indicato" : "Duration: Unknown");
output.excluded = literal(it ? "Escluso dalla conferma" : "Excluded from confirmation");
output.settings = literal(it ? "Impostazioni" : "Settings");
output.durationAny = it ? "^Durata:.*" : "^Duration:.*";
