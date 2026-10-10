"use client";
import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, CircleCheck, CircleX, Clock3, MapPin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { ListCard } from "@/components/common/ui/ListCard";
import { OrganizationArtwork } from "./OrganizationArtwork";

function StatusBadge({ organization }: { organization: OrganizationResponse }) {
  const { t } = useLingui();
  const rejected = organization.reviewStatus === "REJECTED",
    pending = organization.reviewStatus === "PENDING";
  const Icon = rejected ? CircleX : pending ? Clock3 : CircleCheck;
  return (
    <Chip size="sm" color={rejected ? "danger" : pending ? "warning" : "success"} variant="soft">
      <Icon className="size-3" aria-hidden />
      {rejected ? t`Changes rejected` : pending ? t`Awaiting review` : t`Approved`}
    </Chip>
  );
}
export function OrganizationDetailsCard({
  organization,
  children,
}: {
  organization: OrganizationResponse;
  children?: ReactNode;
}) {
  const { t, i18n } = useLingui();
  const numbers = new Intl.NumberFormat(i18n.locale);
  return (
    <ListCard>
      <div className="flex items-start gap-3 p-3">
        <OrganizationArtwork organization={organization} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 break-words text-xl font-semibold">{organization.name}</h2>
            <StatusBadge organization={organization} />
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="size-4 shrink-0 text-default-500" aria-hidden />
            <div className="min-w-0">
              <p className="break-words font-medium">{organization.location.name}</p>
              <p className="break-words text-sm text-default-500">
                {formatLocationAddress(organization.location.address)}
              </p>
            </div>
          </div>
          <p className="flex items-start gap-2 text-sm">
            <UsersRound className="size-4 shrink-0 text-default-500" aria-hidden />
            <span>
              {t`Approved members`}: {numbers.format(organization.memberCount)}
            </span>
          </p>
          <p className="flex items-start gap-2 text-sm">
            <CalendarDays className="size-4 shrink-0 text-default-500" aria-hidden />
            <span>
              {t`Published events`}: {numbers.format(organization.publishedEventCount)}
            </span>
          </p>
          {organization.rejectionReason ? (
            <p className="text-sm text-danger">{organization.rejectionReason}</p>
          ) : null}
          {organization.approved && organization.reviewStatus ? (
            <p className="text-sm text-default-500">{t`Approved information remains visible while changes are reviewed.`}</p>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className="flex flex-wrap justify-end gap-2 p-3 pt-0">{children}</div>
      ) : null}
    </ListCard>
  );
}
