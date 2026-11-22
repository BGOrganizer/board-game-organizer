import { useThemeColor } from "heroui-native/hooks";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";

export function EventSectionCard({
  title,
  label,
  icon: Icon,
  children,
}: {
  title: string;
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const color = useThemeColor("accent-soft-foreground");
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <SectionHeaderCard
      title={title}
      leading={
        <View
          className="bg-accent-soft"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={20} color={color} accessible={false} />
        </View>
      }
      action={
        <HelpPopover
          label={label}
          title={title}
          titleIcon={<Icon size={20} color={color} accessible={false} />}
          width={Math.max(0, Math.min(320, width - insets.left - insets.right - 32))}
        >
          <ScrollView
            style={{
              flexGrow: 0,
              maxHeight: Math.max(0, height - insets.top - insets.bottom - 96),
            }}
            contentContainerStyle={{ gap: 12 }}
          >
            {children}
          </ScrollView>
        </HelpPopover>
      }
    />
  );
}
