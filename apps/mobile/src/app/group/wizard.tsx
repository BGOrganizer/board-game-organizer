import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Typography } from "heroui-native/text";
import { ArrowLeft } from "lucide-react-native";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GroupWizard } from "@/components/GroupWizard";
import { useT } from "@/lib/i18n";

export default function GroupWizardScreen() {
  const t = useT();
  const router = useRouter();
  const { groupId: value } = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel={t("Back")}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#737373" />
        </Button>
        <Typography className="flex-1 font-semibold text-foreground" numberOfLines={1}>
          {groupId ? t("Edit group") : t("New group")}
        </Typography>
      </View>
      <GroupWizard groupId={groupId} />
    </SafeAreaView>
  );
}
