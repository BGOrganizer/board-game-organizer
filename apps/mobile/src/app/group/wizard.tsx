import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GroupWizard } from "@/components/GroupWizard";
import { useT } from "@/lib/i18n";

export default function GroupWizardScreen() {
  const t = useT();
  const { groupId: value } = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: groupId ? t("Edit group") : t("New group") }} />
      <GroupWizard groupId={groupId} />
    </SafeAreaView>
  );
}
