/* Read-only owned fixture. Never provisions accounts, synchronizes BGG or changes data. */
if (
  COLLECTION_FIXTURE_ACK !== "owned-synchronized-bgg-collection" ||
  COLLECTION_BUILD_ACK !== "owned-preview-build"
)
  throw new Error("Owned synchronized collection and current Preview build required");
if (COLLECTION_LOCALE !== "en" && COLLECTION_LOCALE !== "it")
  throw new Error("COLLECTION_LOCALE must be en or it");
var p = JSON.parse(COLLECTION_INPUT);
var names = [p.owner, p.ratedGame, p.unratedGame, p.laterGame, p.emptyQuery];
if (
  !names.every(
    (name) => typeof name === "string" && name.trim().length > 0 && name.length <= 120,
  ) ||
  p.ratedGame === p.unratedGame
)
  throw new Error(
    "Distinct rated/unrated games, later-page game, owner and unmatched filter required",
  );
if (
  ![p.withoutExpansions, p.withExpansions, p.wishlist, p.laterOffset].every(Number.isSafeInteger) ||
  p.withoutExpansions < 0 ||
  p.withExpansions <= 25 ||
  p.withoutExpansions > p.withExpansions ||
  p.wishlist < 0 ||
  p.wishlist > p.withExpansions ||
  p.laterOffset < 25 ||
  p.laterOffset >= p.withExpansions ||
  !Number.isFinite(p.rating) ||
  p.rating < 1 ||
  p.rating > 10
)
  throw new Error(
    "Valid snapshot counts, personal rating and source offset beyond first page required",
  );
var it = COLLECTION_LOCALE === "it";
function exact(text) {
  return "^" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
function count(value) {
  return exact(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, it ? "." : ","));
}
var rating = String(p.rating).replace(".", it ? "," : ".");
var personal = it ? "Voto personale BGG" : "Personal BGG rating";
output.collection = {
  owner: exact(p.owner),
  tab: exact(it ? "Collezione" : "Collection"),
  baseLabel: exact(it ? "Giochi senza espansioni" : "Games without expansions"),
  totalLabel: exact(it ? "Giochi incluse le espansioni" : "Games including expansions"),
  wishlistLabel: exact(it ? "Lista desideri" : "Wishlist"),
  base: count(p.withoutExpansions),
  total: count(p.withExpansions),
  wishlist: count(p.wishlist),
  ratedQuery: p.ratedGame,
  rated: exact(p.ratedGame),
  rating: exact(personal + ": " + rating),
  unratedQuery: p.unratedGame,
  unrated: exact(p.unratedGame),
  unavailable: exact(personal + ": N/A"),
  later: exact(p.laterGame),
  emptyQuery: p.emptyQuery,
  emptyInputText: exact(p.emptyQuery),
  empty: exact(it ? "Nessun gioco trovato" : "No games found"),
  clear: exact(it ? "Pulisci ricerca" : "Clear search"),
};
