import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ geocode: vi.fn(), zone: vi.fn(() => "Europe/Rome") }));
vi.mock("../geocoding", async (original) => ({
  ...(await original<typeof import("../geocoding")>()),
  geocodeAddresses: mocks.geocode,
}));
vi.mock("../location-time-zone", () => ({ locationTimeZone: mocks.zone }));

import { findVerifiedAddress, verifyCommunityLocation } from "../community-location";
import { GeocodingError } from "../geocoding";

const location = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Private venue",
  address: "Private address 11",
  longitude: 12.51,
  latitude: 41.91,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.geocode.mockResolvedValue([location]);
});
afterEach(() => vi.restoreAllMocks());
const entries = () => vi.mocked(console.info).mock.calls.map(([, value]) => value);
it("reuses only an exact existing verified key without another provider lookup", async () => {
  const previous = { ...location, name: "Previous name" };
  expect(
    await verifyCommunityLocation(location, [{ ...previous, longitude: 1 }, previous]),
  ).toEqual({ ...location, timeZone: "Europe/Rome" });
  expect(mocks.geocode).not.toHaveBeenCalled();
  expect(mocks.zone).toHaveBeenCalledWith(previous);
});
it("keeps strict normalized-address/coordinate matching and canonical provider fields", async () => {
  const canonical = { ...location, address: `  ${location.address.toUpperCase()} ` };
  mocks.geocode.mockResolvedValue([canonical]);
  expect(await verifyCommunityLocation(location)).toEqual({
    ...location,
    address: canonical.address,
    timeZone: "Europe/Rome",
  });
  expect(mocks.geocode).toHaveBeenCalledWith(location.address);
  expect(entries().at(-1)).toMatchObject({
    phase: "matched",
    candidateCount: 1,
    addressMatch: true,
    coordinateMatch: true,
    status: 200,
  });
});
it("canonicalizes one exact address using only provider coordinates and timezone", async () => {
  const canonical = { ...location, longitude: 1, latitude: 2 };
  mocks.geocode.mockResolvedValue([canonical]);
  expect(await verifyCommunityLocation({ ...location, timeZone: "Pacific/Honolulu" })).toEqual({
    ...canonical,
    timeZone: "Europe/Rome",
  });
  expect(mocks.zone).toHaveBeenCalledWith(canonical);
  expect(entries().at(-1)).toMatchObject({
    phase: "matched",
    addressMatch: true,
    coordinateMatch: false,
    canonicalized: true,
    addressCandidateCount: 1,
  });
});
it("prefers an exact key among ambiguous labels, never the first same-address candidate", async () => {
  mocks.geocode.mockResolvedValue([{ ...location, longitude: 1 }, location]);
  expect(await findVerifiedAddress(location)).toEqual(location);
  expect(entries().at(-1)).toMatchObject({ canonicalized: false, addressCandidateCount: 2 });
});
it.each([
  [[], false, false],
  [
    [
      { ...location, longitude: 1 },
      { ...location, longitude: 2 },
    ],
    true,
    false,
  ],
  [[{ ...location, address: "Different address" }], false, true],
  [
    [
      { ...location, longitude: 1 },
      { ...location, longitude: 2 },
      { ...location, address: "Different address" },
    ],
    true,
    true,
  ],
] as const)(
  "reports mismatch dimensions without accepting a different provider candidate",
  async (candidates, addressMatch, coordinateMatch) => {
    mocks.geocode.mockResolvedValue(candidates);
    expect(await findVerifiedAddress(location)).toBeUndefined();
    await expect(verifyCommunityLocation(location)).rejects.toMatchObject({
      status: 400,
      message: "CHOOSE_VERIFIED_ADDRESS",
    });
    expect(entries().at(-1)).toMatchObject({
      phase: "rejected",
      candidateCount: candidates.length,
      addressMatch,
      coordinateMatch,
      code: "CHOOSE_VERIFIED_ADDRESS",
    });
    const text = JSON.stringify(entries());
    for (const value of [
      location.address,
      location.name,
      location.id,
      String(location.longitude),
      String(location.latitude),
    ])
      expect(text).not.toContain(value);
  },
);
it.each([new GeocodingError("private provider URL", 503), new Error("private transport URL")])(
  "keeps upstream semantics and logs no provider error text",
  async (failure) => {
    mocks.geocode.mockRejectedValue(failure);
    if (failure instanceof GeocodingError)
      await expect(verifyCommunityLocation(location)).rejects.toMatchObject({
        status: 503,
        message: "GEOCODING_UNAVAILABLE",
      });
    else await expect(verifyCommunityLocation(location)).rejects.toBe(failure);
    expect(entries().at(-1)).toMatchObject({
      phase: "failed",
      status: failure instanceof GeocodingError ? 503 : 500,
    });
    expect(JSON.stringify(entries())).not.toContain(failure.message);
  },
);
