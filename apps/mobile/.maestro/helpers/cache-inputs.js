// Real isolated actor/rows only; absent fixture inputs fail rather than skipping acceptance.
function literal(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error("Missing " + name);
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
output.cacheTablePattern = literal(
  typeof CACHE_TABLE_NAME === "undefined" ? "" : CACHE_TABLE_NAME,
  "CACHE_TABLE_NAME",
);
output.cacheGroupPattern = literal(
  typeof CACHE_GROUP_NAME === "undefined" ? "" : CACHE_GROUP_NAME,
  "CACHE_GROUP_NAME",
);
output.cacheEventPattern = literal(
  typeof CACHE_EVENT_NAME === "undefined" ? "" : CACHE_EVENT_NAME,
  "CACHE_EVENT_NAME",
);
literal(typeof EMAIL_2 === "undefined" ? "" : EMAIL_2, "EMAIL_2");
literal(typeof PASSWORD_2 === "undefined" ? "" : PASSWORD_2, "PASSWORD_2");
output.registeredLabel = "Registered";
output.availableLabel = "Available";
output.connectionsLabel = "Connections";
output.noTablesLabel = "No tables found";
