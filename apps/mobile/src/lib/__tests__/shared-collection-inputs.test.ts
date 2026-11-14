import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

// Fixture/parser checks only, not authenticated/device UI acceptance.
const source = readFileSync(
  new URL("../../../.maestro/helpers/shared-collection-inputs.js", import.meta.url),
  "utf8",
);
const input = {
  subjectId: "user_subject",
  subjectName: "Club.*(one)",
  unsyncedId: "user_empty",
  unsyncedName: "Empty user",
  expansionName: "Expansion",
  wishlistName: "Wishlist game",
  emptyQuery: "missing[query]",
  commonName: "Common game",
  viewerSynced: true,
};
function run(p: Record<string, unknown> = input, extra: Record<string, unknown> = {}) {
  const context = {
    COLLECTION_SHARED_FIXTURE_ACK: "owned-synchronized-readonly-profiles",
    COLLECTION_BUILD_ACK: "owned-preview-build",
    COLLECTION_LOCALE: "en",
    COLLECTION_SHARED_INPUT: JSON.stringify(p),
    output: {} as { sharedCollection: Record<string, unknown> },
    ...extra,
  };
  runInNewContext(source, context);
  return context.output.sharedCollection;
}
it.each(["en", "it"])("keeps literals/deep links and explicit viewer mode in %s", (locale) => {
  const result = run(input, { COLLECTION_LOCALE: locale });
  expect(result.link).toBe("bgo-dev:///user/user_subject");
  expect(result.viewerSynced).toBe(true);
  expect(new RegExp(String(result.subject)).test(input.subjectName)).toBe(true);
  expect(new RegExp(String(result.subject)).test("ClubXXXone")).toBe(false);
  expect(new RegExp(String(result.emptyValue)).test(input.emptyQuery)).toBe(true);
});
it("allows the explicitly unsynchronized viewer mode without pretending it has common games", () => {
  const result = run({ ...input, viewerSynced: false, commonName: undefined });
  expect(result.viewerSynced).toBe(false);
  expect(result.commonQuery).toBe("");
});
it.each([
  { subjectId: "https://prod.test" },
  { subjectName: "" },
  { unsyncedId: "" },
  { expansionName: "" },
  { wishlistName: "x".repeat(121) },
  { emptyQuery: "" },
  { viewerSynced: "true" },
  { commonName: "" },
])("rejects invalid fixture input %j", (patch) =>
  expect(() => run({ ...input, ...patch })).toThrow(),
);
it.each([
  { COLLECTION_SHARED_FIXTURE_ACK: "" },
  { COLLECTION_BUILD_ACK: "" },
  { COLLECTION_LOCALE: "fr" },
])("requires owned preview/locale acknowledgments %j", (patch) =>
  expect(() => run(input, patch)).toThrow(),
);
