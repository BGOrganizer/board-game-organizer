var ack = typeof SINGLE_OPTION_FIXTURE_ACK === "undefined" ? "" : SINGLE_OPTION_FIXTURE_ACK;
var build = typeof SINGLE_OPTION_BUILD_ACK === "undefined" ? "" : SINGLE_OPTION_BUILD_ACK;
var locale = typeof SINGLE_OPTION_LOCALE === "undefined" ? "" : SINGLE_OPTION_LOCALE;
if (ack !== "owned-disposable-development-fixture" || build !== "owned-preview-build")
  throw new Error(
    "Owned disposable Development fixture and verified Preview APK required; this flow joins/accepts it",
  );
if (locale !== "en" && locale !== "it") throw new Error("SINGLE_OPTION_LOCALE must be en or it");
if (typeof SINGLE_OPTION_INPUT === "undefined") throw new Error("SINGLE_OPTION_INPUT required");
var input = JSON.parse(SINGLE_OPTION_INPUT);
var path = String(input.path || "").match(/^\/events\/([\da-f-]{36})\/tables\/([\da-f-]{36})$/);
if (
  !path ||
  !Number.isInteger(input.mask) ||
  input.mask < 0 ||
  input.mask > 7 ||
  (input.mode !== "join" && input.mode !== "accept") ||
  !input.name
)
  throw new Error("Input needs mask 0..7, join/accept mode, Table name and an owned Table path");
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = locale === "it",
  categories = [],
  labels = [it ? "Date" : "Dates", it ? "Luoghi" : "Locations", it ? "Giochi" : "Games"];
for (let index = 0; index < 3; index++) {
  const key = ["dates", "locations", "games"][index],
    options = input[key],
    multiple = Boolean(input.mask & (1 << index));
  if (
    !Array.isArray(options) ||
    options.length !== (multiple ? 2 : 1) ||
    options.some((value) => typeof value !== "string" || !value.trim())
  )
    throw new Error("Each category must supply its exact one/two accessible option labels");
  categories.push({
    tab: literal(labels[index]),
    multiple: multiple,
    yes: options.map((value) => literal(value + ": " + (it ? "Sì" : "Yes"))),
    no: options.map((value) => literal(value + ": No")),
  });
}
output.single = {
  link: "bgo-dev:///event/table?eventId=" + path[1] + "&tableId=" + path[2],
  name: literal(String(input.name)),
  mode: input.mode,
  mask: input.mask,
  title: literal(it ? "Rivedi le impostazioni del tavolo" : "Review table settings"),
  description: literal(
    it
      ? "Iscrivendoti accetti le impostazioni correnti dell'evento e del tavolo. Vota solo dove sono disponibili più opzioni."
      : "Joining accepts the current event and table settings. Vote only where multiple options are available.",
  ),
  free: literal(it ? "Posto libero" : "Free place"),
  join: literal(it ? "Iscriviti al tavolo" : "Join table"),
  accept: literal(it ? "Accetta invito" : "Accept invitation"),
  leave: literal(it ? "Abbandona tavolo" : "Leave table"),
  yes: it ? "Sì" : "Yes",
  no: "No",
  categories: categories,
};
