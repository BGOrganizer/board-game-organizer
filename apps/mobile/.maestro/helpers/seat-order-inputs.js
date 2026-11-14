// Owned existing fixtures only. No tokens, API calls, provisioning or resets.
var ack = typeof SEAT_ORDER_ACK === "undefined" ? "" : SEAT_ORDER_ACK;
var locale = typeof SEAT_ORDER_LOCALE === "undefined" ? "" : SEAT_ORDER_LOCALE;
var theme = typeof SEAT_ORDER_THEME === "undefined" ? "" : SEAT_ORDER_THEME;
if (
  ack !== "owned-disposable-development-seats" ||
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme)
)
  throw new Error(
    "Owned disposable Development seats, configured EN/IT device and light/dark theme required; this flow saves/removes registrations",
  );
var p = JSON.parse(SEAT_ORDER_INPUT);
var modes = [
  "swap",
  "pending",
  "demote",
  "manual-remove",
  "manual-exit",
  "assisted-remove",
  "save-offline",
  "conflict",
  "scroll",
];
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !modes.includes(p.case) ||
  ![p.eventId, p.tableId, p.a, p.b, p.c, p.last].every((id) => uuid.test(id)) ||
  new Set([p.a, p.b, p.c]).size !== 3 ||
  !Number.isSafeInteger(p.version) ||
  p.version < 1 ||
  !p.initial ||
  typeof p.initial !== "object" ||
  Array.isArray(p.initial) ||
  !Object.entries(p.initial).every(
    ([id, seat]) => uuid.test(id) && (seat === null || (Number.isSafeInteger(seat) && seat >= 0)),
  ) ||
  p.initial[p.a] !== 0 ||
  p.initial[p.b] !== 1 ||
  p.initial[p.c] !== 2 ||
  !(p.last in p.initial)
)
  throw new Error(
    "Valid case and exact existing A0/B1-locked/C2 registration IDs/positions/version required",
  );
var removing = ["manual-remove", "manual-exit", "assisted-remove"].includes(p.case);
if (
  (p.case !== "scroll" && Object.keys(p.initial).length !== 3) ||
  (p.case === "scroll" && Object.keys(p.initial).length <= 12) ||
  (removing && (typeof p.targetName !== "string" || !p.targetName.trim() || p.last === p.a))
)
  throw new Error(
    "Use A/B/C only except for scroll>12; removal needs a targetName and a surviving last row",
  );
if (
  p.case === "conflict" &&
  (typeof SEAT_ORDER_CONCURRENT_ACK === "undefined" ||
    SEAT_ORDER_CONCURRENT_ACK !== "owned-manager-will-edit-event-title")
)
  throw new Error(
    "Conflict case requires an external owned manager to edit only the Event title after the draft appears",
  );
function literal(value) {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
var it = locale === "it";
function assertions(positions, pendingLocked) {
  return Object.entries(positions)
    .map(([id, seat]) => ({
      id: id,
      position: seat,
      locked: id === p.b || (p.case === "pending" && id === p.c && pendingLocked),
    }))
    .sort((a, b) =>
      a.position === null
        ? b.position === null
          ? 0
          : 1
        : b.position === null
          ? -1
          : a.position - b.position,
    )
    .map((row, index, rows) =>
      Object.assign({}, row, { previousId: index ? rows[index - 1].id : null }),
    );
}
var draft = Object.assign({}, p.initial),
  expected = Object.assign({}, p.initial);
if (p.case === "demote") draft[p.c] = expected[p.c] = null;
else if (removing) {
  delete expected[p.a];
  if (p.case === "assisted-remove") expected[p.c] = 0;
} else if (p.case !== "scroll") {
  draft[p.a] = 2;
  draft[p.c] = 0;
  if (!["save-offline", "conflict"].includes(p.case)) {
    expected[p.a] = 2;
    expected[p.c] = 0;
  }
}
var before = assertions(p.initial, false),
  after = assertions(expected, true),
  edited = assertions(draft, true);
if (!["save-offline", "conflict"].includes(p.case) && after[after.length - 1].id !== p.last)
  throw new Error("last must be the actual final physical/queued registration for this case");
output.seats = {
  mode: p.case,
  removing: removing,
  a: p.a,
  b: p.b,
  c: p.c,
  last: p.last,
  link: `bgo-dev:///event/table?eventId=${p.eventId}&tableId=${p.tableId}`,
  participants: literal(it ? "Partecipanti" : "Participants"),
  reorder: literal(it ? "Riordina posti" : "Reorder seats"),
  review: literal(it ? "Verifica l'elenco aggiornato" : "Review latest roster"),
  waiting: literal(it ? "Lista d'attesa" : "Waiting list"),
  empty: literal(it ? "Nessun utente in lista d'attesa" : "No players waiting"),
  freeFirst: literal(`${it ? "Posto libero" : "Free place"}: ${p.case === "demote" ? "3–4" : "1"}`),
  freeLast: literal(it ? "Posto libero: 4" : "Free place: 4"),
  lock: literal(it ? "Blocca giocatore" : "Lock player"),
  unlock: literal(it ? "Sblocca giocatore" : "Unlock player"),
  pending: literal(it ? "Giocatore con invito pendente" : "Player with pending invitation"),
  failure: literal(it ? "Impossibile salvare l'ordine dei posti" : "Could not save seat order"),
  stale: literal(
    it
      ? "L'elenco dei giocatori è cambiato. Verifica l'elenco aggiornato prima di salvare."
      : "The roster changed. Review a fresh snapshot before saving.",
  ),
  remove: literal(
    p.case === "manual-exit"
      ? it
        ? "Abbandona tavolo"
        : "Leave table"
      : `${it ? "Rimuovi giocatore" : "Remove player"}: ${p.targetName}`,
  ),
  confirm: literal(it ? "Conferma" : "Confirm"),
  before: before,
  draft: edited,
  after: after,
  assertions: before.slice(0, 3),
  index: 0,
  screenshot: `seat-order-${p.case}-${locale}-${theme}`,
};
