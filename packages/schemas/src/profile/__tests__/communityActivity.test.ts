import { expect, it } from "vitest";
import { communityActivityQuerySchema } from "../dto/profileView";

it("accepts only a ten-row, cursor-paged current-network selection", () => {
  expect(communityActivityQuerySchema.parse({})).toEqual({ network: "all", limit: 10 });
  for (const network of ["all", "friends", "following"])
    expect(
      communityActivityQuerySchema.parse({
        network,
        limit: "10",
        cursor: "2030-01-01T00:00:00.000Z|11111111-1111-4111-8111-111111111111",
      }).network,
    ).toBe(network);
  for (const input of [
    { network: "followers" },
    { limit: 5 },
    { limit: 100 },
    { kind: "played" },
    { viewer: "other" },
    { cursor: "secret" },
    { cursor: "2030-01-01T00:00:00Z|11111111-1111-4111-8111-111111111111" },
    { cursor: "2030-01-01T00:00:00.000Z|bad" },
  ])
    expect(communityActivityQuerySchema.safeParse(input).success).toBe(false);
});
