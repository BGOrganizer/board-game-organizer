/** Local wall-clock bounds, not instants or a replacement for venue-zone validation. */
export function publicEventBounds(start: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || !Number.isFinite(Date.parse(`${start}Z`)))
    return {};
  const minute = (delta: number) =>
    new Date(Date.parse(`${start}Z`) + delta * 60_000).toISOString().slice(0, 16);
  const previousDay = new Date(Date.parse(`${start.slice(0, 10)}T00:00Z`) - 60_000);
  return {
    endMin: minute(1),
    endMax: `${start.slice(0, 10)}T23:59`,
    cutoffMax: previousDay.toISOString().slice(0, 16),
  };
}
export function publicTableTimeBounds(start: string, end: string, duration = 1) {
  const min = publicEventBounds(start).endMin ? start : undefined;
  const endAt = Date.parse(`${end}Z`);
  if (!min || !Number.isFinite(endAt) || !Number.isFinite(duration)) return {};
  return { min, max: new Date(endAt - Math.max(1, duration) * 60_000).toISOString().slice(0, 16) };
}
export function publicEventEndIsValid(start: string, end: string) {
  return start.slice(0, 10) === end.slice(0, 10) && Date.parse(`${end}Z`) > Date.parse(`${start}Z`);
}
export function nextEventDay(now: Date) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}
