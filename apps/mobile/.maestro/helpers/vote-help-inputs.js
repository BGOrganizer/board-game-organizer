// Existing owned PRIVATE PLANNING resources; current session, configured EN/IT. No writes.
var ack = typeof VOTE_HELP_ACK === "undefined" ? "" : VOTE_HELP_ACK;
var locale = typeof VOTE_HELP_LOCALE === "undefined" ? "" : VOTE_HELP_LOCALE;
var raw = typeof VOTE_HELP_FIXTURES === "undefined" ? "" : VOTE_HELP_FIXTURES;
if (ack !== "owned-development-resources" || !["en", "it"].includes(locale) || !raw)
  throw new Error("VOTE_HELP_ACK, VOTE_HELP_LOCALE and VOTE_HELP_FIXTURES required");
var fixtures = JSON.parse(raw);
var uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !Array.isArray(fixtures) ||
  fixtures.length !== 2 ||
  !fixtures.every(
    (f) =>
      f &&
      uuid.test(f.eventId) &&
      uuid.test(f.tableId) &&
      typeof f.multiple === "boolean" &&
      [f.eventName, f.tableName].every(
        (s) => typeof s === "string" && s.trim().length > 0 && s.length <= 120,
      ),
  ) ||
  !fixtures.some((f) => f.multiple) ||
  !fixtures.some((f) => !f.multiple)
)
  throw new Error(
    "Two real PLANNING fixtures with eventId, tableId, eventName, tableName, multiple required",
  );
function exact(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = locale === "it";
var labels = it
  ? ["Date e Orari", "Luoghi", "Giochi da tavolo"]
  : ["Dates and times", "Locations", "Board games"];
output.voteHelp = {
  index: 0,
  cases: [],
  positive: exact(
    it
      ? 'Scegli almeno un\'opzione "Sì" o "Se necessario" in questa categoria.'
      : 'Choose at least one "Yes" or "If needed" option in this category.',
  ),
  yes: exact(it ? "Sì" : "Yes"),
  needed: exact(it ? "Se necessario" : "If needed"),
  no: "^No$",
  voteAction:
    ".+: (" +
    (it
      ? "Mostra voti|Scegli il tuo voto|Sì|Se necessario|No"
      : "Show votes|Choose your vote|Yes|If needed|No") +
    ")$",
  tableParticipantsHelp: exact(it ? "Aiuto sui partecipanti al tavolo" : "Table participants help"),
  queueRule: exact(
    it
      ? "Se tutti i posti sono occupati, i nuovi giocatori entrano in lista d’attesa."
      : "If all seats are taken, new players join the waiting list.",
  ),
  eventDetailsHelp: exact(it ? "Aiuto sui dettagli dell’evento" : "Event details help"),
  combined: exact(it ? "Date, orari e luoghi" : "Dates, times and locations"),
  choose: exact(it ? "Scegli il tuo voto" : "Choose your vote"),
  show: exact(it ? "Mostra voti" : "Show votes"),
  votes: exact(it ? "Voti" : "Votes"),
  obsolete: exact(it ? "Guida al campo" : "Field help"),
};
fixtures.forEach((f) => {
  labels.forEach((label, index) => {
    output.voteHelp.cases.push({
      link:
        index === 2
          ? "bgo-dev:///event/table?eventId=" + f.eventId + "&tableId=" + f.tableId
          : "bgo-dev:///event/" + f.eventId,
      name: exact(index === 2 ? f.tableName : f.eventName),
      heading: exact(label),
      table: index === 2,
      dates: index === 0,
      oldTrigger: exact(label + ": " + (it ? "Legenda voti" : "Voting legend")),
      trigger: exact(
        index === 2
          ? it
            ? "Aiuto sui dettagli del tavolo"
            : "Table details help"
          : label + ": " + (it ? "Legenda voti" : "Voting legend"),
      ),
      multiple: f.multiple,
      participation: exact(
        index === 2
          ? it
            ? "Puoi votare solo se partecipi a questo tavolo con iscrizione accettata."
            : "You can vote only if you are an accepted participant at this table."
          : it
            ? "Puoi votare solo se partecipi ad almeno un tavolo dell'evento con iscrizione accettata."
            : "You can vote only if you are an accepted participant in at least one table in the event.",
      ),
    });
  });
});
