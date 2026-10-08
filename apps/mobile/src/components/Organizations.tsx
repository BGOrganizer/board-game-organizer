import type { OrganizationResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { SearchField } from "heroui-native/search-field";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Building2, Crown, Plus, UsersRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/EmptyList";
import { FloatingActions } from "@/components/FloatingActions";
import { LinkedListCard } from "@/components/LinkedListCard";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function OrganizationArtwork({ organization }: { organization: OrganizationResponse }) {
  const warning = useThemeColor("warning");
  return (
    <View style={{ width: 64, height: 64, flexShrink: 0 }}>
      <Image
        source={{ uri: organization.logo }}
        resizeMode="contain"
        accessible={false}
        style={{ width: 64, height: 64, borderRadius: 12 }}
      />
      {organization.role === "admin" ? (
        <View style={{ position: "absolute", left: 0, top: 0 }}>
          <Crown size={16} color={warning} />
        </View>
      ) : null}
    </View>
  );
}
export function Organizations({ scope = "mine" }: { scope?: "mine" | "public" }) {
  const options = useCommunityApi();
  const router = useRouter();
  const t = useT();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  const list = useOrganizationList(options, scope, search);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        testID="organizations-scroll"
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: floatingActionLayout(insets.bottom, 16).paddingBottom,
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <SearchField value={query} onChange={setQuery}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  accessibilityLabel={t("Search organizations")}
                  placeholder={t("Search organizations")}
                  maxLength={120}
                />
                <SearchField.ClearButton accessibilityLabel={t("Clear search")} />
              </SearchField.Group>
            </SearchField>
            {scope === "public" && !search ? (
              <Typography className="text-muted">
                {t("Enter at least 4 characters to search")}
              </Typography>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          scope === "public" && !search ? null : list.isPending ? (
            <View style={{ gap: 12 }}>
              {[1, 2, 3].map((id) => (
                <Skeleton key={id} style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ))}
            </View>
          ) : list.isError ? null : (
            <EmptyList icon={<Building2 size={28} color={foreground} />}>
              {t("No organizations found")}
            </EmptyList>
          )
        }
        renderItem={({ item: organization }) => (
          <LinkedListCard
            label={`${t("Open organization")}: ${organization.name}`}
            onPress={() =>
              router.push({
                pathname: "/organization/[organizationId]",
                params: { organizationId: organization.id },
              })
            }
          >
            <OrganizationArtwork organization={organization} />
            <View style={{ flex: 1, gap: 4 }}>
              <Typography numberOfLines={1} className="font-semibold">
                {organization.name}
              </Typography>
              <Typography numberOfLines={2} className="text-muted" style={{ fontSize: 13 }}>
                {formatLocationAddress(organization.location.address)}
              </Typography>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <UsersRound size={14} color={foreground} />
                <Typography className="text-muted" style={{ fontSize: 13 }}>
                  {organization.memberCount} {t("members")}
                </Typography>
              </View>
              {organization.status === "PENDING" || organization.status === "MODIFIED" ? (
                <Typography className="text-warning" style={{ fontSize: 12 }}>
                  {organization.reviewStatus === "REJECTED"
                    ? t("Changes rejected")
                    : t("Awaiting review")}
                </Typography>
              ) : null}
              {organization.role === "invited" ? (
                <Typography className="text-warning" style={{ fontSize: 12 }}>
                  {t("Invitation received")}
                </Typography>
              ) : organization.role === "requested" ? (
                <Typography className="text-warning" style={{ fontSize: 12 }}>
                  {t("Membership requested")}
                </Typography>
              ) : null}
            </View>
          </LinkedListCard>
        )}
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load organizations")}
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
                  ? t("Could not load organizations. Retry")
                  : t("Load more")}
              </Button>
            ) : null}
          </View>
        }
      />
      {scope === "mine" ? (
        <FloatingActions
          label="New organization"
          testID="new-organization-fab"
          variant="primary"
          extraBottom={16}
          isDisabled={!options.userId}
          onPress={() => router.push("/organization/wizard")}
        >
          <Plus size={26} color={accentForeground} />
        </FloatingActions>
      ) : null}
    </View>
  );
}
