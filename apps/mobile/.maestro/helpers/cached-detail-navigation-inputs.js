if (
  typeof NAVIGATION_BUILD_ACK === "undefined" ||
  NAVIGATION_BUILD_ACK !== "owned-preview-build" ||
  typeof NAVIGATION_API_URL === "undefined" ||
  !/^https:\/\/api-development-pr-\d+-[a-z\d-]+\.vercel\.app$/.test(NAVIGATION_API_URL) ||
  typeof NAVIGATION_DETAILS_INPUT === "undefined"
)
  throw new Error("Verified Preview build, owned PRIVATE PLANNING resources and input required");
var p = JSON.parse(NAVIGATION_DETAILS_INPUT);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  ![p.groupId, p.eventId, p.tableId].every((id) => typeof id === "string" && uuid.test(id)) ||
  ![p.groupName, p.eventName, p.tableName].every(
    (name) => typeof name === "string" && name.trim().length >= 5 && name.length <= 30,
  )
)
  throw new Error("Exact existing owned fixture IDs and names required");
function exact(value) {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
output.details = {
  groupLink: `bgo-dev:///group/${p.groupId}`,
  eventLink: `bgo-dev:///event/${p.eventId}`,
  tableLink: `bgo-dev:///event/table?eventId=${p.eventId}&tableId=${p.tableId}`,
  groupName: exact(p.groupName),
  eventName: exact(p.eventName),
  tableName: exact(p.tableName),
};
