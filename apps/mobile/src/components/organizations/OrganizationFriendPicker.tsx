import {
  useOrganization,
  useOrganizationActions,
  useRelationshipList,
} from "@board-game-organizer/shared";

import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";

import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";

import { FlatList, View } from "react-native";

import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationFriendPicker({ organizationId }: { organizationId: string }) {
  const t = useT();
  const o = useCommunityApi();
  const detail = useOrganization(o, organizationId);
  const actions = useOrganizationActions(o);
  const router = useRouter();
  const friends = useRelationshipList(
    o.apiUrl,
    null,
    o.getToken,
    undefined,
    o.userId,
    "friends",
    detail.data?.role === "admin",
  );
  if (detail.isError || detail.data?.role !== "admin")
    return (
      <View style={{ padding: 20 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <Typography className="text-danger">{t("Organization admin required")}</Typography>
        )}
      </View>
    );
  return (
    <FlatList
      style={{ flex: 1 }}
      data={friends.data ?? []}
      keyExtractor={(row, index) => row.profile?.id ?? String(index)}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
      onEndReached={() => {
        if (friends.hasNextPage && !friends.isFetchingNextPage && !friends.isFetchNextPageError)
          void friends.fetchNextPage();
      }}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: t("Invite friends") }} />
          {friends.isPending ? (
            <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
          ) : null}
        </>
      }
      ListEmptyComponent={
        !friends.isPending && !friends.isError ? (
          <Typography>{t("No friends found")}</Typography>
        ) : null
      }
      ListFooterComponent={
        <View>
          {friends.isError ? (
            <Button onPress={() => void friends.refetch()}>
              {t("Could not load friends. Retry")}
            </Button>
          ) : null}
          {friends.isFetchingNextPage ? (
            <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
          ) : null}
        </View>
      }
      renderItem={({ item: row }) =>
        row.profile ? (
          <Button
            isDisabled={actions.busy}
            onPress={() =>
              void actions.invite
                .mutateAsync({ id: organizationId, userId: row.profile!.id })
                .then(() => router.back())
                .catch(() => {})
            }
          >
            {row.profile.username ?? t("Username unavailable")}
          </Button>
        ) : null
      }
    />
  );
}
