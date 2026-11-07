var values = {
  GROUP_ROLE_FIXTURE_ACK:
    typeof GROUP_ROLE_FIXTURE_ACK === "undefined" ? "" : GROUP_ROLE_FIXTURE_ACK,
  GROUP_ROLE_BUILD_ACK: typeof GROUP_ROLE_BUILD_ACK === "undefined" ? "" : GROUP_ROLE_BUILD_ACK,
  GROUP_ROLE_LOCALE: typeof GROUP_ROLE_LOCALE === "undefined" ? "" : GROUP_ROLE_LOCALE,
  GROUP_ROLE_GROUP_ID: typeof GROUP_ROLE_GROUP_ID === "undefined" ? "" : GROUP_ROLE_GROUP_ID,
  GROUP_ROLE_GROUP_NAME: typeof GROUP_ROLE_GROUP_NAME === "undefined" ? "" : GROUP_ROLE_GROUP_NAME,
  GROUP_ROLE_TARGET_NAME:
    typeof GROUP_ROLE_TARGET_NAME === "undefined" ? "" : GROUP_ROLE_TARGET_NAME,
  GROUP_ROLE_TARGET_MENU_NAME:
    typeof GROUP_ROLE_TARGET_MENU_NAME === "undefined" ? "" : GROUP_ROLE_TARGET_MENU_NAME,
};
function required(key) {
  var value = String(values[key] || "").trim();
  if (!value) throw new Error(key + " required for owned Group-role acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
if (
  required("GROUP_ROLE_FIXTURE_ACK") !== "owned-development-moderator-group" ||
  required("GROUP_ROLE_BUILD_ACK") !== "owned-preview-build"
)
  throw new Error(
    "Owned Development/Preview Group and verified non-Production APK required; failure may leave target promoted",
  );
var locale = required("GROUP_ROLE_LOCALE"),
  id = required("GROUP_ROLE_GROUP_ID");
if ((locale !== "en" && locale !== "it") || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id))
  throw new Error("Invalid locale or Group id");
var it = locale === "it",
  target = required("GROUP_ROLE_TARGET_NAME"),
  promote = it ? "Rendi moderatore" : "Make moderator",
  demote = it ? "Rendi membro ordinario" : "Demote to member",
  ban = it ? "Banna dal gruppo" : "Ban from group",
  remove = it ? "Rimuovi membro" : "Remove member";
output.groupRole = {
  link: "bgo:///group/" + id,
  group: literal(required("GROUP_ROLE_GROUP_NAME")),
  members: literal(it ? "Membri" : "Members"),
  manage: literal(
    (it ? "Gestisci membro" : "Manage member") + ": " + required("GROUP_ROLE_TARGET_MENU_NAME"),
  ),
  promote: literal(promote),
  demote: literal(demote),
  ban: literal(ban),
  remove: literal(remove),
  promoteTitle: literal(promote + ": " + target),
  demoteTitle: literal(demote + ": " + target),
  banTitle: literal(ban + ": " + target),
  removeTitle: literal(remove + ": " + target),
  cancel: literal(it ? "Annulla" : "Cancel"),
};
