// Existing owned fixtures only; this journey never provisions or modifies resources.
var ack = typeof ARTWORK_FIXTURE_ACK === "undefined" ? "" : ARTWORK_FIXTURE_ACK;
var build = typeof ARTWORK_BUILD_ACK === "undefined" ? "" : ARTWORK_BUILD_ACK;
var locale = typeof ARTWORK_LOCALE === "undefined" ? "" : ARTWORK_LOCALE;
var theme = typeof ARTWORK_THEME === "undefined" ? "" : ARTWORK_THEME;
var motion = typeof ARTWORK_MOTION === "undefined" ? "" : ARTWORK_MOTION;
if (
  ack !== "owned-preview-resource-artwork" ||
  build !== "owned-preview-build" ||
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  !["normal", "reduced"].includes(motion)
)
  throw new Error(
    "Owned Preview APK/account and configured locale, theme and system motion required",
  );
var p = JSON.parse(ARTWORK_INPUT);
var id = /^[A-Za-z0-9_-]{1,128}$/;
if (
  ![p.groupId, p.eventId, p.tableId].every(
    (value) => typeof value === "string" && id.test(value),
  ) ||
  ![p.groupName, p.eventName, p.tableName].every(
    (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 200,
  ) ||
  !["generated", "uploaded", "failed"].includes(p.logo)
)
  throw new Error(
    "Exact owned Group/Event/Table IDs, names and generated/uploaded/failed logo case required",
  );
function exact(value) {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
var it = locale === "it";
output.artwork = {
  groupLink: `bgo-dev:///group/${p.groupId}`,
  eventLink: `bgo-dev:///event/${p.eventId}`,
  tableLink: `bgo-dev:///event/table?eventId=${p.eventId}&tableId=${p.tableId}`,
  group: exact(p.groupName),
  groupTab: exact(it ? "Privati" : "Private groups"),
  groupFilter: p.groupName,
  openGroup: exact(`${it ? "Apri gruppo" : "Open group"}: ${p.groupName}`),
  event: exact(p.eventName),
  table: exact(p.tableName),
  events: exact(it ? "Eventi" : "Events"),
  tables: exact(it ? "Tavoli" : "Tables"),
  eventFilter: p.eventName,
  openEvent: exact(`${it ? "Apri evento" : "Open event"}: ${p.eventName}`),
  openTable: exact(`${it ? "Apri tavolo" : "Open table"}: ${p.tableName}`),
  screenshot: `artwork-${p.logo}-${locale}-${theme}-${motion}`,
};
