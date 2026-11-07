import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  new URL("../../../.maestro/helpers/profile-collection-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  owner: "owner [me]",
  withoutExpansions: 1000,
  withExpansions: 1010,
  wishlist: 5,
  ratedGame: "Rated [game]",
  rating: 8.5,
  unratedGame: "Unrated",
  laterGame: "Later",
  laterOffset: 25,
  emptyQuery: "no-such-title",
};
function run(input: unknown = fixture, overrides: Record<string, unknown> = {}) {
  const output: { collection?: Record<string, string> } = {};
  runInNewContext(script, {
    COLLECTION_FIXTURE_ACK: "owned-synchronized-bgg-collection",
    COLLECTION_BUILD_ACK: "owned-preview-build",
    COLLECTION_LOCALE: "en",
    COLLECTION_INPUT: JSON.stringify(input),
    ...overrides,
    output,
  });
  if (!output.collection) throw new Error("Missing collection selectors");
  return output.collection;
}
describe("read-only real collection fixture inputs", () => {
  it.each(["en", "it"])("builds exact localized selectors without provider calls: %s", (locale) => {
    const result = run(fixture, { COLLECTION_LOCALE: locale });
    expect(new RegExp(result.owner).test(fixture.owner)).toBe(true);
    expect(new RegExp(result.rated).test("Rated game")).toBe(false);
    expect(new RegExp(result.base).test(locale === "it" ? "1.000" : "1,000")).toBe(true);
    expect(
      new RegExp(result.rating).test(
        locale === "it" ? "Voto personale BGG: 8,5" : "Personal BGG rating: 8.5",
      ),
    ).toBe(true);
    expect(result.unavailable).toContain("N/A");
    expect(result.later).toBe("^Later$");
  });
  it.each([
    { COLLECTION_FIXTURE_ACK: "" },
    { COLLECTION_BUILD_ACK: "" },
    { COLLECTION_LOCALE: "fr" },
    { COLLECTION_INPUT: "{" },
  ])("fails closed on missing authority, locale or malformed JSON: %j", (overrides) => {
    expect(() => run(fixture, overrides)).toThrow();
  });
  it.each([
    { owner: "" },
    { ratedGame: "Unrated" },
    { rating: 0 },
    { rating: 11 },
    { wishlist: -1 },
    { wishlist: 1011 },
    { withExpansions: 25 },
    { withoutExpansions: 1011 },
    { laterOffset: 24 },
    { laterOffset: 1010 },
    { laterOffset: 25.5 },
  ])("rejects incomplete or inconsistent real fixtures: %j", (change) => {
    expect(() => run({ ...fixture, ...change })).toThrow();
  });
});
