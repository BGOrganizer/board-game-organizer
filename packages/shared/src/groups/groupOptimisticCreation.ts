import type {
  CreateGroupRecordInput,
  EditGroupRecordInput,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import { type ClientRecord, type CreationIntent, creationState } from "../common/clientMutation";

export type GroupCreationDraft = {
  name?: string;
  logoPreview?: string | null;
  friends?: Array<{ id: string; name: string; email: string | null; avatarUrl: string | null }>;
};
export type CreateGroupVariables = CreateGroupRecordInput & { clientDraft?: GroupCreationDraft };
export type EditGroupVariables = {
  id: string;
  input: EditGroupRecordInput;
  clientDraft?: GroupCreationDraft;
};
export type ClientGroupRecord = ClientRecord<GroupRecordResponse>;
export type GroupCreationIntent = CreationIntent<CreateGroupVariables, GroupRecordResponse>;

export function groupCreationRecord(
  intent: GroupCreationIntent,
  userId: string,
): ClientGroupRecord {
  if (intent.context?.receipt)
    return { ...intent.context.receipt, optimistic: creationState(intent) };
  const input = intent.variables;
  const at = new Date(intent.submittedAt).toISOString();
  const revision = {
    name: input.name,
    ...(input.logoAssetId ? { logoAssetId: input.logoAssetId } : {}),
    ...(input.location ? { location: input.location } : {}),
  };
  return {
    id: `optimistic:${input.clientRequestId ?? intent.draftId}`,
    clientRequestId: input.clientRequestId,
    adminUserId: userId,
    type: input.type,
    ...(input.type === "PRIVATE"
      ? { approved: revision }
      : { proposal: revision, reviewStatus: "PENDING" as const }),
    reservedNames: input.type === "PUBLIC" ? [input.name] : [],
    version: 1,
    createdAt: at,
    updatedAt: at,
    name: input.name,
    logoAssetId: input.logoAssetId,
    location: input.location,
    logo: input.clientDraft?.logoPreview ?? null,
    role: "admin",
    memberCount: 1,
    eventCount: null,
    myMembership: null,
    canEdit: false,
    canInvite: false,
    canViewMembers: false,
    canViewEvents: false,
    canViewRankings: false,
    canSocialInteract: false,
    optimistic: creationState(intent),
  };
}
