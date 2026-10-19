"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, LockKeyhole, LockKeyholeOpen, MapPin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { InfoSection } from "@/components/common/ui/InfoSection";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";
export function GroupDetailsCard({
  group,
  children,
}: {
  group: GroupRecordResponse;
  children?: ReactNode;
}) {
  const { t, i18n } = useLingui();
  const numbers = new Intl.NumberFormat(i18n.locale),
    Visibility = group.type === "PUBLIC" ? LockKeyholeOpen : LockKeyhole;
  return (
    <div className="space-y-4">
      <InfoSection
        label={t`Name`}
        helpLabel={t`Group name help`}
        help={t`Name, logo and group type. Group type cannot be changed.`}
        icon={UsersRound}
        headerAccessory={<GroupStatusBadge group={group} />}
      >
        <div className="flex min-w-0 items-center gap-3">
          <GroupArtwork group={group} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="break-words font-semibold">{group.name}</p>
            <p className="flex items-center gap-1 text-sm text-default-500">
              <Visibility className="size-4" aria-hidden />
              {group.type === "PUBLIC" ? t`Public` : t`Private`}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1">
                <UsersRound className="size-4 text-default-500" aria-hidden />
                {numbers.format(group.memberCount)} {t`Confirmed members`}
              </span>
              {group.canViewEvents && group.eventCount !== null ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-4 text-default-500" aria-hidden />
                  {numbers.format(group.eventCount)} {t`Events`}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </InfoSection>
      {group.location ? (
        <InfoSection
          label={t`Group venue`}
          helpLabel={t`Group venue help`}
          help={t`The group's verified venue and full address.`}
          icon={MapPin}
        >
          <LocationListRow name={group.location.name} address={group.location.address} />
        </InfoSection>
      ) : null}
      {group.rejectionReason ? (
        <p role="alert" className="text-sm text-danger">
          {group.rejectionReason}
        </p>
      ) : null}
      {group.approved && group.reviewStatus ? (
        <p className="text-sm text-default-500">{t`Approved information remains visible while changes are reviewed.`}</p>
      ) : null}
      {children ? <div className="flex flex-wrap justify-end gap-2">{children}</div> : null}
    </div>
  );
}
