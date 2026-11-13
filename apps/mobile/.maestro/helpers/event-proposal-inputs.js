var ack = typeof EVENT_PROPOSAL_FIXTURE_ACK === "undefined" ? "" : EVENT_PROPOSAL_FIXTURE_ACK;
var build = typeof EVENT_PROPOSAL_BUILD_ACK === "undefined" ? "" : EVENT_PROPOSAL_BUILD_ACK;
var locale = typeof EVENT_PROPOSAL_LOCALE === "undefined" ? "" : EVENT_PROPOSAL_LOCALE;
if (
  ack !== "owned-disposable-event-proposals" ||
  build !== "owned-preview-build" ||
  (locale !== "en" && locale !== "it")
)
  throw new Error(
    "Owned disposable proposal fixture, current Preview APK and EN/IT locale required. Real writes may remain after failure; no provisioning/reset runs.",
  );
var p = JSON.parse(EVENT_PROPOSAL_INPUT),
  uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !uuid.test(p.eventId) ||
  !uuid.test(p.tableId) ||
  !["submit-game", "accept", "reject"].includes(p.mode) ||
  !Number.isSafeInteger(p.gameId) ||
  p.gameId < 1 ||
  typeof p.gameName !== "string" ||
  p.gameName.trim().length < 1 ||
  p.gameName.length > 120 ||
  !Number.isInteger(p.proposalOffset) ||
  p.proposalOffset < 0 ||
  p.proposalOffset > 24
)
  throw new Error(
    "Valid private Event/Table, base game, explicit mode and proposal source offset0-24 required",
  );
if (
  p.mode === "submit-game"
    ? typeof p.gameQuery !== "string" || p.gameQuery.trim().length < 4 || p.gameQuery.length > 120
    : !uuid.test(p.proposalId) ||
      typeof p.proposerName !== "string" ||
      p.proposerName.trim().length < 1 ||
      p.proposerName.length > 120
)
  throw new Error(
    "Submission requires a catalog query; review requires an exact pending proposal and username-first proposer",
  );
if (
  p.proposerNames !== undefined &&
  (!Array.isArray(p.proposerNames) ||
    p.proposerNames.length < 2 ||
    p.proposerNames.some((name) => typeof name !== "string" || !name.trim() || name.length > 120))
)
  throw new Error("Grouped review requires every exact displayed proposer username");
function exact(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = locale === "it",
  action = p.mode === "accept" ? (it ? "Accetta" : "Accept") : it ? "Rifiuta" : "Reject";
output.eventProposal = {
  submitting: p.mode === "submit-game",
  pages: Math.floor(p.proposalOffset / 5),
  link: "bgo-dev:///event/table?eventId=" + p.eventId + "&tableId=" + p.tableId,
  own: exact(it ? "Giochi Proposti" : "Proposed games"),
  empty: exact(it ? "Nessuna proposta" : "No proposals"),
  noGames: exact(it ? "Nessun gioco trovato" : "No games found"),
  add: exact(it ? "Scegli un gioco" : "Choose a game"),
  choose: exact(it ? "Scegli un gioco" : "Choose a game"),
  select: exact((it ? "Seleziona" : "Select") + ": " + p.gameName),
  game: exact(p.gameName),
  query: p.gameQuery || "",
  send: exact(it ? "Invia proposta" : "Send proposal"),
  cancel: exact(it ? "Annulla" : "Cancel"),
  back: exact(it ? "Indietro" : "Back"),
  rowId: p.mode === "submit-game" ? "event-proposal-.*" : "event-proposal-" + p.proposalId,
  pending: exact(it ? "In attesa" : "Pending"),
  next: exact(it ? "Avanti" : "Next"),
  more: exact(it ? "Carica altro" : "Load more"),
  review: exact((it ? "Valuta proposta" : "Review proposal") + ": " + p.gameName),
  title: exact(it ? "Valuta proposta" : "Review proposal"),
  action: exact(action),
  actionId: p.mode === "reject" ? "confirmation-action-1" : "confirmation-action-0",
  authors: p.mode === "submit-game" ? [] : (p.proposerNames || [p.proposerName]).map(exact),
  result: exact(
    p.mode === "accept" ? (it ? "Accettato" : "Accepted") : it ? "Rifiutata" : "Rejected",
  ),
};
