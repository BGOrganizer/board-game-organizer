import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { GroupWizard } from "@/components/groups/GroupWizard";
import { useT } from "@/lib/i18n";

export default function GroupWizardScreen() {
  const t = useT();
  const { groupId: value, draftId: draft } = useLocalSearchParams<{
    groupId?: string | string[];
    draftId?: string | string[];
  }>();
  const groupId = Array.isArray(value) ? value[0] : value;
  const draftId = Array.isArray(draft) ? draft[0] : draft;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: groupId ? t("Edit group") : t("New group") }} />
      <GroupWizard groupId={groupId} draftId={draftId} />
    </View>
  );
}
