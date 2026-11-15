import { setupI18n } from "@lingui/core";
import { expect, it, vi } from "vitest";
import { messages as en } from "../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../messages/it.js";
import {
  profileActivityRelativeTime,
  profileRatingPath,
  profileWinMilestones,
} from "../profileMetrics";

it("awards only crossed milestones, including simultaneous wins and no historical catch-up", () => {
  expect(profileWinMilestones(0, 1)).toEqual([]);
  expect(profileWinMilestones(4, 5)).toEqual([5]);
  expect(profileWinMilestones(9, 51)).toEqual([10, 25, 50]);
  expect(profileWinMilestones(99, 301)).toEqual([100, 200, 300]);
  expect(profileWinMilestones(150, 151)).toEqual([]);
  expect(profileWinMilestones(300, 300)).toEqual([]);
});
it("uses stable progressive coordinates, including empty, flat and single-point histories", () => {
  expect(profileRatingPath([])).toBe("");
  expect(profileRatingPath([{ ordinal: 1, rating: 500 }])).toBe("8,132");
  expect(
    profileRatingPath([
      { ordinal: 5, rating: 500 },
      { ordinal: 6, rating: 510 },
    ]),
  ).toBe("8,132 292,8");
  expect(
    profileRatingPath(
      [
        { ordinal: 1, rating: 500 },
        { ordinal: 2, rating: 500 },
      ],
      100,
      100,
    ),
  ).toBe("8,92 92,92");
});
it("uses existing EN/IT Lingui plurals even when Hermes lacks RelativeTimeFormat", () => {
  const now = Date.parse("2030-06-03T12:00:00Z"),
    i18n = setupI18n({ locale: "en", messages: { en, it: itMessages } }),
    format = (id: string, values: Record<string, string | number>) => i18n._({ id, values });
  const unsupported = vi.spyOn(Intl, "RelativeTimeFormat").mockImplementation(() => {
    throw new Error("unsupported Hermes API");
  });
  for (const [seconds, unit] of [
    [1, "second"],
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ] as const) {
    expect(
      profileActivityRelativeTime(new Date(now - seconds * 1000).toISOString(), format, now),
    ).toBe(`1 ${unit} ago`);
    expect(
      profileActivityRelativeTime(new Date(now - seconds * 2000).toISOString(), format, now),
    ).toBe(`2 ${unit}s ago`);
  }
  expect(profileActivityRelativeTime(new Date(now + 60_000).toISOString(), format, now)).toBe(
    "in 1 minute",
  );
  i18n.activate("it");
  expect(profileActivityRelativeTime(new Date(now - 120_000).toISOString(), format, now)).toBe(
    "2 minuti fa",
  );
  expect(profileActivityRelativeTime(new Date(now + 60_000).toISOString(), format, now)).toBe(
    "tra 1 minuto",
  );
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  expect(profileActivityRelativeTime(new Date(now).toISOString(), format)).toBe("ora");
  clock.mockRestore();
  expect(unsupported).not.toHaveBeenCalled();
  unsupported.mockRestore();
});
