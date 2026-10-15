import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { HelpPopover } from "./HelpPopover";

export function SearchHelpLabel({
  label,
  help,
  helpTitle,
}: {
  label: string;
  help: string;
  helpTitle?: string;
}) {
  const t = useT();
  const title = helpTitle ?? t("Search help");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Typography className="font-medium text-foreground" style={{ flexShrink: 1 }}>
        {label}
      </Typography>
      <HelpPopover label={`${label}: ${title}`} title={title}>
        <Typography className="text-foreground" style={{ flexShrink: 1 }}>
          {help}
        </Typography>
      </HelpPopover>
    </View>
  );
}
