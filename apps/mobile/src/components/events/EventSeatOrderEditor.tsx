import {
  formatUsername,
  RECORD_USER_ROLES,
  tableUserRoles,
  type useTableSeatOrder,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ListEnd,
  LockKeyhole,
  LockKeyholeOpen,
  RotateCcw,
  UserRoundPlus,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { SectionList, View } from "react-native";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { useT } from "@/lib/i18n";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventSeatListHeading } from "./EventSeatListHeading";
export function EventSeatOrderEditor({
  model,
  header,
  demonstratorUserId,
}: {
  model: ReturnType<typeof useTableSeatOrder>;
  header?: ReactNode;
  demonstratorUserId?: string | null;
}) {
  const t = useT();
  const layout = useFloatingActionLayout();
  const [foreground, successForeground, muted] = useThemeColor([
    "foreground",
    "success-foreground",
    "muted",
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
      <SectionList
        testID="seat-order-list"
        sections={[
          { key: "seats", data: model.places.seated },
          { key: "waiting", data: model.places.waiting },
        ]}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 8 }}>
            {header}
            <Typography className="text-sm text-muted">
              {t(
                "Locked places stay fixed. Move unlocked players or pending invitations between seats and the waiting list. Manual mode preserves empty places; Assisted may rearrange unlocked players.",
              )}
            </Typography>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <EventSeatListHeading waiting={section.key === "waiting"} />
        )}
        keyExtractor={(place) => place.key}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: layout.paddingBottom }}
        renderItem={({ item }) => {
          if (item.kind === "empty")
            return (
              <GroupedList>
                <View
                  style={{
                    minHeight: 64,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 16,
                  }}
                >
                  <UserRoundPlus size={20} color={muted} accessible={false} />
                  <Typography className="text-muted">
                    {t("Free place")}: {item.first + 1}
                    {item.last > item.first ? `–${item.last + 1}` : ""}
                  </Typography>
                </View>
              </GroupedList>
            );
          const { row, index } = item;
          const roles = tableUserRoles({
            ...row,
            demonstrator: row.userId === demonstratorUserId,
            position: row.seatIndex !== null ? "SEATED" : "WAITING",
          });
          return (
            <GroupedList>
              <UserListRow
                testID={`seat-order-row-${row.id}`}
                name={formatUsername(row.username, row.name ?? t("Username unavailable"))}
                avatarUrl={row.avatarUrl}
                badgeContent={<UserRoleBadge roles={roles} />}
                topBadgeContent={
                  row.seatIndex !== null ? (
                    <IconBadge
                      testID={`seat-order-lock-${row.id}`}
                      icon={row.locked ? LockKeyhole : LockKeyholeOpen}
                      label={row.locked ? t("Unlock player") : t("Lock player")}
                      color={row.locked ? "danger" : "default"}
                      onPress={() => model.lock(index)}
                      isDisabled={model.busy}
                    />
                  ) : undefined
                }
                secondary={[
                  row.seatIndex !== null ? `${t("Position")}: ${row.seatIndex + 1}` : null,
                  roles[0] ? t(RECORD_USER_ROLES[roles[0]].message) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                actions={
                  <>
                    <Button
                      isIconOnly
                      variant="ghost"
                      accessibilityLabel={t("Move up")}
                      testID={`seat-order-up-${row.id}`}
                      isDisabled={model.busy || !model.canMove(index, -1)}
                      onPress={() => model.move(index, -1)}
                      style={{ minWidth: 44, minHeight: 44 }}
                    >
                      <ArrowUp size={18} color={foreground} />
                    </Button>

                    <Button
                      isIconOnly
                      variant="ghost"
                      accessibilityLabel={t("Move down")}
                      testID={`seat-order-down-${row.id}`}
                      isDisabled={model.busy || !model.canMove(index, 1)}
                      onPress={() => model.move(index, 1)}
                      style={{ minWidth: 44, minHeight: 44 }}
                    >
                      <ArrowDown size={18} color={foreground} />
                    </Button>
                    {row.seatIndex !== null ? (
                      <Button
                        isIconOnly
                        variant="ghost"
                        accessibilityLabel={t("Move to waiting list")}
                        testID={`seat-order-waiting-${row.id}`}
                        isDisabled={model.busy || row.locked}
                        onPress={() => model.sendToWaiting(index)}
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        <ListEnd size={18} color={foreground} />
                      </Button>
                    ) : null}
                  </>
                }
              />
            </GroupedList>
          );
        }}
      />
      <FloatingActions
        testID="seat-order-discard"
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
          testID="seat-order-save"
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
