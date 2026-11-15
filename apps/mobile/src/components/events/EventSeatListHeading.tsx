import { Typography } from "heroui-native/text";
import { Mail, UserRoundCheck } from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { useT } from "@/lib/i18n";
export function EventSeatListHeading({ waiting }: { waiting: boolean }) {
  const t = useT();
  const title = waiting ? t("Waiting list") : t("Seats list");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingTop: waiting ? 12 : 0,
      }}
    >
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {title}
      </Typography>
      <HelpPopover label={`${title}: ${t("Field help")}`} title={title} width={300}>
        {waiting ? (
          <>
            <Typography className="text-sm text-foreground">
              {t(
                "When all places are reserved, new players join the waiting list. Priority is preserved, and a place may become available when another player leaves.",
              )}
            </Typography>
            <Typography className="text-sm text-foreground">
              {t(
                "Accepted waiting players may vote. Pending invitations do not vote or count toward agreement.",
              )}
            </Typography>
            <Typography className="text-sm text-foreground">
              {t("Only the organizer and recipient can see pending invitation identities.")}
            </Typography>
          </>
        ) : (
          <>
            <IconLegend
              items={[
                { icon: UserRoundCheck, description: t("Accepted player") },
                { icon: Mail, description: t("Invitation pending") },
              ]}
            />
            <Typography className="text-sm text-foreground">
              {t("Pending invitations reserve a place but do not vote or count toward agreement.")}
            </Typography>
            <Typography className="text-sm text-foreground">
              {t(
                "Free places allow joining or invitations. Places are not assigned physical seats.",
              )}
            </Typography>
            <Typography className="text-sm text-foreground">
              {t("Only the organizer and recipient can see pending invitation identities.")}
            </Typography>
          </>
        )}
      </HelpPopover>
    </View>
  );
}
