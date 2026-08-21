import { reportPresence, resolveApiUrl, useContacts } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Chip } from "heroui-native/chip";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { useT } from "@/lib/i18n";

/** Placeholder shown while a contact list is loading. */
function ContactListSkeleton({ count = 4 }: { count?: number }) {
  const keys = Array.from({ length: count }, (_, i) => `sk-${count}-${i}`);
  return (
    <View style={{ gap: 12, width: "100%" }}>
      {keys.map((key) => (
        <View
          key={key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            borderRadius: 12,
            width: "100%",
            backgroundColor: "rgba(120,120,128,0.12)",
          }}
        >
          <Skeleton isLoading variant="pulse" style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "60%", height: 14, borderRadius: 4 }}
            />
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "40%", height: 12, borderRadius: 4 }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
type TabKey = "following" | "followers" | "friends" | "suggestions" | "search";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

function PresenceDot({ online }: { online: boolean }) {
  return (
    <View className={`ml-1 h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-gray-400"}`} />
  );
}

export default function ContactsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("following");
  const [query, setQuery] = useState("");
  const [searchDone, setSearchDone] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setToken(null);
      return;
    }
    let active = true;
    getToken()
      .then((tok) => {
        if (active) setToken(tok ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Presence heartbeat: keep the green-dot fresh while the screen is open.
  // Uses a fresh session token each beat so the JWT rotation never 401s.
  useEffect(() => {
    if (!token) return;
    const heartbeat = () => {
      getToken()
        .then((tok) => {
          if (tok) reportPresence(apiUrl(), tok, "online").catch(() => {});
        })
        .catch(() => {});
    };
    heartbeat();
    const interval = setInterval(heartbeat, 60_000);
    return () => clearInterval(interval);
  }, [token, getToken]);

  const contacts = useContacts(apiUrl(), token, getToken);
  const isBusy = contacts.follow.isPending || contacts.unfollow.isPending;

  const followingRows = contacts.following.data ?? [];
  const followersRows = contacts.followers.data ?? [];
  const friendsRows = contacts.friends.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const searchResults = contacts.search.data?.users ?? [];

  const tabButtons: Array<[TabKey, string]> = [
    ["following", t("Following")],
    ["followers", t("Followers")],
    ["friends", t("Friends")],
    ["suggestions", t("Suggestions")],
    ["search", t("Search")],
  ];

  const listTab = tab === "following" || tab === "followers" || tab === "friends" ? tab : null;
  const listRows =
    listTab === "following" ? followingRows : listTab === "followers" ? followersRows : friendsRows;
  const listLoading =
    listTab === "following"
      ? contacts.following.isLoading
      : listTab === "followers"
        ? contacts.followers.isLoading
        : contacts.friends.isLoading;
  const listEmpty =
    listTab === "following"
      ? t("You are not following anyone yet")
      : listTab === "followers"
        ? t("No followers yet")
        : t("No friends yet");

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12, flexGrow: 0 }}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tabButtons.map(([key, label]) => (
            <Chip
              key={key}
              variant={tab === key ? "primary" : "secondary"}
              color={tab === key ? "accent" : "default"}
              size="md"
              onPress={() => setTab(key)}
            >
              <Text className={tab === key ? "text-accent-foreground" : "text-muted"}>{label}</Text>
            </Chip>
          ))}
        </View>
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {tab === "search" && (
          <View style={{ marginBottom: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  value={query}
                  onChangeText={(v) => {
                    setQuery(v);
                    setSearchDone(false);
                  }}
                  placeholder={t("Search users by name or email")}
                />
              </View>
              <Button
                variant="primary"
                onPress={() => {
                  if (query.trim()) {
                    contacts.runSearch(query);
                    setSearchDone(true);
                  }
                }}
              >
                <Text>{t("Search")}</Text>
              </Button>
            </View>
            {contacts.search.isPending && <ContactListSkeleton count={2} />}
            {searchDone && !contacts.search.isPending && searchResults.length === 0 && (
              <Text className="text-sm text-muted">{t("No users found")}</Text>
            )}
            {searchResults.map((u) => (
              <Card
                key={u.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  width: "100%",
                }}
              >
                <Avatar size="md">
                  {u.avatarUrl ? <Avatar.Image source={{ uri: u.avatarUrl }} /> : null}
                  <Avatar.Fallback>{u.name?.charAt(0) ?? "?"}</Avatar.Fallback>
                </Avatar>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text className="font-medium">{u.name}</Text>
                    <PresenceDot online={u.presence.online} />
                  </View>
                  {u.email ? <Text className="text-sm text-muted">{u.email}</Text> : null}
                </View>
                <Button
                  variant="outline"
                  isDisabled={isBusy}
                  onPress={() => contacts.follow.mutate({ targetUserId: u.id })}
                >
                  <Text>{t("Follow")}</Text>
                </Button>
              </Card>
            ))}
          </View>
        )}

        {tab === "suggestions" && (
          <View style={{ gap: 8 }}>
            {contacts.suggestions.isLoading && <ContactListSkeleton count={3} />}
            {suggestions.length === 0 && !contacts.suggestions.isLoading && (
              <Text className="text-sm text-muted">{t("No suggestions right now")}</Text>
            )}
            {suggestions.map((u) => (
              <Card
                key={u.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  width: "100%",
                }}
              >
                <Avatar size="md">
                  {u.avatarUrl ? <Avatar.Image source={{ uri: u.avatarUrl }} /> : null}
                  <Avatar.Fallback>{u.name?.charAt(0) ?? "?"}</Avatar.Fallback>
                </Avatar>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text className="font-medium">{u.name}</Text>
                    <PresenceDot online={u.presence.online} />
                  </View>
                  {u.email ? <Text className="text-sm text-muted">{u.email}</Text> : null}
                </View>
                <Button
                  variant="outline"
                  isDisabled={isBusy}
                  onPress={() => contacts.follow.mutate({ targetUserId: u.id })}
                >
                  <Text>{t("Follow")}</Text>
                </Button>
              </Card>
            ))}
          </View>
        )}

        {listTab && (
          <View style={{ gap: 8 }}>
            {listLoading && <ContactListSkeleton count={4} />}
            {listRows.length === 0 && !listLoading && (
              <Text className="text-sm text-muted" style={{ textAlign: "left" }}>
                {listEmpty}
              </Text>
            )}
            {listRows.map((row) => {
              const profile = row.profile;
              if (!profile) return null;
              return (
                <Card
                  key={profile.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    width: "100%",
                  }}
                >
                  <Avatar size="md">
                    {profile.avatarUrl ? (
                      <Avatar.Image source={{ uri: profile.avatarUrl }} />
                    ) : null}
                    <Avatar.Fallback>{profile.name?.charAt(0) ?? "?"}</Avatar.Fallback>
                  </Avatar>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text className="font-medium">{profile.name}</Text>
                      <PresenceDot online={profile.presence.online} />
                    </View>
                    {profile.email ? (
                      <Text className="text-sm text-muted">{profile.email}</Text>
                    ) : null}
                  </View>
                  {listTab === "following" ? (
                    <Button
                      variant="outline"
                      isDisabled={isBusy}
                      onPress={() => contacts.unfollow.mutate({ targetUserId: profile.id })}
                    >
                      <Text>{t("Unfollow")}</Text>
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
