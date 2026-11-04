var inputs = {
  PROFILE_LOCALE: typeof PROFILE_LOCALE === "undefined" ? "" : PROFILE_LOCALE,
  PROFILE_GAME_NAME: typeof PROFILE_GAME_NAME === "undefined" ? "" : PROFILE_GAME_NAME,
  PROFILE_OWNER_NAME: typeof PROFILE_OWNER_NAME === "undefined" ? "" : PROFILE_OWNER_NAME,
  PROFILE_TARGET_ID: typeof PROFILE_TARGET_ID === "undefined" ? "" : PROFILE_TARGET_ID,
  PROFILE_TARGET_NAME: typeof PROFILE_TARGET_NAME === "undefined" ? "" : PROFILE_TARGET_NAME,
  PROFILE_EMPTY_ID: typeof PROFILE_EMPTY_ID === "undefined" ? "" : PROFILE_EMPTY_ID,
  PROFILE_EMPTY_NAME: typeof PROFILE_EMPTY_NAME === "undefined" ? "" : PROFILE_EMPTY_NAME,
  PROFILE_BLOCKED_BY_ME_ID:
    typeof PROFILE_BLOCKED_BY_ME_ID === "undefined" ? "" : PROFILE_BLOCKED_BY_ME_ID,
  PROFILE_BLOCKED_ME_ID: typeof PROFILE_BLOCKED_ME_ID === "undefined" ? "" : PROFILE_BLOCKED_ME_ID,
  PROFILE_PUBLIC_ACTIVITY_TEXT:
    typeof PROFILE_PUBLIC_ACTIVITY_TEXT === "undefined" ? "" : PROFILE_PUBLIC_ACTIVITY_TEXT,
  PROFILE_PRIVATE_ACTIVITY_TEXT:
    typeof PROFILE_PRIVATE_ACTIVITY_TEXT === "undefined" ? "" : PROFILE_PRIVATE_ACTIVITY_TEXT,
};
function required(key) {
  var value = String(inputs[key] || "").trim();
  if (!value) throw new Error(key + " required for real Profile acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
function link(key) {
  var id = required(key);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid " + key);
  return "bgo:///user/" + id;
}
var locale = required("PROFILE_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("PROFILE_LOCALE must be en or it");
var it = locale === "it";
if (required("PROFILE_TARGET_NAME").length < 4)
  throw new Error(
    "PROFILE_TARGET_NAME must support four-character authenticated contact discovery",
  );
output.profile = {
  targetQuery: required("PROFILE_TARGET_NAME"),
  search: literal(it ? "Ricerca" : "Search"),
  actions: literal((it ? "Azioni" : "Actions") + ": " + required("PROFILE_TARGET_NAME")),
  view: literal(it ? "Visualizza profilo" : "View profile"),
  game: literal(required("PROFILE_GAME_NAME")),
  gameName: required("PROFILE_GAME_NAME"),
  boardGame: literal(it ? "Gioco da tavolo" : "Board game"),
  filterGames: literal(it ? "Filtra giochi" : "Filter games"),
  chart: literal(it ? "Andamento del rating OpenSkill" : "OpenSkill rating history"),
  owner: literal(required("PROFILE_OWNER_NAME")),
  target: literal(required("PROFILE_TARGET_NAME")),
  empty: literal(required("PROFILE_EMPTY_NAME")),
  targetLink: link("PROFILE_TARGET_ID"),
  emptyLink: link("PROFILE_EMPTY_ID"),
  blockedLink: link("PROFILE_BLOCKED_BY_ME_ID"),
  blockingLink: link("PROFILE_BLOCKED_ME_ID"),
  publicActivity: literal(required("PROFILE_PUBLIC_ACTIVITY_TEXT")),
  privateActivity: literal(required("PROFILE_PRIVATE_ACTIVITY_TEXT")),
  activity: literal(it ? "Attività" : "Activities"),
  player: literal(it ? "Giocatore" : "Player"),
  collection: literal(it ? "Collezione" : "Collection"),
  clearGame: literal(it ? "Azzera gioco selezionato" : "Clear selected game"),
  bgg: literal(it ? "La tua collezione BGG" : "Your BGG collection"),
  logout: literal(it ? "Esci dall'account" : "Sign out of your account"),
  logoutTitle: literal(it ? "Uscire dall'account?" : "Sign out of your account?"),
  cancel: literal(it ? "Annulla" : "Cancel"),
  all: literal(it ? "Visualizza tutte le attività" : "View all activities"),
  type: literal(it ? "Tipo di attività" : "Activity type"),
  unavailable: literal(it ? "Profilo non disponibile" : "Profile unavailable"),
  noGames: literal(it ? "Ancora nessuna partita classificata" : "No rated games yet"),
  noActivities: literal(it ? "Ancora nessuna attività" : "No activities yet"),
};
