import { Typography } from "heroui-native/text";
import { useT } from "@/lib/i18n";

export function EventSeatListHeading({ waiting }: { waiting: boolean }) {
  const t = useT();
  return (
    <Typography
      accessibilityRole="header"
      className="font-semibold text-foreground"
      style={{ paddingTop: waiting ? 12 : 0 }}
    >
      {waiting ? t("Waiting list") : t("Seats list")}
    </Typography>
  );
}
