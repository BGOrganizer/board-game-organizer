import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CircleOff } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Keyboard, View } from "react-native";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventGroupSelect({
  groupId,
  group,
  locked,
  busy,
  onChange,
}: {
  groupId: string | null;
  group?: GroupRecordResponse;
  locked: boolean;
  busy: boolean;
  onChange: (id: string | null) => void;
}) {
  const t = useT(),
    options = useCommunityApi(),
    muted = useThemeColor("muted");
  const [open, setOpen] = useState(false);
  const search = useListSearch<never>([]);
  const groups = useGroupRecords(
    { ...options, enabled: options.enabled !== false && !locked },
    "mine",
    search.search,
    ["admin"],
  );
  const loadMore = () => groups.fetchNextPage({ cancelRefetch: false });
  const denied = communityAccessDenied(groups.error);
  const rows = denied ? [] : groups.items.filter((row) => row.canInvite);
  if (group && !denied && !rows.some((row) => row.id === group.id)) rows.unshift(group);
  return (
    <Select
      isDisabled={busy || locked}
      isOpen={open}
      onOpenChange={(value) => {
        if (value) Keyboard.dismiss();
        setOpen(value);
        if (!value) search.setQuery("");
      }}
      value={{
        value: groupId ?? "none",
        label: group && !denied ? group.name : groupId ? t("Group") : t("No group"),
      }}
      onValueChange={(value) => {
        if (!locked && !busy && value) onChange(value.value === "none" ? null : value.value);
      }}
    >
      <Select.Trigger accessibilityLabel={t("Group")}>
        <Select.Value placeholder={t("No group")} />
        <Select.TriggerIndicator />
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="popover" width="trigger" style={{ maxHeight: 320, gap: 8 }}>
          <SearchHelpLabel
            label={t("Search groups")}
            help={t("Type at least 4 characters to search")}
          />
          <SearchInput
            value={search.query}
            onChange={search.setQuery}
            label={t("Search groups")}
            placeholder={t("Search groups")}
          />
          <FlatList
            data={rows}
            keyExtractor={(row) => row.id}
            keyboardShouldPersistTaps="handled"
            style={{ height: Math.min(192, Math.max(144, (rows.length + 1) * 56)), flexShrink: 1 }}
            ListHeaderComponent={
              <Select.Item value="none" label={t("No group")}>
                <CircleOff size={20} color={muted} />
                <Select.ItemLabel />
                <Select.ItemIndicator />
              </Select.Item>
            }
            renderItem={({ item: row }) => (
              <Select.Item value={row.id} label={row.name} disabled={!row.canInvite}>
                <GroupArtwork group={row} size={40} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Typography className="text-foreground" numberOfLines={1}>
                    {row.name}
                  </Typography>
                  <Typography className="text-xs text-muted">
                    {row.type === "PUBLIC" ? t("Public") : t("Private")}
                  </Typography>
                </View>
                <Select.ItemIndicator />
              </Select.Item>
            )}
            onEndReached={() => {
              if (groups.hasNextPage && !groups.isFetchingNextPage && !groups.isFetchNextPageError)
                void loadMore();
            }}
            ListFooterComponent={
              <View style={{ gap: 8 }}>
                {groups.isPending || groups.isFetchingNextPage ? (
                  <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
                ) : null}
                {groups.isError ? (
                  <>
                    <Typography accessibilityRole="alert" className="text-danger">
                      {t("Could not load groups")}
                    </Typography>
                    <Button
                      variant="outline"
                      onPress={() =>
                        void (groups.isFetchNextPageError ? loadMore() : groups.refetch())
                      }
                    >
                      <Button.Label>{t("Try again")}</Button.Label>
                    </Button>
                  </>
                ) : !groups.isPending && !rows.length ? (
                  <Typography className="text-muted">{t("No groups found")}</Typography>
                ) : null}
                {groups.hasNextPage ? (
                  <Button
                    variant="outline"
                    isDisabled={groups.isFetchingNextPage}
                    onPress={() => void loadMore()}
                  >
                    <Button.Label>{t("Load more groups")}</Button.Label>
                  </Button>
                ) : null}
              </View>
            }
          />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
