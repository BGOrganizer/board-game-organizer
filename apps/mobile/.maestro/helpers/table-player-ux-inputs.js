var inputs = {
  TABLE_UX_LOCALE: typeof TABLE_UX_LOCALE === "undefined" ? "" : TABLE_UX_LOCALE,
  TABLE_UX_FREE_PATH: typeof TABLE_UX_FREE_PATH === "undefined" ? "" : TABLE_UX_FREE_PATH,
  TABLE_UX_FULL_PATH: typeof TABLE_UX_FULL_PATH === "undefined" ? "" : TABLE_UX_FULL_PATH,
  TABLE_UX_CONFIRMED_PATH:
    typeof TABLE_UX_CONFIRMED_PATH === "undefined" ? "" : TABLE_UX_CONFIRMED_PATH,
  TABLE_UX_USERNAME: typeof TABLE_UX_USERNAME === "undefined" ? "" : TABLE_UX_USERNAME,
  TABLE_UX_EMAIL: typeof TABLE_UX_EMAIL === "undefined" ? "" : TABLE_UX_EMAIL,
};
function required(key) {
  var value = String(inputs[key] || "").trim();
  if (!value) throw new Error(key + " required for real Table/player UX acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
function parts(kind) {
  var value = required("TABLE_UX_" + kind + "_PATH").match(
    /^\/events\/([\da-f-]{36})\/tables\/([\da-f-]{36})$/,
  );
  if (!value) throw new Error("Invalid TABLE_UX_" + kind + "_PATH");
  return value;
}
function link(kind) {
  var value = parts(kind);
  return "bgo-dev:///event/table?eventId=" + value[1] + "&tableId=" + value[2];
}
var locale = required("TABLE_UX_LOCALE");
if (locale !== "en" && locale !== "it") throw new Error("TABLE_UX_LOCALE must be en or it");
var it = locale === "it";
output.ux = {
  free: link("FREE"),
  full: link("FULL"),
  confirmed: link("CONFIRMED"),
  edit: "bgo-dev:///event/wizard?eventId=" + parts("FREE")[1],
  tableTrigger: "event-draft-table-" + parts("FREE")[2],
  username: literal(required("TABLE_UX_USERNAME")),
  email: literal(required("TABLE_UX_EMAIL")),
  waiting: literal(it ? "Lista d'attesa" : "Waiting list"),
  empty: literal(it ? "Nessun utente in lista d'attesa" : "No players waiting"),
  join: literal(it ? "Mettiti in coda" : "Join waiting list"),
  waitingHelp: literal(it ? "Lista d'attesa: Guida al campo" : "Waiting list: Field help"),
  waitingText: literal(
    it
      ? "I giocatori accettati in attesa possono votare. Gli inviti in sospeso non votano e non contano per l'accordo."
      : "Accepted waiting players may vote. Pending invitations do not vote or count toward agreement.",
  ),
  player: literal(it ? "Giocatore" : "Player"),
  win: literal(it ? "% di vittorie" : "Win %"),
  next: literal(it ? "Avanti" : "Next"),
  name: literal(it ? "Nome tavolo" : "Table name"),
  nameHelp: literal(it ? "Nome tavolo: Guida al campo" : "Table name: Field help"),
  count: literal(it ? "Numero giocatori" : "Number of players"),
  countHelp: literal(it ? "Numero giocatori: Guida al campo" : "Number of players: Field help"),
  countText: literal(
    it
      ? "Scegli il minimo a sinistra e il massimo a destra. Servono almeno due giocatori e il minimo non può superare il massimo."
      : "Choose the minimum on the left and maximum on the right. At least two players are required, and the minimum cannot exceed the maximum.",
  ),
};
