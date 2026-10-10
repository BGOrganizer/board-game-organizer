import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock3,
  MapPin,
  UsersRound,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";
import { useT } from "@/lib/i18n";
import { OrganizationArtwork } from "./OrganizationArtwork";

function StatusBadge({ organization }: { organization: OrganizationResponse }) {
  const t = useT();
  const rejected = organization.reviewStatus === "REJECTED",
    pending = organization.reviewStatus === "PENDING";
  const color = useThemeColor(rejected ? "danger" : pending ? "warning" : "success");
  const Icon = rejected ? CircleX : pending ? Clock3 : CircleCheck;
  return (
    <Chip size="sm" color={rejected ? "danger" : pending ? "warning" : "success"} variant="soft">
      <Icon size={14} color={color} />
      <Chip.Label>
        {rejected ? t("Changes rejected") : pending ? t("Awaiting review") : t("Approved")}
      </Chip.Label>
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
  const t = useT();
  const muted = useThemeColor("muted");
  const { i18n } = useLingui();
  const numbers = new Intl.NumberFormat(i18n.locale);
  return (
    <ListCard>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}>
        <OrganizationArtwork organization={organization} />
        <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Typography className="font-semibold text-foreground" style={{ flex: 1, fontSize: 20 }}>
              {organization.name}
            </Typography>
            <StatusBadge organization={organization} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <MapPin size={16} color={muted} />
            <View style={{ flex: 1 }}>
              <Typography className="font-semibold text-foreground">
                {organization.location.name}
              </Typography>
              <Typography className="text-muted">
                {formatLocationAddress(organization.location.address)}
              </Typography>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <UsersRound size={16} color={muted} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {t("Approved members")}: {numbers.format(organization.memberCount)}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <CalendarDays size={16} color={muted} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {t("Published events")}: {numbers.format(organization.publishedEventCount)}
            </Typography>
          </View>
          {organization.rejectionReason ? (
            <Typography className="text-danger">{organization.rejectionReason}</Typography>
          ) : null}
          {organization.approved && organization.reviewStatus ? (
            <Typography className="text-muted">
              {t("Approved information remains visible while changes are reviewed.")}
            </Typography>
          ) : null}
        </View>
      </View>
      {children ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 8,
            paddingHorizontal: 12,
            paddingBottom: 12,
          }}
        >
          {children}
        </View>
      ) : null}
    </ListCard>
  );
}
