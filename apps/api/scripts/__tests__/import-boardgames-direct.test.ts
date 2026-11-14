import { describe, expect, it } from "vitest";
import { validateDirectImportTarget } from "../import-boardgames-direct";

const valid = {
  BGG_MONGODB_URI: "mongodb+srv://user:password@preview.example.test/board-game-organizer",
  BGG_DATABASE_NAME: "board-game-organizer",
  BGG_CSV: "boardgames_ranks.csv",
};

describe("direct BGG import target", () => {
  it("requires the attested Preview database name", () => {
    expect(validateDirectImportTarget(valid)).toEqual({
      uri: valid.BGG_MONGODB_URI,
      databaseName: valid.BGG_DATABASE_NAME,
      csvPath: valid.BGG_CSV,
      target: "preview.example.test/board-game-organizer",
    });
  });

  it("accepts a connection string without a database path when the target is confirmed", () => {
    expect(
      validateDirectImportTarget({
        ...valid,
        BGG_MONGODB_URI: "mongodb://localhost:27017",
      }).target,
    ).toBe("localhost:27017/board-game-organizer");
  });

  it.each([
    [{ BGG_MONGODB_URI: "" }, /Set BGG_MONGODB_URI/],
    [{ BGG_CSV: "" }, /Set BGG_MONGODB_URI/],
    [{ BGG_DATABASE_NAME: "bgo_ci_123_1" }, /Only the attested Preview/],
    [{ BGG_DATABASE_NAME: "production" }, /Only the attested Preview/],
    [{ BGG_MONGODB_URI: "mongodb+srv://preview.example.test/production" }, /does not match/],
    [{ BGG_MONGODB_URI: "https://preview.example.test/board-game-organizer" }, /must be a MongoDB/],
    [{ BGG_MONGODB_URI: "not a URI" }, /Invalid MongoDB/],
  ])("rejects unsafe import configuration %j", (override, error) => {
    expect(() => validateDirectImportTarget({ ...valid, ...override })).toThrow(error);
  });
});
