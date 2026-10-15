import { useEventTableContext } from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Pencil } from "lucide-react-native";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventTableEditAction({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT();
  const router = useRouter();
  const accent = useThemeColor("accent-foreground");
  const { event, table, open } = useEventTableContext(useCommunityApi(), eventId, tableId);
  if (event?.role !== "admin" || !table) return null;
  return (
    <FloatingActions
      label={t("Edit table")}
      testID="edit-event-table-fab"
      isDisabled={!event.canModify || !open || table.status !== "PLANNING"}
      variant="primary"
      onPress={() => router.push({ pathname: "/event/table-edit", params: { eventId, tableId } })}
    >
      <Pencil size={26} color={accent} />
    </FloatingActions>
  );
}
