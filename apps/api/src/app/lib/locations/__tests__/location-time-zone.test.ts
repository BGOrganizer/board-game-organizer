import { find } from "geo-tz";
import { afterEach, expect, it, vi } from "vitest";
import { locationTimeZone } from "../location-time-zone";

vi.mock("geo-tz", { spy: true });
afterEach(() => vi.clearAllMocks());
it.each([
  { latitude: 41.9028, longitude: 12.4964, zone: "Europe/Rome" },
  { latitude: 40.748, longitude: -73.985, zone: "America/New_York" },
  { latitude: 51.5, longitude: -0.12, zone: "Europe/London" },
  { latitude: 22.57, longitude: 88.36, zone: "Asia/Kolkata" },
  { latitude: 27.717, longitude: 85.324, zone: "Asia/Kathmandu" },
  { latitude: -33.8688, longitude: 151.2093, zone: "Australia/Sydney" },
  { latitude: -12.46, longitude: 130.84, zone: "Australia/Darwin" },
  { latitude: 33.45, longitude: -112.07, zone: "America/Phoenix" },
])(
  "uses geographic boundaries, including fractional offsets and DST: $zone",
  ({ latitude, longitude, zone }) => {
    const expected = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    expect(locationTimeZone({ latitude, longitude })).toBe(expected);
    expect(find).toHaveBeenCalledWith(latitude, longitude);
  },
);
it.each([{ zones: [] }, { zones: ["Europe/Rome", "Europe/Berlin"] }, { zones: ["invalid/zone"] }])(
  "fails closed for absent, ambiguous or unsupported zone data: $zones",
  ({ zones }) => {
    vi.mocked(find).mockReturnValueOnce(zones);
    expect(() => locationTimeZone({ latitude: 41.9, longitude: 12.5 })).toThrow(
      expect.objectContaining({ status: 503, message: "LOCATION_TIME_ZONE_UNAVAILABLE" }),
    );
  },
);
it("does not hide geography read failures behind a device-zone fallback", () => {
  vi.mocked(find).mockImplementationOnce(() => {
    throw new Error("Geographic data unavailable");
  });
  expect(() => locationTimeZone({ latitude: 41.9, longitude: 12.5 })).toThrow(
    "LOCATION_TIME_ZONE_UNAVAILABLE",
  );
});
