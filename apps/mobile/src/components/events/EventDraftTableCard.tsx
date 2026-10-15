import type { EventDraftTable } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Pencil, Trash2 } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { EventTableCardBody } from "./EventTableCardBody";

export function EventDraftTableCard({
  table,
  timeZone,
  busy,
  onEdit,
  onRemove,
}: {
  table: EventDraftTable;
  timeZone: string;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [foreground, danger] = useThemeColor(["foreground", "danger"]);
  return (
    <Card style={{ padding: 12, gap: 12 }}>
      <EventTableCardBody
        table={table.input}
        timeZone={timeZone}
        gameName={table.gameName}
        imageUrl={table.imageUrl}
        demonstrator={table.demonstrator}
      />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          isDisabled={busy}
          accessibilityLabel={`${t("Edit table")}: ${table.input.name}`}
          onPress={onEdit}
        >
          <Pencil size={18} color={foreground} />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="danger-soft"
          isDisabled={busy}
          accessibilityLabel={`${t("Remove table")}: ${table.input.name}`}
          onPress={onRemove}
        >
          <Trash2 size={18} color={danger} />
        </Button>
      </View>
    </Card>
  );
}
