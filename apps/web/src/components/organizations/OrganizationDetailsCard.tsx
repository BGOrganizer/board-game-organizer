"use client";
import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Building2, CalendarDays, Crown, MapPin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { InfoSection } from "@/components/common/ui/InfoSection";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";

import { OrganizationStatusBadge } from "./OrganizationStatusBadge";

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
    <div className="space-y-4">
      <InfoSection
        label={t`Name`}
        helpLabel={t`Organization name help`}
        help={t`The organization's name and logo identify it. The badge shows approval or review status. Counts include confirmed members and published events.`}
        icon={Building2}
        headerAccessory={<OrganizationStatusBadge organization={organization} />}
      >
        <GameListRow
          name={organization.name}
          imageUrl={organization.logo}
          actions={
            organization.role === "admin" ? (
              <span role="img" aria-label={t`Administrator`}>
                <Crown className="size-4 text-warning" aria-hidden />
              </span>
            ) : undefined
          }
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <UsersRound className="size-4 text-default-500" aria-hidden />
              {numbers.format(organization.memberCount)} {t`Confirmed members`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 text-default-500" aria-hidden />
              {numbers.format(organization.publishedEventCount)} {t`Published events`}
            </span>
          </div>
        </GameListRow>
      </InfoSection>
      <InfoSection
        label={t`Organization venue`}
        helpLabel={t`Organization venue help`}
        help={t`The organization's verified venue and full address.`}
        icon={MapPin}
      >
        <LocationListRow
          name={organization.location.name}
          address={organization.location.address}
        />
      </InfoSection>
      {organization.rejectionReason ? (
        <p className="text-sm text-danger">{organization.rejectionReason}</p>
      ) : null}
      {organization.approved && organization.reviewStatus ? (
        <p className="text-sm text-default-500">{t`Approved information remains visible while changes are reviewed.`}</p>
      ) : null}
      {children ? <div className="flex flex-wrap justify-end gap-2">{children}</div> : null}
    </div>
  );
}
