// Real, existing Development fixtures only. No tokens, API calls or consent changes.
var ack = typeof STATUS_ACK === "undefined" ? "" : STATUS_ACK;
var locale = typeof STATUS_LOCALE === "undefined" ? "" : STATUS_LOCALE;
var theme = typeof STATUS_THEME === "undefined" ? "" : STATUS_THEME;
var query = typeof STATUS_QUERY === "undefined" ? "" : String(STATUS_QUERY).trim();
var raw = typeof STATUS_INPUT === "undefined" ? "" : STATUS_INPUT;
if (
  ack !== "owned-development-list-fixtures" ||
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  !query ||
  query.length > 80 ||
  !raw
)
  throw new Error(
    "STATUS_ACK, configured EN/IT light/dark device, STATUS_QUERY (1–80) and STATUS_INPUT required; this flow toggles connectivity",
  );
var input = JSON.parse(raw);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !input ||
  ![input.scheduled, input.available, input.terminated, input.history].every(
    (row) =>
      row &&
      uuid.test(row.id) &&
      typeof row.name === "string" &&
      row.name.length <= 120 &&
      row.name.toLowerCase().includes(query.toLowerCase()),
  ) ||
  new Set([input.scheduled.name, input.available.name, input.terminated.name, input.history.name])
    .size !== 4 ||
  !uuid.test(input.history.eventId) ||
  !["public-outsider", "private-member", "public-group-private-member"].includes(
    input.available.kind,
  ) ||
  !Array.isArray(input.history.winnerHandles) ||
  !input.history.winnerHandles.length ||
  !input.history.winnerHandles.every((handle) => /^@[^\s@]+$/.test(handle)) ||
  new Set(input.history.winnerHandles).size !== input.history.winnerHandles.length ||
  typeof input.emptyQuery !== "string" ||
  !input.emptyQuery.trim() ||
  input.emptyQuery.length > 80
)
  throw new Error(
    "Unique real fixture IDs/names containing STATUS_QUERY, public/member availability, actual winner handles and an unmatched query required",
  );
function literal(value) {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
var it = locale === "it";
var eventPrefix = it ? "Apri evento" : "Open event";
var tablePrefix = it ? "Apri tavolo" : "Open table";
output.status = {
  query: query,
  emptyQuery: input.emptyQuery,
  filter: literal(it ? "Filtra" : "Filter"),
  clear: literal(it ? "Cancella filtro" : "Clear filter"),
  retry: literal(it ? "Riprova" : "Try again"),
  scheduled: literal(it ? "Schedulati" : "Scheduled"),
  available: literal(it ? "Disponibili" : "Available"),
  terminated: literal(it ? "Terminati" : "Terminated events"),
  history: literal(it ? "Storico" : "History"),
  sectionGuide: literal(it ? "Guida alla sezione" : "Section guide"),
  emptyEvents: literal(it ? "Nessun evento trovato" : "No events found"),
  emptyTables: literal(it ? "Nessun tavolo trovato" : "No tables found"),
  failedEvents: literal(it ? "Impossibile caricare gli eventi" : "Could not load events"),
  failedTables: literal(it ? "Impossibile caricare i tavoli" : "Could not load tables"),
  scheduledHelp: literal(it ? "Aiuto sugli eventi schedulati" : "Scheduled events help"),
  availableHelp: literal(it ? "Aiuto sugli eventi disponibili" : "Available events help"),
  terminatedHelp: literal(it ? "Aiuto sugli eventi terminati" : "Terminated events help"),
  historyHelp: literal(it ? "Aiuto sullo storico dei tavoli" : "Table history help"),
  scheduledRule: literal(
    it
      ? "Eventi in pianificazione o confermati che gestisci, a cui sei iscritto come giocatore o in cui fai da dimostratore. Sono inclusi i posti in lista d’attesa e gli inviti in sospeso."
      : "Planning or confirmed events where you are a manager, registered player or demonstrator. Waiting-list places and pending invitations are included.",
  ),
  availableRule: literal(
    it
      ? "Eventi di gruppo in pianificazione a cui puoi iscriverti. Per quelli privati serve essere membri del gruppo. Quelli pubblici sono aperti anche a chi non è membro."
      : "Group events in planning that are open for you to join. Private events require group membership. Public events are open to nonmembers too.",
  ),
  terminatedRule: literal(
    it
      ? "Eventi conclusi in cui hai giocato o fatto da dimostratore a un tavolo confermato, oppure che gestisci ancora."
      : "Finished events where you played or demonstrated at a confirmed table, or that you still manage.",
  ),
  historyRule: literal(
    it
      ? "Tavoli confermati di eventi terminati in cui hai giocato o fatto da dimostratore, oppure che gestisci ancora."
      : "Confirmed tables from finished events where you played, were a demonstrator or are still a manager.",
  ),
  names: input,
  scheduledCard: literal(`${eventPrefix}: ${input.scheduled.name}`),
  availableCard: literal(`${eventPrefix}: ${input.available.name}`),
  terminatedCard: literal(`${eventPrefix}: ${input.terminated.name}`),
  historyCard: literal(`${tablePrefix}: ${input.history.name}`),
  historyTableName: literal(input.history.name),
  tableStatus: literal(it ? "Terminata" : "Terminated"),
  dates: literal(`${it ? "Date e Orari" : "Dates and times"}: ${input.history.name}`),
  locations: literal(`${it ? "Luoghi" : "Locations"}: ${input.history.name}`),
  games: literal(`${it ? "Giochi da tavolo" : "Board games"}: ${input.history.name}`),
  minimum: literal(it ? "Giocatori minimi" : "Minimum players"),
  maximum: literal(it ? "Giocatori massimi" : "Maximum players"),
  waiting: literal(it ? "Lista d'attesa" : "Waiting list"),
  winners: literal(input.history.winnerHandles.join(", ")),
};
