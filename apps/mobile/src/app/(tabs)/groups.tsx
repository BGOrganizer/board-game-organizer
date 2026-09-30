import { resolveApiUrl, useGroups, useListFilters } from "@board-game-organizer/shared";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import squircles from "@dicebear/styles/squircles.json" with { type: "json" };
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Crown, LockKeyhole, LockKeyholeOpen, Mail, Plus, UsersRound } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { EmptyList } from "@/components/EmptyList";
import { InvitationActions } from "@/components/InvitationActions";
import { LinkedListCard } from "@/components/LinkedListCard";
import { ListSearchFilters } from "@/components/ListSearchFilters";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { useSessionAuth } from "@/lib/useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
const squirclesStyle = new Style(squircles);

function GroupArtwork({ name, admin }: { name: string; admin: boolean }) {
  const t = useT();
  const xml = useMemo(
    () => new DiceBearAvatar(squirclesStyle, { seed: name, size: 64 }).toString(),
    [name],
  );
  return (
    <View style={{ width: 64, height: 64, flexShrink: 0 }}>
      <View style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden" }}>
        <SvgXml xml={xml} width={64} height={64} />
      </View>
      {admin ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t("Group admin")}
          className="bg-surface"
          style={{ position: "absolute", top: 0, left: 0, padding: 4, borderBottomRightRadius: 8 }}
        >
          <Crown size={16} color="#f59e0b" />
        </View>
      ) : null}
    </View>
  );
}

export default function GroupsScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { i18n } = useLingui();
  const feedback = useMutationFeedback();
  const filters = useListFilters();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((value) => {
        if (active) setToken(value ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);
  const groups = useGroups({
    apiUrl,
    token,
    getToken,
    userId,
    feedback,
    listFilters: filters.filters,
  });

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={groups.list.data ?? []}
        keyExtractor={(group) => group.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (
            groups.paging.hasNextPage &&
            !groups.paging.isFetchingNextPage &&
            !groups.paging.isFetchNextPageError
          )
            void groups.paging.fetchNextPage();
        }}
        ListHeaderComponent={
          <ListSearchFilters
            query={filters.query}
            onQueryChange={filters.setQuery}
            roles={filters.roles}
            onToggle={filters.toggleRole}
            label={t("Search groups")}
            placeholder={t("Search groups")}
          />
        }
        ListEmptyComponent={
          groups.list.isPending ? (
            <View style={{ gap: 12 }}>
              {[1, 2, 3].map((id) => (
                <Skeleton key={id} style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ))}
            </View>
          ) : groups.list.isError ? null : (
            <EmptyList icon={<UsersRound size={28} color="#737373" />}>
              {filters.roles.length === 3 && !filters.filters.query
                ? t("No groups yet")
                : t("No groups match your filters")}
            </EmptyList>
          )
        }
        renderItem={({ item: group }) => {
          const admin = group.adminUserId === userId;
          const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
          return (
            <LinkedListCard
              key={group.id}
              label={`${t("Open group")}: ${group.name}`}
              onPress={() =>
                router.push({ pathname: "/group/[groupId]", params: { groupId: group.id } })
              }
              actions={
                invitation?.status === "PENDING" ? (
                  <InvitationActions
                    placement="card"
                    name={group.name}
                    pending={groups.respond.isPending}
                    onAccept={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                    }
                    onDecline={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "decline" })
                    }
                  />
                ) : undefined
              }
            >
              <GroupArtwork name={group.name} admin={admin} />
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Typography numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>
                    {group.name}
                  </Typography>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    {group.isPublic ? (
                      <LockKeyholeOpen size={14} color="#6b7280" />
                    ) : (
                      <LockKeyhole size={14} color="#6b7280" />
                    )}
                    <Typography className="text-muted" style={{ fontSize: 12 }}>
                      {group.isPublic ? t("Public") : t("Private")}
                    </Typography>
                  </View>
                </View>
                <Typography className="text-muted" style={{ fontSize: 13 }}>
                  {new Date(group.createdAt).toLocaleDateString(i18n.locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Typography>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingRight: invitation?.status === "PENDING" ? 88 : 0,
                  }}
                >
                  <UsersRound size={14} color="#6b7280" />
                  <Typography className="text-muted" style={{ fontSize: 13 }}>
                    {group.memberCount} {group.memberCount === 1 ? t("member") : t("members")}
                  </Typography>
                </View>
                {admin && group.invitations.some((item) => item.status === "PENDING") ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Mail size={14} color="#6b7280" />
                    <Typography className="text-muted" style={{ fontSize: 12 }}>
                      {group.invitations.filter((item) => item.status === "PENDING").length}{" "}
                      {t("Invited")}
                    </Typography>
                  </View>
                ) : null}
              </View>
            </LinkedListCard>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {groups.list.isError && (
              <View style={{ gap: 8 }}>
                <Typography className="text-danger">{t("Could not load groups")}</Typography>
                <Button variant="outline" onPress={() => void groups.list.refetch()}>
                  {t("Try again")}
                </Button>
              </View>
            )}
            {groups.paging.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
            ) : groups.paging.hasNextPage ? (
              <Button variant="outline" onPress={() => void groups.paging.fetchNextPage()}>
                {groups.paging.isFetchNextPageError
                  ? t("Could not load groups. Retry")
                  : t("Load more")}
              </Button>
            ) : null}
          </View>
        }
      />
      <Button
        isIconOnly
        variant="primary"
        accessibilityLabel={t("Create group")}
        testID="create-group-fab"
        onPress={() => router.push("/group/wizard")}
        style={{
          position: "absolute",
          right: 20,
          bottom: Math.max(24, insets.bottom + 12),
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        }}
      >
        <Plus color="#fff" size={26} />
      </Button>
    </View>
  );
}
