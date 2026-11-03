var inputs = {
  PROFILE_LOCALE: typeof PROFILE_LOCALE === "undefined" ? "" : PROFILE_LOCALE,
  PROFILE_OWNER_NAME: typeof PROFILE_OWNER_NAME === "undefined" ? "" : PROFILE_OWNER_NAME,
  PROFILE_BGG_USERNAME: typeof PROFILE_BGG_USERNAME === "undefined" ? "" : PROFILE_BGG_USERNAME,
  PROFILE_BGG_INVALID_USERNAME:
    typeof PROFILE_BGG_INVALID_USERNAME === "undefined" ? "" : PROFILE_BGG_INVALID_USERNAME,
  PROFILE_MUTABLE_BGG_FIXTURE_ACK:
    typeof PROFILE_MUTABLE_BGG_FIXTURE_ACK === "undefined" ? "" : PROFILE_MUTABLE_BGG_FIXTURE_ACK,
};
function required(key) {
  var value = String(inputs[key] || "").trim();
  if (!value) throw new Error(key + " required for real BGG acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
if (required("PROFILE_MUTABLE_BGG_FIXTURE_ACK") !== "owned-unlinked-development-account")
  throw new Error(
    "Real BGG and logout acceptance requires an owned unlinked Development/Preview fixture, never Production",
  );
var locale = required("PROFILE_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("PROFILE_LOCALE must be en or it");
var it = locale === "it";
output.profileBgg = {
  owner: literal(required("PROFILE_OWNER_NAME")),
  username: required("PROFILE_BGG_USERNAME"),
  usernameText: literal(required("PROFILE_BGG_USERNAME")),
  invalidUsername: required("PROFILE_BGG_INVALID_USERNAME"),
  sync: literal(it ? "Sincronizza collezione" : "Sync collection"),
  input: literal(it ? "Nome utente BGG" : "BGG username"),
  welcome: literal(it ? "Benvenuto in Board Game Organizer" : "Welcome to Board Game Organizer"),
  failed: literal(
    it
      ? "Impossibile sincronizzare la collezione BGG. La collezione precedente è conservata."
      : "Could not synchronize BGG collection. Your previous collection is retained.",
  ),
  success: literal(it ? "Collezione aggiornata" : "Collection up to date"),
  lastSuccess: literal(it ? "Ultima sincronizzazione riuscita" : "Last successful sync"),
  disconnect: literal(it ? "Scollega BoardGameGeek" : "Disconnect BoardGameGeek"),
  cancel: literal(it ? "Annulla" : "Cancel"),
  logout: literal(it ? "Esci dall'account" : "Sign out of your account"),
  logoutTitle: literal(it ? "Uscire dall'account?" : "Sign out of your account?"),
};
