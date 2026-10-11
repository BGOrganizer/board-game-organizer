import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Building2, CalendarDays, Crown, MapPin, UsersRound } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { InfoSection } from "@/components/common/ui/InfoSection";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";

import { OrganizationStatusBadge } from "./OrganizationStatusBadge";

export function OrganizationDetailsCard({
  organization,
  children,
}: {
  organization: OrganizationResponse;
  children?: ReactNode;
}) {
  const t = useT();
  const [muted, warning] = useThemeColor(["muted", "warning"]);
  const { i18n } = useLingui();
  const numbers = new Intl.NumberFormat(i18n.locale);
  return (
    <View style={{ gap: 16 }}>
      <InfoSection
        label={t("Name")}
        helpLabel={t("Organization name help")}
        help={t(
          "The organization's name and logo identify it. The badge shows approval or review status. Counts include confirmed members and published events.",
        )}
        icon={Building2}
        headerAccessory={<OrganizationStatusBadge organization={organization} />}
      >
        <GameListRow
          name={organization.name}
          imageUrl={organization.logo}
          actions={
            organization.role === "admin" ? (
              <Crown size={18} color={warning} accessible accessibilityLabel={t("Administrator")} />
            ) : undefined
          }
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
              <UsersRound size={16} color={muted} accessible={false} />
              <Typography
                className="text-sm text-foreground"
                accessibilityLabel={`${t("Confirmed members")}: ${numbers.format(organization.memberCount)}`}
                style={{ flexShrink: 1 }}
              >
                {numbers.format(organization.memberCount)} {t("Confirmed members")}
              </Typography>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
              <CalendarDays size={16} color={muted} accessible={false} />
              <Typography
                className="text-sm text-foreground"
                accessibilityLabel={`${t("Published events")}: ${numbers.format(organization.publishedEventCount)}`}
                style={{ flexShrink: 1 }}
              >
                {numbers.format(organization.publishedEventCount)} {t("Published events")}
              </Typography>
            </View>
          </View>
        </GameListRow>
      </InfoSection>
      <InfoSection
        label={t("Organization venue")}
        helpLabel={t("Organization venue help")}
        help={t("The organization's verified venue and full address.")}
        icon={MapPin}
      >
        <LocationListRow
          name={organization.location.name}
          address={organization.location.address}
        />
      </InfoSection>
      {organization.rejectionReason ? (
        <Typography className="text-danger">{organization.rejectionReason}</Typography>
      ) : null}
      {organization.approved && organization.reviewStatus ? (
        <Typography className="text-muted">
          {t("Approved information remains visible while changes are reviewed.")}
        </Typography>
      ) : null}
      {children ? (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}
