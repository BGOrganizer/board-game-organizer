"use client";
import {
  communityAccessDenied,
  groupRecordKeys,
  useClientMutationDraft,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupDetailsCard } from "./GroupDetailsCard";
export function GroupReview({ groupId }: { groupId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useGroupRecord(o, groupId, true),
    a = useGroupRecordActions(o, groupId),
    router = useRouter(),
    draft = useClientMutationDraft<Parameters<typeof a.review.mutate>[0]>(
      groupRecordKeys.mutation(o, groupId, "review"),
      communityAccessDenied(q.error) ? undefined : q.data?.version,
    ),
    [reason, setReason] = useState(
      draft?.variables?.input.decision === "reject" ? draft.variables.input.reason : "",
    ),
    group = communityAccessDenied(q.error) ? undefined : q.data;
  const busy = a.busy || draft?.phase === "saving" || draft?.phase === "verifying";
  const decide = (decision: "approve" | "reject") => {
    if (
      !group ||
      busy ||
      group.reviewStatus !== "PENDING" ||
      (decision === "reject" && !reason.trim())
    )
      return;
    a.review.mutate({
      id: group.id,
      input:
        decision === "approve"
          ? { decision, version: group.version }
          : { decision, version: group.version, reason: reason.trim() },
    });
    router.push("/moderation");
  };
  if (!group)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load group review`}</p>
        <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
    );
  return (
    <div className="space-y-4">
      <GroupDetailsCard group={group} />
      {group.reviewStatus === "PENDING" ? (
        <>
          <TextField value={reason} onChange={setReason} maxLength={1000}>
            <Label>{t`Rejection reason`}</Label>
            <Input />
          </TextField>
          <div className="flex gap-3">
            <Button isDisabled={busy} onPress={() => void decide("approve")}>
              {" "}
              {t`Approve`}
            </Button>
            <Button
              variant="danger"
              isDisabled={busy || !reason.trim()}
              onPress={() => void decide("reject")}
            >{t`Reject`}</Button>
          </div>
        </>
      ) : (
        <p>{t`Review completed`}</p>
      )}
      {draft?.phase === "verifying" ? <p role="status">{t`Checking saved changes`}</p> : null}
    </div>
  );
}
