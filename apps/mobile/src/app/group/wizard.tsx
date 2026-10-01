import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { GroupWizard } from "@/components/GroupWizard";
import { useT } from "@/lib/i18n";

export default function GroupWizardScreen() {
  const t = useT();
  const { groupId: value } = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: groupId ? t("Edit group") : t("New group") }} />
      <GroupWizard groupId={groupId} />
    </View>
  );
}
