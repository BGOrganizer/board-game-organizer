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
  })
  .strict();
export type ReviewEventProposalInput = z.infer<typeof reviewEventProposalSchema>;
export type EventProposalResponse = Omit<EventProposal, "requestHash" | "payloadKey"> & {
  authorName: string;
};
export type EventProposalsResponse = CommunityPageResponse<EventProposalResponse> & {
  eventId: string;
  groupId: string;
  eventVersion: number;
  mode: "mine" | "review";
};
export type ReviewEventProposalResponse = {
  proposal: EventProposalResponse;
  event: PlannedEventResponse;
};
