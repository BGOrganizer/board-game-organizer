"use client";

import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleCheck, CircleX, Clock3 } from "lucide-react";

export function OrganizationStatusBadge({ organization }: { organization: OrganizationResponse }) {
  const { t } = useLingui();
  const rejected = organization.reviewStatus === "REJECTED",
    pending = organization.status !== "CREATED" || organization.reviewStatus === "PENDING";
  const Icon = rejected ? CircleX : pending ? Clock3 : CircleCheck;
  return (
    <Chip size="sm" color={rejected ? "danger" : pending ? "warning" : "success"} variant="soft">
      <Icon className="size-3" aria-hidden />
      {rejected ? t`Changes rejected` : pending ? t`Awaiting review` : t`Approved`}
    </Chip>
  );
}
