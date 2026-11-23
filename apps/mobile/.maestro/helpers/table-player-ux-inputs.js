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
  fullEvent: "bgo-dev:///event/" + parts("FULL")[1],
  tablesTab: literal(it ? "Tavoli" : "Tables"),
  tableList: literal(it ? "Lista tavoli" : "Table list"),
  tableLegend: literal(it ? "Legenda tavoli" : "Table legend"),
  confirmed: link("CONFIRMED"),
  edit: "bgo-dev:///event/wizard?eventId=" + parts("FREE")[1],
  tableTrigger: "event-draft-table-" + parts("FREE")[2],
  username: literal(required("TABLE_UX_USERNAME")),
  email: literal(required("TABLE_UX_EMAIL")),
  waiting: literal(it ? "Lista d'attesa" : "Waiting list"),
  empty: literal(it ? "Nessun utente in lista d'attesa" : "No players waiting"),
  join: literal(it ? "Mettiti in coda" : "Join waiting list"),
  waitingHelp: literal(it ? "Lista d'attesa: Guida al campo" : "Waiting list: Field help"),
  seatsHelp: literal(it ? "Lista posti: Guida al campo" : "Seats list: Field help"),
  participantsHelp: literal(it ? "Aiuto sui partecipanti al tavolo" : "Table participants help"),
  seatsText: literal(
    it
      ? "Gli inviti in attesa non contano per l'accordo."
      : "Pending invitations do not count toward agreement.",
  ),
  acceptedLegend: literal(it ? "Giocatore accettato" : "Accepted player"),
  pendingLegend: literal(it ? "Invito in attesa" : "Invitation pending"),
  waitingLegend: literal(it ? "Giocatore in lista d'attesa" : "Player on the waiting list"),
  demonstratorLegend: literal(it ? "Dimostratore" : "Demonstrator"),
  guestLegend: literal(it ? "Ospite" : "Guest"),
  waitingText: literal(
    it
      ? "I giocatori accettati in lista d’attesa possono votare. Un organizzatore o l’app può assegnare loro un posto secondo le regole del tavolo."
      : "Accepted players on the waiting list can vote. A manager or the app can assign them a seat under the table's rules.",
  ),
  player: literal(it ? "Giocatore" : "Player"),
  win: literal(it ? "% di vittorie" : "Win %"),
  next: literal(it ? "Avanti" : "Next"),
  name: literal(it ? "Nome tavolo" : "Table name"),
  nameHelp: literal(it ? "Nome tavolo: Guida al campo" : "Table name: Field help"),
  nameGuide: literal(
    it
      ? "Scegli un nome riconoscibile per il tavolo, da 5 a 30 caratteri."
      : "Name this table so players can recognize it. Use between 5 and 30 characters.",
  ),
  count: literal(it ? "Numero giocatori" : "Number of players"),
  countHelp: literal(it ? "Numero giocatori: Guida al campo" : "Number of players: Field help"),
  countText: literal(
    it
      ? "Scegli il numero minimo e massimo di giocatori. L'intervallo è limitato dai giochi scelti, secondo i dati di BGG."
      : "Choose the minimum and maximum number of players. The range is limited by the selected games according to BGG data.",
  ),
};
