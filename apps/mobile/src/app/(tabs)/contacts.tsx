import { resolveApiUrl, useContacts } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Input } from "heroui-native/input";
import { Spinner } from "heroui-native/spinner";
import { Text } from "heroui-native/text";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useT } from "@/lib/i18n";

type TabKey = "following" | "friends" | "suggestions" | "search";

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

  const contacts = useContacts(apiUrl(), token);
  const isBusy = contacts.follow.isPending || contacts.unfollow.isPending;

  const followingRows = contacts.following.data ?? [];
  const friendsRows = contacts.friends.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const searchResults = contacts.search.data?.users ?? [];

  const tabButtons: Array<[TabKey, string]> = [
    ["following", t("Following")],
    ["friends", t("Friends")],
    ["suggestions", t("Suggestions")],
    ["search", t("Search")],
  ];

  return (
    <View className="flex-1 bg-background p-4">
      <Text className="mb-3 text-xl font-semibold">{t("Contacts")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row gap-2">
          {tabButtons.map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              className={`rounded-lg px-3 py-2 ${tab === key ? "bg-primary" : "bg-default-100"}`}
            >
              <Text className={`text-sm ${tab === key ? "text-primary-foreground" : ""}`}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ScrollView className="flex-1">
        {tab === "search" && (
          <View className="mb-3 gap-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
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
                    contacts.search.mutate({ query: query.trim() });
                    setSearchDone(true);
                  }
                }}
              >
                <Text>{t("Search")}</Text>
              </Button>
            </View>
            {contacts.search.isPending && <Spinner size="sm" />}
            {searchDone && !contacts.search.isPending && searchResults.length === 0 && (
              <Text className="text-sm text-muted">{t("No users found")}</Text>
            )}
            {searchResults.map((u) => (
              <Card key={u.id} className="flex-row items-center gap-3 p-3">
                <Avatar size="md">
                  {u.avatarUrl ? <Avatar.Image source={{ uri: u.avatarUrl }} /> : null}
                  <Avatar.Fallback>{u.name?.charAt(0) ?? "?"}</Avatar.Fallback>
                </Avatar>
                <View className="flex-1">
                  <View className="flex-row items-center">
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
          <View className="gap-2">
            {contacts.suggestions.isLoading && <Spinner size="sm" />}
            {suggestions.length === 0 && !contacts.suggestions.isLoading && (
              <Text className="text-sm text-muted">{t("No suggestions right now")}</Text>
            )}
            {suggestions.map((u) => (
              <Card key={u.id} className="flex-row items-center gap-3 p-3">
                <Avatar size="md">
                  {u.avatarUrl ? <Avatar.Image source={{ uri: u.avatarUrl }} /> : null}
                  <Avatar.Fallback>{u.name?.charAt(0) ?? "?"}</Avatar.Fallback>
                </Avatar>
                <View className="flex-1">
                  <View className="flex-row items-center">
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

        {(tab === "following" || tab === "friends") && (
          <View className="gap-2">
            {(tab === "following" ? contacts.following.isLoading : contacts.friends.isLoading) && (
              <Spinner size="sm" />
            )}
            {(tab === "following" ? followingRows : friendsRows).length === 0 &&
              !(tab === "following"
                ? contacts.following.isLoading
                : contacts.friends.isLoading) && (
                <Text className="text-sm text-muted">
                  {tab === "following"
                    ? t("You are not following anyone yet")
                    : t("No friends yet")}
                </Text>
              )}
            {(tab === "following" ? followingRows : friendsRows).map((row) => {
              const profile = row.profile;
              if (!profile) return null;
              return (
                <Card key={profile.id} className="flex-row items-center gap-3 p-3">
                  <Avatar size="md">
                    {profile.avatarUrl ? (
                      <Avatar.Image source={{ uri: profile.avatarUrl }} />
                    ) : null}
                    <Avatar.Fallback>{profile.name?.charAt(0) ?? "?"}</Avatar.Fallback>
                  </Avatar>
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className="font-medium">{profile.name}</Text>
                      <PresenceDot online={profile.presence.online} />
                    </View>
                    {profile.email ? (
                      <Text className="text-sm text-muted">{profile.email}</Text>
                    ) : null}
                  </View>
                  {tab === "following" ? (
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
