// Read-only owned fixture. No API/provider writes or synthetic visibility markers.
var ack = typeof GROUP_RANKING_FIXTURE_ACK === "undefined" ? "" : String(GROUP_RANKING_FIXTURE_ACK),
  build = typeof GROUP_RANKING_BUILD_ACK === "undefined" ? "" : String(GROUP_RANKING_BUILD_ACK),
  locale = typeof GROUP_RANKING_LOCALE === "undefined" ? "" : String(GROUP_RANKING_LOCALE);
if (ack !== "owned-development-group-ranking" || build !== "owned-preview-build")
  throw new Error("Owned Development/Preview Group and verified non-Production APK required");
if (locale !== "en" && locale !== "it") throw new Error("GROUP_RANKING_LOCALE must be en or it");
if (typeof GROUP_RANKING_INPUT === "undefined" || !GROUP_RANKING_INPUT)
  throw new Error("GROUP_RANKING_INPUT required");
var fixture = JSON.parse(String(GROUP_RANKING_INPUT));
if (!fixture || typeof fixture !== "object" || Array.isArray(fixture))
  throw new Error("Group-ranking fixture must be an object");
function field(key) {
  if (typeof fixture[key] !== "string" || !fixture[key].trim())
    throw new Error("Group-ranking fixture requires " + key);
  return fixture[key].trim();
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var groupId = field("groupId"),
  group = field("groupName"),
  game = field("gameName"),
  userId = field("userId"),
  username = field("username").replace(/^@+/, ""),
  role = field("role");
if (
  !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(groupId) ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
  !/^[A-Za-z0-9_.-]{1,128}$/.test(username) ||
  group.length > 120 ||
  game.length < 4 ||
  game.length > 120 ||
  ["ADMIN", "MODERATOR", "MEMBER"].indexOf(role) < 0
)
  throw new Error("Invalid owned Group-ranking fixture");
var it = locale === "it";
output.groupRanking = {
  link: "bgo:///group/" + groupId,
  group: literal(group),
  ranking: "^Ranking$",
  game: literal(game),
  query: game.slice(0, 4),
  search: literal(it ? "Cerca giochi da tavolo" : "Search board games"),
  username: literal("@" + username),
  row: "group-ranking-player-" + userId,
  role: literal(
    role === "ADMIN"
      ? it
        ? "Amministratore"
        : "Admin"
      : role === "MODERATOR"
        ? it
          ? "Moderatore"
          : "Moderator"
        : it
          ? "Membro accettato"
          : "Accepted member",
  ),
  roles: literal(it ? "Ruoli e partecipazione" : "Roles and participation"),
};
