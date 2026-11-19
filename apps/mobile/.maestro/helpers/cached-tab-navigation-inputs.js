// No launch/reset, permission grants, relationship writes or fixture provisioning.
if (
  typeof NAVIGATION_BUILD_ACK === "undefined" ||
  NAVIGATION_BUILD_ACK !== "owned-preview-build" ||
  typeof NAVIGATION_API_URL === "undefined" ||
  !/^https:\/\/api-development-pr-\d+-[a-z\d-]+\.vercel\.app$/.test(NAVIGATION_API_URL) ||
  typeof NAVIGATION_COLLECTION === "undefined" ||
  !["present", "absent"].includes(NAVIGATION_COLLECTION)
)
  throw new Error("Verify owned Preview API/account and explicit BGG collection capability first");
output.navigation = {
  events: ["available", "terminated", "mine"],
  groups: ["public", "search", "private"],
  eventIndex: 0,
  groupIndex: 0,
  collection: NAVIGATION_COLLECTION === "present",
};
