/* Existing owned Development fixtures only. Enrollment persists; finalization is irreversible. */
if (
  EVENT_ACCESS_FIXTURE_ACK !== "owned-disposable-event-access" ||
  EVENT_ACCESS_BUILD_ACK !== "owned-preview-build"
)
  throw new Error("Owned Preview build and fixtures required");
if (
  !/^https?:\/\/(localhost|127\.0\.0\.1|[a-z0-9.-]+\.vercel\.app)([:/]|$)/i.test(
    EVENT_ACCESS_API_URL,
  )
)
  throw new Error("Local/Preview API only");
if (
  ["shared", "denied", "enroll", "picker", "finalize", "draft", "presentation"].indexOf(
    EVENT_ACCESS_MODE,
  ) < 0 ||
  ["en", "it"].indexOf(EVENT_ACCESS_LOCALE) < 0
)
  throw new Error("Explicit mode and EN/IT locale required");
if (
  EVENT_ACCESS_MODE === "finalize" &&
  EVENT_ACCESS_WRITE_ACK !== "irreversible-owned-disposable-finalization"
)
  throw new Error("Explicit irreversible finalization acknowledgment required");
var p = JSON.parse(EVENT_ACCESS_INPUT);
if (
  ![p.eventId, p.tableId].every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) ||
  ![p.eventName, p.tableName].every((name) => typeof name === "string" && name.trim())
)
  throw new Error("Named Event/Table fixtures required");
if (
  EVENT_ACCESS_MODE === "shared" &&
  ![p.playerName, p.ndName].every((name) => typeof name === "string" && name.trim())
)
  throw new Error("Played and ND usernames required");
if (
  EVENT_ACCESS_MODE === "picker" &&
  ![p.ownOnlyName, p.participantOnlyName, p.catalogOnlyName, p.emptyQuery].every(
    (name) => typeof name === "string" && name.length >= 4,
  )
)
  throw new Error("Distinct source titles and empty query required");
if (
  EVENT_ACCESS_MODE === "enroll" &&
  (typeof p.groupId !== "string" || !/^[0-9a-f-]{36}$/i.test(p.groupId))
)
  throw new Error("Public Group identifier required for no-membership verification");
if (
  EVENT_ACCESS_MODE === "draft" &&
  (typeof p.catalogOnlyName !== "string" || p.catalogOnlyName.length < 4)
)
  throw new Error("Catalog fixture with verified BGG 2–4 player pair required");
if (
  EVENT_ACCESS_MODE === "presentation" &&
  (!/^[0-9a-f-]{36}$/i.test(p.groupId || "") ||
    ![p.groupName, p.gameName].every((name) => typeof name === "string" && name.trim()) ||
    ["PRIVATE", "PUBLIC"].indexOf(p.groupType) < 0)
)
  throw new Error(
    "Owned grouped presentation fixture with exact Group/game names and type required",
  );
function exact(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = EVENT_ACCESS_LOCALE === "it";
output.access = {
  mode: EVENT_ACCESS_MODE,
  next: exact(it ? "Avanti" : "Next"),
  loadEvent: exact(it ? "Impossibile caricare l'evento" : "Could not load event"),
  loadTable: exact(it ? "Impossibile caricare il tavolo" : "Could not load table"),
  eventLink: "bgo:///event/" + p.eventId,
  tableLink: "bgo:///event/table?eventId=" + p.eventId + "&tableId=" + p.tableId,
  editLink: "bgo:///event/wizard?eventId=" + p.eventId,
  groupLink: "bgo:///group/" + (p.groupId || ""),
  eventName: exact(p.eventName),
  tableName: exact(p.tableName),
  shared: exact(
    it
      ? "Risultati finali condivisi. I dettagli del gruppo sono nascosti."
      : "Shared finalized results. Group details are hidden.",
  ),
  participants: exact(it ? "Partecipanti" : "Participants"),
  overview: exact(it ? "Dettagli" : "Details"),
  tables: exact(it ? "Tavoli" : "Tables"),
  events: exact(it ? "Eventi" : "Events"),
  seats: exact(it ? "Lista posti" : "Seats list"),
  openGroup: exact((it ? "Apri gruppo: " : "Open group: ") + (p.groupName || "")),
  openEvent: exact((it ? "Apri evento: " : "Open event: ") + p.eventName),
  gamesHelp: exact((it ? "Giochi da tavolo: " : "Board games: ") + p.tableName),
  approvedGame: exact(p.gameName || ""),
  groupListTab: exact(
    p.groupType === "PUBLIC"
      ? it
        ? "Pubblici"
        : "Public groups"
      : it
        ? "Privati"
        : "Private groups",
  ),
  groupFilter: p.groupName || "",
  eventFilter: p.eventName,
  tableFilter: p.tableName,
  results: exact(it ? "Risultati" : "Results"),
  ranking: "^Ranking$",
  player: exact(p.playerName || ""),
  nd: exact(p.ndName || ""),
  join: exact(it ? "Iscriviti al tavolo" : "Join table"),
  entry: it ? "^(Posto libero|Mettiti in coda)$" : "^(Free place|Join waiting list)$",
  leave: exact(it ? "Abbandona tavolo" : "Leave table"),
  review: exact(it ? "Rivedi le impostazioni del tavolo" : "Review table settings"),
  request: exact(it ? "Richiedi l'appartenenza" : "Request membership"),
  finalize: exact(it ? "Finalizza evento" : "Finalize event"),
  finalizeTitle: exact(it ? "Finalizzare evento?" : "Finalize event?"),
  cancel: exact(it ? "Annulla" : "Cancel"),
  chooseGame: exact(it ? "Scegli un gioco" : "Choose a game"),
  empty: exact(it ? "Nessun gioco trovato" : "No games found"),
  back: exact(it ? "Indietro" : "Back"),
  ownName: exact(p.ownOnlyName || ""),
  participantName: exact(p.participantOnlyName || ""),
  catalogName: exact(p.catalogOnlyName || ""),
  ownQuery: p.ownOnlyName || "",
  participantQuery: p.participantOnlyName || "",
  catalogQuery: p.catalogOnlyName || "",
  emptyQuery: p.emptyQuery || "",
  groupDraftLink: "bgo:///group/wizard",
  groupName: exact(it ? "Nome del gruppo" : "Group name"),
  increaseMinimum: exact(it ? "Aumenta: Giocatori minimi" : "Increase: Minimum players"),
  increaseMaximum: exact(it ? "Aumenta: Giocatori massimi" : "Increase: Maximum players"),
  decreaseMinimum: exact(it ? "Diminuisci: Giocatori minimi" : "Decrease: Minimum players"),
  decreaseMaximum: exact(it ? "Diminuisci: Giocatori massimi" : "Decrease: Maximum players"),
  minimumTwo: exact(it ? "Giocatori minimi: 2" : "Minimum players: 2"),
  minimumThree: exact(it ? "Giocatori minimi: 3" : "Minimum players: 3"),
  maximumFour: exact(it ? "Giocatori massimi: 4" : "Maximum players: 4"),
  maximumFive: exact(it ? "Giocatori massimi: 5" : "Maximum players: 5"),
  gameSelect: exact((it ? "Seleziona: " : "Select: ") + (p.catalogOnlyName || "")),
  originalGameRemove: it ? "^Rimuovi gioco: .+" : "^Remove game: .+",
  draftGameRemove: exact((it ? "Rimuovi gioco: " : "Remove game: ") + (p.catalogOnlyName || "")),
  gameBounds: exact(
    (it ? "Limiti di giocatori di BoardGameGeek" : "BoardGameGeek player limits") + ": 2–4",
  ),
};
