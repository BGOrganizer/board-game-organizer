import { Typography } from "heroui-native/text";
import { CircleOff, Trophy } from "lucide-react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function EventTableRatingInfo({ enabled }: { enabled: boolean }) {
  const t = useT();
  return (
    <HelpPopover
      size="compact"
      label={enabled ? t("Rating enabled") : t("Rating disabled")}
      title={t("Rating")}
      icon={enabled ? Trophy : CircleOff}
      tone={enabled ? "accent" : "muted"}
      triggerClassName="bg-default"
    >
      <Typography className="text-foreground">
        {enabled
          ? t("This table contributes to player ratings when eligible results are finalized.")
          : t("This table does not update player ratings.")}
      </Typography>
    </HelpPopover>
  );
}
