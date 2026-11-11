var inputs = {
  STATUS_LOCALE: typeof STATUS_LOCALE === "undefined" ? "" : STATUS_LOCALE,
  STATUS_QUERY: typeof STATUS_QUERY === "undefined" ? "" : STATUS_QUERY,
  STATUS_EVENT_CONFIRMED:
    typeof STATUS_EVENT_CONFIRMED === "undefined" ? "" : STATUS_EVENT_CONFIRMED,
  STATUS_EVENT_PLANNING: typeof STATUS_EVENT_PLANNING === "undefined" ? "" : STATUS_EVENT_PLANNING,
  STATUS_EVENT_TERMINATED:
    typeof STATUS_EVENT_TERMINATED === "undefined" ? "" : STATUS_EVENT_TERMINATED,
  STATUS_TABLE_CONFIRMED:
    typeof STATUS_TABLE_CONFIRMED === "undefined" ? "" : STATUS_TABLE_CONFIRMED,
  STATUS_TABLE_PLANNING: typeof STATUS_TABLE_PLANNING === "undefined" ? "" : STATUS_TABLE_PLANNING,
  STATUS_TABLE_TERMINATED:
    typeof STATUS_TABLE_TERMINATED === "undefined" ? "" : STATUS_TABLE_TERMINATED,
};
function required(key) {
  var value = String(inputs[key] || "").trim();
  if (!value) throw new Error(key + " required for real lifecycle-filter acceptance");
  return value;
}
function literal(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var locale = required("STATUS_LOCALE"),
  query = required("STATUS_QUERY");
if (locale !== "en" && locale !== "it") throw new Error("STATUS_LOCALE must be en or it");
if (query.length > 120) throw new Error("STATUS_QUERY must be at most 120 characters");
var it = locale === "it";
output.status = {
  query: query,
  filter: literal(it ? "Filtra" : "Filter"),
  clear: literal(it ? "Cancella filtro" : "Clear filter"),
  registered: literal(it ? "Partecipazione" : "Participation"),
  emptyEvents: literal(it ? "Nessun evento trovato" : "No events found"),
  emptyTables: literal(it ? "Nessun tavolo trovato" : "No tables found"),
};
for (const resource of ["EVENT", "TABLE"]) {
  output.status[resource] = {};
  for (const state of resource === "TABLE"
    ? ["CONFIRMED", "TERMINATED"]
    : ["CONFIRMED", "PLANNING", "TERMINATED"]) {
    const name = required(`STATUS_${resource}_${state}`);
    if (!name.toLowerCase().includes(query.toLowerCase()))
      throw new Error("Every owned fixture name must contain STATUS_QUERY");
    output.status[resource][state] = literal(name);
  }
}
