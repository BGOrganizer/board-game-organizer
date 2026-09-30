import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Typography } from "heroui-native/text";
import { CircleHelp } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function SearchHelpLabel({ label, help }: { label: string; help: string }) {
  const t = useT();
  const muted = useThemeColor("muted");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Typography className="font-medium text-foreground" style={{ flexShrink: 1 }}>
        {label}
      </Typography>
      <Popover>
        <Popover.Trigger asChild>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            accessibilityLabel={`${label}: ${t("Search help")}`}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <CircleHelp size={18} color={muted} />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Overlay />
          <Popover.Content presentation="popover" placement="bottom" width={260}>
            <Popover.Title>{t("Search help")}</Popover.Title>
            <Typography className="text-foreground" style={{ flexShrink: 1 }}>
              {help}
            </Typography>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </View>
  );
}
