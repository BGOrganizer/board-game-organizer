import { z } from "zod";
import { clientRequestIdSchema, targetUserIdSchema } from "../../common/dto/common";
import { verifiedLocationSchema } from "../../locations/models/locations";
import { eventTimeSchema } from "./eventRecord";

export const eventProposalPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), day: z.iso.date(), startTime: eventTimeSchema }).strict(),
  z.object({ kind: z.literal("location"), location: verifiedLocationSchema }).strict(),
  z
    .object({ kind: z.literal("game"), tableId: z.uuid(), gameId: z.number().int().positive() })
    .strict(),
]);
export type EventProposalPayload = z.infer<typeof eventProposalPayloadSchema>;
export const eventProposalSchema = z
  .object({
    id: z.uuid(),
    eventId: z.uuid(),
    groupId: z.uuid(),
    userId: targetUserIdSchema,
    clientRequestId: clientRequestIdSchema,
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    payloadKey: z.string().regex(/^[a-f0-9]{64}$/),
    payload: eventProposalPayloadSchema,
    label: z.string().min(1).max(1000),
    status: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
    version: z.number().int().positive(),
    submittedEventVersion: z.number().int().positive(),
    canonicalOptionId: z.string().optional(),
    reviewedBy: targetUserIdSchema.optional(),
    reviewBatchId: z.uuid().optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type EventProposal = z.infer<typeof eventProposalSchema>;
export const EVENT_PROPOSAL_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { eventId: 1, userId: 1, clientRequestId: 1 }, unique: true },
  { key: { eventId: 1, "payload.kind": 1, createdAt: -1, id: -1 } },
  { key: { eventId: 1, userId: 1, status: 1, payloadKey: 1 } },
] as const;
