"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleCheck, CircleX, Clock3 } from "lucide-react";
export function GroupStatusBadge({
  group,
}: {
  group: Pick<GroupRecordResponse, "type" | "reviewStatus" | "approved">;
}) {
  const { t } = useLingui();
  if (group.type === "PRIVATE") return null;
  const rejected = group.reviewStatus === "REJECTED",
    pending = !group.approved || group.reviewStatus === "PENDING";
  const Icon = rejected ? CircleX : pending ? Clock3 : CircleCheck;
  return (
    <Chip size="sm" color={rejected ? "danger" : pending ? "warning" : "success"} variant="soft">
      <Icon className="size-3" aria-hidden />
      {rejected ? t`Changes rejected` : pending ? t`Awaiting review` : t`Approved`}
    </Chip>
  );
}
