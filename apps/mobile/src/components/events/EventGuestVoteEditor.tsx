import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useTableGuestVoteForm } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { SectionList, useWindowDimensions, View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventVoteButtons } from "./EventVoteButtons";

export function EventGuestVoteEditor({
  table,
  registrationId,
  name,
  onClose,
}: {
  table: PlannedTableResponse;
  registrationId: string;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const { height } = useWindowDimensions();
  const form = useTableGuestVoteForm(useCommunityApi(), table, registrationId);
  const rows = form.sections.reduce((count, section) => count + section.rows.length, 0);
  return (
    <ConfirmDialog
      title={t("Edit guest votes")}
      description={name}
      busy={form.saving}
      actions={[]}
      onCancel={onClose}
    >
      {form.loading ? <Skeleton style={{ height: 80, width: "100%", borderRadius: 12 }} /> : null}
      {form.error ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load guest votes")}
          </Typography>
          {!form.unavailable ? (
            <Button variant="secondary" onPress={form.refresh}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          ) : null}
        </View>
      ) : null}
      {form.failed && !form.error ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("Could not save guest vote. Try again.")}
        </Typography>
      ) : null}
      {rows ? (
        <SectionList
          style={{ height: Math.min(height * 0.52, rows * 68 + form.sections.length * 32) }}
          sections={form.sections.map(({ kind, rows }) => ({ key: kind, data: rows }))}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Typography
              accessibilityRole="header"
              className="font-semibold text-foreground"
              style={{ paddingVertical: 8 }}
            >
              {section.key === "date"
                ? t("Dates")
                : section.key === "location"
                  ? t("Locations")
                  : t("Games")}
            </Typography>
          )}
          renderItem={({ item }) => {
            const label = item.label || t("Unknown game");
            return (
              <GroupedList>
                <GroupedRow>
                  <Typography className="text-foreground" style={{ flex: 1, minWidth: 0 }}>
                    {label}
                  </Typography>
                  <EventVoteButtons
                    inline
                    label={label}
                    value={item.value}
                    disabledVotes={item.allowNo ? [] : ["NO"]}
                    busy={form.saving}
                    onChange={(vote) => form.save(item, vote)}
                  />
                </GroupedRow>
              </GroupedList>
            );
          }}
        />
      ) : null}
    </ConfirmDialog>
  );
}
