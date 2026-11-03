/** Use existing Lingui plurals: Hermes does not guarantee Intl.RelativeTimeFormat. */
export function profileActivityRelativeTime(
  occurredAt: string,
  format: (id: string, values: Record<string, string | number>) => string,
  now = Date.now(),
) {
  const seconds = (Date.parse(occurredAt) - now) / 1000;
  const units = [
    [31_536_000, "year"],
    [2_592_000, "month"],
    [86_400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ] as const;
  const [size, unit] =
    units.find(([value]) => Math.abs(seconds) >= value) ?? units[units.length - 1];
  const count = Math.trunc(Math.abs(seconds) / size);
  const duration = format("profile.activity.duration", { count, unit });
  return format("profile.activity.relative", {
    duration,
    direction: count === 0 ? "now" : seconds < 0 ? "past" : "future",
  });
}

export function profileWinMilestones(previous: number, current: number) {
  const values = [5, 10, 25, 50];
  for (
    let value = Math.max(100, (Math.floor(previous / 100) + 1) * 100);
    value <= current;
    value += 100
  )
    values.push(value);
  return values.filter((value) => value > previous && value <= current);
}

/** No resource identifiers, timestamps or hidden context belong in chart geometry. */
export function profileRatingPath(
  points: readonly { ordinal: number; rating: number }[],
  width = 300,
  height = 140,
) {
  if (!points.length) return "";
  const minX = points[0].ordinal,
    maxX = points[points.length - 1].ordinal;
  const low = Math.min(...points.map((p) => p.rating)),
    high = Math.max(...points.map((p) => p.rating));
  return points
    .map(
      (p) =>
        `${8 + ((p.ordinal - minX) / Math.max(1, maxX - minX)) * (width - 16)},${height - 8 - ((p.rating - low) / Math.max(1, high - low)) * (height - 16)}`,
    )
    .join(" ");
}
