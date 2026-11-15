import { useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native/text";
import { GroupDetail } from "@/components/groups/GroupDetail";
import { useT } from "@/lib/i18n";
export default function GroupBanScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>(),
    t = useT();
  return groupId ? (
    <GroupDetail groupId={groupId} initialTab="members" />
  ) : (
    <Typography accessibilityRole="alert" className="text-danger">
      {t("Group not found")}
    </Typography>
  );
}
