import { formatUsername, type useTableSeatOrder } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ArrowDown,
  ArrowUp,
  Check,
  LockKeyhole,
  LockKeyholeOpen,
  RotateCcw,
} from "lucide-react-native";
import { FlatList, View } from "react-native";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
export function EventSeatOrderEditor({ model }: { model: ReturnType<typeof useTableSeatOrder> }) {
  const t = useT();
  const [foreground, successForeground, dangerForeground, defaultForeground] = useThemeColor([
    "foreground",
    "success-foreground",
    "danger-soft-foreground",
    "default-foreground",
  ]);
  return (
    <View style={{ flex: 1, minHeight: 300 }}>
      {model.loading ? <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} /> : null}
      {model.error || model.stale ? (
        <View accessibilityRole="alert">
          <Typography className="text-danger">
            {model.stale
              ? t("The roster changed. Review a fresh snapshot before saving.")
              : t("Could not save seat order")}
          </Typography>
          <Button variant="secondary" onPress={() => void model.start()}>
            <Button.Label>{t("Review latest roster")}</Button.Label>
          </Button>
        </View>
      ) : null}
      <FlatList
        data={model.rows}
        keyExtractor={(row) => row.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={{ gap: 8, paddingBottom: 100 }}
        renderItem={({ item: row, index }) => (
          <View className="bg-surface" style={{ borderRadius: 12 }}>
            <UserListRow
              name={formatUsername(row.username, row.name ?? t("Username unavailable"))}
              avatarUrl={row.avatarUrl}
              secondary={index < model.seatedCount ? t("Seats list") : t("Waiting list")}
              actions={
                row.status === "ACCEPTED" ? (
                  <>
                    {index > 0 ? (
                      <Button
                        isIconOnly
                        variant="ghost"
                        accessibilityLabel={t("Move up")}
                        isDisabled={model.busy || !model.canMove(index, -1)}
                        onPress={() => model.move(index, -1)}
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        <ArrowUp size={18} color={foreground} />
                      </Button>
                    ) : null}
                    {index < model.rows.length - 1 ? (
                      <Button
                        isIconOnly
                        variant="ghost"
                        accessibilityLabel={t("Move down")}
                        isDisabled={model.busy || !model.canMove(index, 1)}
                        onPress={() => model.move(index, 1)}
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        <ArrowDown size={18} color={foreground} />
                      </Button>
                    ) : null}
                    {index < model.seatedCount ? (
                      <Button
                        isIconOnly
                        variant="ghost"
                        accessibilityLabel={row.locked ? t("Unlock player") : t("Lock player")}
                        isDisabled={model.busy}
                        onPress={() => model.lock(index)}
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        <Chip
                          pointerEvents="none"
                          accessible={false}
                          importantForAccessibility="no-hide-descendants"
                          color={row.locked ? "danger" : "default"}
                          variant="soft"
                        >
                          {row.locked ? (
                            <LockKeyhole size={16} color={dangerForeground} />
                          ) : (
                            <LockKeyholeOpen size={16} color={defaultForeground} />
                          )}
                        </Chip>
                      </Button>
                    ) : null}
                  </>
                ) : null
              }
            />
          </View>
        )}
        ListFooterComponent={
          <Typography className="text-sm text-muted">
            {t(
              "Locked players are protected from assistance. Unlock a player before moving them. Pending invitations keep their reserved places.",
            )}
          </Typography>
        }
      />
      <FloatingActions
        left
        label={t("Discard unsaved order")}
        variant="secondary"
        isDisabled={model.busy}
        onPress={model.reset}
      >
        <RotateCcw size={20} color={foreground} />
      </FloatingActions>
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0 }}
      >
        <FloatingActions
          className="bg-success"
          label={t("Save seat order")}
          variant="primary"
          isDisabled={model.loading || model.busy || model.stale || !model.rows.length}
          onPress={() => void model.save()}
        >
          <Check size={20} color={successForeground} />
        </FloatingActions>
      </View>
    </View>
  );
}
