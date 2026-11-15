/** Called only after the attested full CSV import succeeds. No provider credentials leave the API. */
export async function enrichBoardGames(
  endpoint,
  token,
  fetcher = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const url = new URL(endpoint);
  url.pathname += "/enrich";
  let offset = 0,
    recovered = 0,
    skipped = 0,
    failed = 0;
  while (offset !== null) {
    let result;
    let batchSkipped = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetcher(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ offset }),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Enrichment HTTP ${response.status}; CSV remains imported`);
      result = await response.json();
      if (
        !Number.isInteger(result.count) ||
        result.count < 0 ||
        result.count > 20 ||
        result.incomplete < 0 ||
        result.recovered < 0 ||
        result.skipped < 0 ||
        result.incomplete + result.recovered + result.skipped !== result.count ||
        !Number.isFinite(result.retryAfterMs) ||
        result.retryAfterMs < 5000 ||
        !Number.isInteger(result.incomplete) ||
        !Number.isInteger(result.recovered) ||
        !Number.isInteger(result.skipped) ||
        !(
          result.nextOffset === null ||
          (Number.isInteger(result.nextOffset) &&
            result.nextOffset > offset &&
            result.nextOffset <= 200)
        )
      )
        throw new Error("Invalid enrichment receipt; CSV remains imported");
      if (attempt === 0) batchSkipped = result.skipped;
      recovered += result.recovered;
      if (!result.incomplete) break;
      if (attempt < 2) await wait(Math.max(5000, Math.min(60000, result.retryAfterMs)));
    }
    skipped += batchSkipped;
    failed += result.incomplete;
    offset = result.nextOffset;
    if (offset !== null) await wait(Math.max(5000, Math.min(60000, result.retryAfterMs)));
  }
  console.log(JSON.stringify({ enrichment: { recovered, skipped, failed } }));
  if (failed)
    throw new Error(
      `Enrichment incomplete for ${failed} games; rerun to resume. CSV remains imported.`,
    );
  return { recovered, skipped, failed };
}
