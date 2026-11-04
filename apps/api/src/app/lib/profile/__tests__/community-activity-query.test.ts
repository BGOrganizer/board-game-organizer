import { expect, it } from "vitest";
import { communityActivityStages, joinedEventSuppression } from "../community-activity-query";

it.each(["all", "friends", "following"] as const)(
  "source-filters %s using directed live edges, reciprocal accepted dates, stable deduplication and a bounded response",
  (network) => {
    for (const cursor of [undefined, "2030-01-01T00:00:00.000Z|id", ""]) {
      const pipeline = communityActivityStages("viewer", network, ["blocked"], cursor),
        text = JSON.stringify(pipeline);
      expect(text).toContain('"$fromUserId","viewer"');
      expect(text).toContain('"status":"accepted"');
      expect(text).toContain('"$size":"$directions"');
      expect(text).toContain('"$respondedAt"');
      expect(text).toContain('"$createdAt"');
      expect(text).toContain('"$gte"');
      expect(text).toContain('"_duplicate.0"');
      expect(pipeline).toContainEqual({ $limit: 50 });
      expect(pipeline[0].$match.userId.$nin).toEqual(["viewer", "blocked"]);
      expect(pipeline[0].$match.$or).toEqual(
        cursor
          ? [
              { occurredAt: { $lt: cursor.split("|")[0] } },
              { occurredAt: cursor.split("|")[0], id: { $lt: "id" } },
            ]
          : undefined,
      );
    }
    expect(joinedEventSuppression()[0].$lookup.pipeline[0].$match.kind).toBe("table_join");
  },
);
