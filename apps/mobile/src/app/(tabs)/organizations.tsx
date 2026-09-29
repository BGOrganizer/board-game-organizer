import { Typography } from "heroui-native/text";
import { Building2 } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export default function OrganizationsScreen() {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-background" style={{ gap: 12 }}>
      <Building2 size={48} color="#737373" accessibilityLabel={t("Organizations")} />
      <Typography className="text-muted">{t("Coming soon")}</Typography>
    </View>
  );
}
