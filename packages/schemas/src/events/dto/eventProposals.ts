import { z } from "zod";
import { clientRequestIdSchema } from "../../common/dto/common";
import type { CommunityPageResponse } from "../../community/dto/communityResponses";
import { type EventProposal, eventProposalPayloadSchema } from "../models/eventProposal";
import type { PlannedEventResponse } from "./eventRecords";
export const submitEventProposalSchema = z
  .object({
    eventVersion: z.number().int().positive(),
    clientRequestId: clientRequestIdSchema,
    payload: eventProposalPayloadSchema,
  })
  .strict();
export type SubmitEventProposalInput = z.infer<typeof submitEventProposalSchema>;
export const reviewEventProposalSchema = z
  .object({
    eventVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    action: z.enum(["accept", "reject"]),
    groupRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type ReviewEventProposalInput = z.infer<typeof reviewEventProposalSchema>;
export type EventProposalResponse = Omit<EventProposal, "requestHash" | "payloadKey"> & {
  authorName: string;
  authorUsername?: string | null;
  /** All source-grouped submissions for the same choice; ordinary mine scopes stay private. */
  suggestions?: {
    id: string;
    userId: string;
    authorName: string;
    authorUsername?: string | null;
    version: number;
    status: EventProposal["status"];
  }[];
  game?: { id: number; name: string; imageUrl: string | null };
  gameSuggestions?: {
    id: string;
    userId: string;
    authorName: string;
    authorUsername?: string | null;
    version: number;
    status: EventProposal["status"];
  }[];
  groupRevision?: string;
};
export type EventProposalsResponse = CommunityPageResponse<EventProposalResponse> & {
  eventId: string;
  groupId: string;
  eventVersion: number;
  mode: "mine" | "review";
};
export type ReviewEventProposalResponse = {
  proposal: EventProposalResponse;
  proposals?: EventProposalResponse[];
  event: PlannedEventResponse;
};
