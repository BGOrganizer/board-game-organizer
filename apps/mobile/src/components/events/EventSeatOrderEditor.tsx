import {
  formatUsername,
  RECORD_USER_ROLES,
  tableUserRoles,
  type useTableSeatOrder,
} from "@board-game-organizer/shared";
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
import type { ReactNode } from "react";
import { SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { useT } from "@/lib/i18n";
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
  const insets = useSafeAreaInsets();
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
      <SectionList
        sections={[
          { key: "seats", data: model.rows.slice(0, model.seatedCount) },
          { key: "waiting", data: model.rows.slice(model.seatedCount) },
        ]}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 8 }}>
            {header}
            <Typography className="text-sm text-muted">
              {t(
                "Locked players are protected from assistance. Unlock a player before moving them. Pending invitations keep their reserved places.",
              )}
            </Typography>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <EventSeatListHeading waiting={section.key === "waiting"} />
        )}
        keyExtractor={(row) => row.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 100 }}
        renderItem={({ item: row, index: sectionIndex, section }) => {
          const index = sectionIndex + (section.key === "waiting" ? model.seatedCount : 0);
          const roles = tableUserRoles({
            ...row,
            demonstrator: row.userId === demonstratorUserId,
            position: index < model.seatedCount ? "SEATED" : "WAITING",
          });
          return (
            <GroupedList>
              <UserListRow
                name={formatUsername(row.username, row.name ?? t("Username unavailable"))}
                avatarUrl={row.avatarUrl}
                badgeContent={<UserRoleBadge roles={roles} />}
                secondary={roles[0] ? t(RECORD_USER_ROLES[roles[0]].message) : undefined}
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
            </GroupedList>
          );
        }}
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
