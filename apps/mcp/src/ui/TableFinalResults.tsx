import {
  bggSearchItemSchema,
  matchGameRatingSchema,
  resultsSchema,
  tableRecordSchema,
} from "@board-game-organizer/schemas";
import type { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { EventFinalResults } from "@/components/events/EventFinalResults";
import { McpGameMetadata } from "./McpGameMetadata";

const finalResults = z.object({
  eventStatus: z.literal("TERMINATED"),
  confirmed: tableRecordSchema.shape.confirmed,
  groupId: z.uuid().nullable(),
  sharedResultsOnly: z.boolean().optional(),
  results: resultsSchema.optional(),
  rankingEnabled: z.boolean(),
  resultProfiles: z
    .array(
      z.object({
        userId: z.string(),
        name: z.string(),
        guestName: z.string().optional(),
        username: z.string().nullable().optional(),
        avatarUrl: z.string().nullable(),
        email: z.string().nullable(),
      }),
    )
    .optional(),
  ratingChanges: z.array(matchGameRatingSchema),
  groupRatingChanges: z.array(matchGameRatingSchema).optional(),
  gamesDetail: z.array(bggSearchItemSchema),
});

export function TableFinalResults({ app, data }: { app: App; data: unknown }) {
  const parsed = finalResults.safeParse(data);
  return parsed.success ? (
    <EventFinalResults
      table={parsed.data}
      renderGameMetadata={(game) => <McpGameMetadata app={app} game={game} visible />}
    />
  ) : null;
}
