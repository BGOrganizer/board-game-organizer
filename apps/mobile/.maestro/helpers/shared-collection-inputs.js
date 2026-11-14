/* Read-only existing fixtures. No provisioning, synchronization or provider requests. */
if (
  COLLECTION_SHARED_FIXTURE_ACK !== "owned-synchronized-readonly-profiles" ||
  COLLECTION_BUILD_ACK !== "owned-preview-build"
)
  throw new Error("Owned read-only shared collection fixtures/current Preview build required");
if (COLLECTION_LOCALE !== "en" && COLLECTION_LOCALE !== "it")
  throw new Error("Explicit EN/IT locale required");
var p = JSON.parse(COLLECTION_SHARED_INPUT);
if (
  ![p.subjectId, p.unsyncedId].every(
    (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v),
  ) ||
  ![p.subjectName, p.unsyncedName, p.expansionName, p.wishlistName, p.emptyQuery].every(
    (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 120,
  ) ||
  typeof p.viewerSynced !== "boolean" ||
  (p.viewerSynced &&
    (typeof p.commonName !== "string" || !p.commonName.trim() || p.commonName.length > 120))
)
  throw new Error(
    "Explicit visible synced/unsynced subjects, named filter fixtures and viewer mode required",
  );
function exact(v) {
  return "^" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = COLLECTION_LOCALE === "it";
output.sharedCollection = {
  link: "bgo-dev:///user/" + encodeURIComponent(p.subjectId),
  unsyncedLink: "bgo-dev:///user/" + encodeURIComponent(p.unsyncedId),
  subject: exact(p.subjectName),
  unsynced: exact(p.unsyncedName),
  tab: exact(it ? "Collezione" : "Collection"),
  sync: exact(it ? "Sincronizza collezione" : "Sync collection"),
  logout: exact(it ? "Esci dall'account" : "Sign out of your account"),
  empty: exact(it ? "Nessun gioco trovato" : "No games found"),
  clear: exact(it ? "Pulisci ricerca" : "Clear search"),
  expansionQuery: p.expansionName,
  expansion: exact(p.expansionName),
  wishlistQuery: p.wishlistName,
  wishlist: exact(p.wishlistName),
  emptyQuery: p.emptyQuery,
  emptyValue: exact(p.emptyQuery),
  commonQuery: p.commonName || "",
  common: exact(p.commonName || ""),
  viewerSynced: p.viewerSynced,
};
