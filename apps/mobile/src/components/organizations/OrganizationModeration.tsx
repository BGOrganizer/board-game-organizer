import {
  CommunityApiError,
  communityAccessDenied,
  formatLocationAddress,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";

import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ShieldCheck } from "lucide-react-native";

import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { OrganizationArtwork } from "@/components/organizations/OrganizationArtwork";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationModeration() {
  const t = useT();
  const options = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const list = useOrganizationList(options, "moderation");
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t("Organization moderation") }} />
      <FlatList
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: floatingActionLayout(insets.bottom, 100).paddingBottom,
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        renderItem={({ item: organization }) => (
          <LinkedListCard
            label={`${t("Review organization")}: ${organization.name}`}
            onPress={() =>
              router.push({
                pathname: "/moderation/[organizationId]",
                params: { organizationId: organization.id },
              })
            }
          >
            <OrganizationArtwork organization={organization} />
            <View style={{ flex: 1, gap: 4 }}>
              <Typography numberOfLines={1} className="font-semibold">
                {organization.name}
              </Typography>
              <Typography className="text-muted" style={{ fontSize: 13 }}>
                {formatLocationAddress(organization.location.address)}
              </Typography>
              <Typography className="text-warning" style={{ fontSize: 12 }}>
                {organization.status === "MODIFIED" ? t("Proposed changes") : t("New organization")}
              </Typography>
            </View>
          </LinkedListCard>
        )}
        ListEmptyComponent={
          list.isPending ? (
            <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
          ) : list.isError ? null : (
            <EmptyList icon={<ShieldCheck size={28} color={foreground} />}>
              {t("No organizations awaiting review")}
            </EmptyList>
          )
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {list.error instanceof CommunityApiError && list.error.status === 403
                    ? t("Moderator access required")
                    : t("Could not load organization reviews")}
                </Typography>
                <Button variant="outline" onPress={() => void list.refetch()}>
                  {t("Try again")}
                </Button>
              </>
            ) : null}
            {list.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : list.hasNextPage ? (
              <Button variant="outline" onPress={() => void list.fetchNextPage()}>
                {list.isFetchNextPageError
                  ? t("Could not load organization reviews. Retry")
                  : t("Load more")}
              </Button>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
