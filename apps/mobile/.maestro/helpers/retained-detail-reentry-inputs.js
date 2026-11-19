if (
  typeof NAVIGATION_BUILD_ACK === "undefined" ||
  NAVIGATION_BUILD_ACK !== "owned-preview-build" ||
  typeof NAVIGATION_API_URL === "undefined" ||
  !/^https:\/\/api-development-pr-\d+-[a-z\d-]+\.vercel\.app$/.test(NAVIGATION_API_URL) ||
  typeof NAVIGATION_FIXTURE_ACK === "undefined" ||
  NAVIGATION_FIXTURE_ACK !== "owned-private-planning-event" ||
  typeof NAVIGATION_LOCALE === "undefined" ||
  !["en", "it"].includes(NAVIGATION_LOCALE) ||
  typeof NAVIGATION_REENTRY_INPUT === "undefined"
)
  throw new Error("Verified owned Preview session, PRIVATE PLANNING fixture and locale required");
var p = JSON.parse(NAVIGATION_REENTRY_INPUT);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  ![p.groupId, p.eventId, p.targetTableId].every((id) => typeof id === "string" && uuid.test(id)) ||
  ![p.groupName, p.eventName, p.targetTableName].every(
    (name) => typeof name === "string" && name.trim().length >= 5 && name.length <= 30,
  ) ||
  p.tableCount !== 20
)
  throw new Error(
    "Exact owned Group/Event and existing target Table within the 20-table fixture required",
  );
function exact(value) {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
output.reentry = {
  groupLink: `bgo-dev:///group/${p.groupId}`,
  eventLink: `bgo-dev:///event/${p.eventId}`,
  groupName: exact(p.groupName),
  eventName: exact(p.eventName),
  openTable: exact(
    `${NAVIGATION_LOCALE === "it" ? "Apri tavolo" : "Open table"}: ${p.targetTableName}`,
  ),
};
