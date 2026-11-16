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
          <Typography className="text-sm text-foreground">
            {t(
              "Accepted players on the waiting list can vote. They may play if an administrator or the app selects them according to the table's rules.",
            )}
          </Typography>
        ) : (
          <>
            <IconLegend
              items={[
                { icon: UserRoundCheck, description: t("Accepted player") },
                { icon: Mail, description: t("Invitation pending") },
              ]}
            />
            <Typography className="text-sm text-foreground">
              {t("Pending invitations do not count toward agreement.")}
            </Typography>
          </>
        )}
      </HelpPopover>
    </View>
  );
}
