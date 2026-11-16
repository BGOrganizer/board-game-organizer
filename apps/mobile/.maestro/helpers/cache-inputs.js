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
output.cacheOwnerPattern = literal(
  typeof CACHE_USERNAME === "undefined" ? "" : CACHE_USERNAME,
  "CACHE_USERNAME",
);
output.cacheOtherOwnerPattern = literal(
  typeof CACHE_USERNAME_2 === "undefined" ? "" : CACHE_USERNAME_2,
  "CACHE_USERNAME_2",
);
if (!/^@\S+$/.test(CACHE_USERNAME) || !/^@\S+$/.test(CACHE_USERNAME_2)) {
  throw new Error("Cache fixture usernames must include @ and contain no spaces");
}
literal(typeof EMAIL === "undefined" ? "" : EMAIL, "EMAIL");
literal(typeof PASSWORD === "undefined" ? "" : PASSWORD, "PASSWORD");
literal(typeof EMAIL_2 === "undefined" ? "" : EMAIL_2, "EMAIL_2");
literal(typeof PASSWORD_2 === "undefined" ? "" : PASSWORD_2, "PASSWORD_2");
if (
  EMAIL.toLowerCase() === EMAIL_2.toLowerCase() ||
  CACHE_USERNAME.toLowerCase() === CACHE_USERNAME_2.toLowerCase()
) {
  throw new Error("Two distinct owned accounts are required");
}
output.registeredLabel = "Scheduled";
output.availableLabel = "Available";
output.connectionsLabel = "Connections";
output.noTablesLabel = "No tables found";
