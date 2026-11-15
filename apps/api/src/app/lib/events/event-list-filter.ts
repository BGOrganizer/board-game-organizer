import { type EventPeriod, eventPeriodsSchema } from "@board-game-organizer/schemas";
import { CommunityError } from "../community.error";

export function eventListPeriods(request: Request) {
  const periods = eventPeriodsSchema.safeParse(
    new URL(request.url).searchParams.get("periods") ?? undefined,
  );
  if (!periods.success) throw new CommunityError(400, "INVALID_PERIODS");
  return periods.data;
}

/** Ongoing events stay in Future; an event becomes Past at its exact end instant. */
export function eventPeriodFilter(periods: readonly EventPeriod[], now = new Date().toISOString()) {
  return periods.length
    ? {
        $or: periods.map((period) => ({
          endsAt: period === "past" ? { $lte: now } : { $gt: now },
        })),
      }
    : { $expr: false };
}
