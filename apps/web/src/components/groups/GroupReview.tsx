"use client";
import {
  communityAccessDenied,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupDetailsCard } from "./GroupDetailsCard";
export function GroupReview({ groupId }: { groupId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useGroupRecord(o, groupId, true),
    a = useGroupRecordActions(o, groupId),
    [reason, setReason] = useState(""),
    [error, setError] = useState(false),
    group = communityAccessDenied(q.error) ? undefined : q.data;
  const decide = async (decision: "approve" | "reject") => {
    if (!group) return;
    setError(false);
    try {
      await a.review.mutateAsync({
        id: group.id,
        input:
          decision === "approve"
            ? { decision, version: group.version }
            : { decision, version: group.version, reason: reason.trim() },
      });
    } catch {
      setError(true);
    }
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
          <TextField value={reason} onChange={setReason} maxLength={1000} isDisabled={a.busy}>
            <Label>{t`Rejection reason`}</Label>
            <Input />
          </TextField>
          <div className="flex gap-3">
            <Button isDisabled={a.busy} onPress={() => void decide("approve")}>{t`Approve`}</Button>
            <Button
              variant="danger"
              isDisabled={a.busy || !reason.trim()}
              onPress={() => void decide("reject")}
            >{t`Reject`}</Button>
          </div>
        </>
      ) : (
        <p>{t`Review completed`}</p>
      )}
      {error ? (
        <p role="alert" className="text-danger">{t`Could not update group review`}</p>
      ) : null}
    </div>
  );
}
