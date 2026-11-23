if (
  typeof NAVIGATION_BUILD_ACK === "undefined" ||
  NAVIGATION_BUILD_ACK !== "owned-preview-build" ||
  typeof NAVIGATION_API_URL === "undefined" ||
  !/^https:\/\/api-development-pr-\d+-[a-z\d-]+\.vercel\.app$/.test(NAVIGATION_API_URL) ||
  typeof NAVIGATION_LOCALE === "undefined" ||
  !["en", "it"].includes(NAVIGATION_LOCALE) ||
  typeof NAVIGATION_HISTORY_INPUT === "undefined"
)
  throw new Error(
    "Verified Preview session, configured locale and real terminated fixture required",
  );
var p = JSON.parse(NAVIGATION_HISTORY_INPUT);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  ![p.eventId, p.tableId].every((id) => typeof id === "string" && uuid.test(id)) ||
  ![p.eventName, p.tableName].every(
    (name) => typeof name === "string" && name.trim().length >= 5 && name.length <= 30,
  ) ||
  typeof p.winnerUsername !== "string" ||
  !/^@[^\s@]{1,100}$/.test(p.winnerUsername)
)
  throw new Error("Exact real Event/Table IDs, names and winner @username required");
function exact(value) {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
output.history = {
  eventLink: `bgo-dev:///event/${p.eventId}`,
  eventName: exact(p.eventName),
  tableName: exact(p.tableName),
  openTable: exact(`${NAVIGATION_LOCALE === "it" ? "Apri tavolo" : "Open table"}: ${p.tableName}`),
  terminated: exact(NAVIGATION_LOCALE === "it" ? "Terminata" : "Terminated"),
  winner: exact(p.winnerUsername),
  resultWinner: `${exact(p.winnerUsername).slice(0, -1)}(?:, .+)?$`,
};
