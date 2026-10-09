import {
  type ContactUser,
  useGroups,
  useRelationshipList,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { SearchField } from "heroui-native/search-field";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserPlus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return (
    (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.trim() || "http://localhost:4000"
  );
}

export default function SearchUserScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
  const router = useRouter();
  const { slotId, exclude, groupId } = useLocalSearchParams<{
    slotId: string;
    exclude?: string | string[];
    groupId?: string;
  }>();
  const excludedIds = useMemo(() => {
    const value = Array.isArray(exclude) ? exclude[0] : exclude;
    return new Set((value ?? "").split(",").filter(Boolean));
  }, [exclude]);
  const setPendingUser = useAppStore((s) => s.setPendingUser);
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const friends = useRelationshipList(
    apiUrl(),
    token,
    getToken,
    undefined,
    userId,
    "friends",
    !groupId,
  );
  const [results, setResults] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = useGroups({ apiUrl: apiUrl(), token, getToken, userId, groupId });
  const members = groupId ? groups.detail.data?.group.memberProfiles : undefined;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => active && setToken(tok ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    if (groupId) return;
    if (query.trim().length < 4) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const fresh = await getToken();
        if (!fresh) throw new Error("Authentication required");
        const res = await fetch(
          withProtectionBypass(
            `${apiUrl()}/api/users/search?query=${encodeURIComponent(query.trim())}`,
          ),
          { headers: { Authorization: `Bearer ${fresh}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { users: ContactUser[] };
        if (active) setResults(data.users.filter((user) => user.isFriend));
      } catch {
        if (active) setError(t("Search failed"));
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, token, getToken, t, groupId]);

  const shown = (
    groupId
      ? (members ?? []).filter(
          (user) =>
            query.trim().length < 4 ||
            `${user.name} ${user.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : query.trim().length >= 4
        ? results
        : (friends.data ?? []).map((f) => f.profile).filter((p): p is ContactUser => Boolean(p))
  ).filter((user) => user.id !== userId && !excludedIds.has(user.id));

  const select = (u: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  }) => {
    if (!slotId) {
      // Route param missing (deep link / stale navigation): the selection
      // can't be routed back to a wizard slot — drop it instead of leaving
      // a dangling pending that would confuse the next pick.
      console.warn("[match] select user without slotId, ignoring");
      return;
    }
    setPendingUser(slotId, {
      id: u.id,
      name: u.name ?? "",
      email: u.email ?? null,
      avatarUrl: u.avatarUrl ?? null,
    });
    router.back();
  };

  const listError =
    error ||
    (groupId
      ? groups.detail.isError
        ? t("Could not load groups")
        : null
      : friends.isError
        ? t("Could not load friends")
        : null);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <SearchHelpLabel
          label={t("Search users by name or email")}
          help={t("Type at least 4 characters to search")}
        />
        <SearchField value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input
              accessibilityLabel={t("Search users by name or email")}
              placeholder={t("Search users")}
            />
            <SearchField.ClearButton accessibilityLabel={t("Clear")} />
          </SearchField.Group>
        </SearchField>
      </View>
      {listError && (
        <Typography
          className="text-danger"
          style={{ fontSize: 13, paddingHorizontal: 16, marginTop: 8 }}
        >
          {listError}
        </Typography>
      )}
      {(groupId
        ? groups.detail.isError && !groups.detail.data
        : friends.isError && !friends.data) && (
        <Button
          variant="secondary"
          onPress={() => void (groupId ? groups.detail.refetch() : friends.refetch())}
        >
          {t("Retry")}
        </Button>
      )}
      {(loading || (groupId ? groups.detail.isPending : friends.isPending)) && (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton
            isLoading
            variant="pulse"
            style={{ width: "100%", height: 48, borderRadius: 12 }}
          />
          <Skeleton
            isLoading
            variant="pulse"
            style={{ width: "100%", height: 48, borderRadius: 12 }}
          />
        </View>
      )}
      {!loading &&
        !(groupId ? groups.detail.isPending : friends.isPending) &&
        shown.length === 0 &&
        (query.trim().length >= 4 || !friends.hasNextPage) &&
        !listError && (
          <Typography style={{ color: "#6b7280", fontSize: 14, padding: 16 }}>
            {t("No users found")}
          </Typography>
        )}
      <FlatList
        data={shown}
        keyExtractor={(user) => user.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (
            !groupId &&
            query.trim().length < 4 &&
            friends.hasNextPage &&
            !friends.isFetchingNextPage &&
            !friends.isFetchNextPageError
          )
            void friends.fetchNextPage();
        }}
        ListFooterComponent={
          !groupId && query.trim().length < 4 ? (
            friends.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
            ) : friends.isFetchNextPageError ? (
              <Button variant="secondary" onPress={() => void friends.fetchNextPage()}>
                {t("Retry")}
              </Button>
            ) : null
          ) : null
        }
        renderItem={({ item: u }) => (
          <GroupedList>
            <UserListRow
              name={u.name}
              avatarUrl={u.avatarUrl}
              secondary={u.email}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  accessibilityLabel={`${t("Add")}: ${u.name}`}
                  onPress={() => select(u)}
                >
                  <UserPlus size={16} color="#fff" />
                </Button>
              }
            />
          </GroupedList>
        )}
      />
    </View>
  );
}
