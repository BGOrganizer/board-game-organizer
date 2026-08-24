import {
  type ContactUser,
  reportPresence,
  resolveApiUrl,
  useContacts,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import * as SecureStore from "expo-secure-store";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Chip } from "heroui-native/chip";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { BookUser, MoreVertical, UserMinus, UserPlus, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import { InviteCard } from "@/components/InviteCard";
import { UserActionsSheet } from "@/components/UserActionsSheet";
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
type TabKey = "following" | "followers" | "friends" | "blocked" | "suggestions" | "search";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

/** Avatar with the presence dot floating on its top-right corner. */
function AvatarWithPresence({
  name,
  avatarUrl,
  online,
}: {
  name: string;
  avatarUrl: string | null;
  online: boolean;
}) {
  return (
    <View style={{ position: "relative" }}>
      <Avatar size="md">
        {avatarUrl ? <Avatar.Image source={{ uri: avatarUrl }} /> : null}
        <Avatar.Fallback>{name?.charAt(0) ?? "?"}</Avatar.Fallback>
      </Avatar>
      <View
        style={{
          position: "absolute",
          top: -1,
          right: -1,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: online ? "#22c55e" : "#9ca3af",
          borderWidth: 2,
          borderColor: "#fff",
        }}
      />
    </View>
  );
}

export default function ContactsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("following");
  const [query, setQuery] = useState("");
  const [menuUser, setMenuUser] = useState<ContactUser | null>(null);
  const [contactsPermission, setContactsPermission] = useState<
    "undetermined" | "granted" | "denied"
  >("undetermined");
  const [syncingContacts, setSyncingContacts] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const isBusy =
    contacts.follow.isPending ||
    contacts.unfollow.isPending ||
    contacts.block.isPending ||
    contacts.unblock.isPending;

  const handleUserAction = (u: ContactUser) => (key: string) => {
    if (key === "follow") contacts.follow.mutate({ targetUserId: u.id });
    else if (key === "unfollow") contacts.unfollow.mutate({ targetUserId: u.id });
    else if (key === "block") contacts.block.mutate({ targetUserId: u.id });
    else if (key === "unblock") contacts.unblock.mutate({ targetUserId: u.id });
    // profile: not implemented yet — no-op.
  };

  // Device address book: on first visit to Suggestions (and via the "Add
  // contacts" CTA) we show a CONFIRMATION dialog first. Only if the user
  // taps "Yes" does the real Android/iOS permission dialog fire. If the user
  // declines twice the system stops asking (canAskAgain=false) and we open
  // the app settings instead. The CTA stays tappable until consent is given.
  // With consent the matched registered users are persisted on the API
  // (POST /api/contacts/sync) and suggestions read them from the DB, so the
  // address book is only read once.
  const syncContactsData = useCallback(async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails],
      });
      const emails = Array.from(
        new Set(
          data
            .flatMap((c) => (c.emails ?? []).map((e) => e.email?.trim().toLowerCase() ?? ""))
            .filter(Boolean),
        ),
      );
      if (emails.length) {
        setSyncingContacts(true);
        try {
          await contacts.syncContacts.mutateAsync({ emails });
        } finally {
          setSyncingContacts(false);
        }
      }
    } catch {
      setContactsPermission("denied");
    }
  }, [contacts.syncContacts]);

  // Fire the REAL system permission request, track denials, and fall back to
  // the system settings after the second denial.
  const requestContactsAccess = useCallback(async () => {
    let permission = null;
    try {
      permission = await Contacts.getPermissionsAsync();
    } catch {
      permission = null;
    }
    if (!permission || !permission.granted) {
      try {
        permission = await Contacts.requestPermissionsAsync();
      } catch {
        permission = null;
      }
    }
    if (!permission || !permission.granted) {
      setContactsPermission("denied");
      // After ~2 denials Android/iOS stop showing the system dialog
      // (canAskAgain=false). Count denials; on the second one open the app
      // settings so the user can ALWAYS re-grant (no limit).
      let denials = 0;
      try {
        denials = Number(await SecureStore.getItemAsync("contacts_denials")) || 0;
      } catch {
        /* non-fatal */
      }
      denials += 1;
      try {
        await SecureStore.setItemAsync("contacts_denials", String(denials));
      } catch {
        /* non-fatal */
      }
      if (denials >= 2 || (permission && permission.canAskAgain === false)) {
        await Linking.openSettings().catch(() => {});
      }
      return;
    }
    // Granted: persist so the CTA never comes back, even across restarts.
    setContactsPermission("granted");
    try {
      await SecureStore.setItemAsync("contacts_granted", "true");
    } catch {
      /* non-fatal */
    }
    await syncContactsData();
  }, [syncContactsData]);

  // Confirmation dialog BEFORE the real permission request. "No" closes the
  // dialog and keeps the CTA; "Yes" fires the system permission prompt.
  const confirmAndRequestContacts = useCallback(() => {
    Alert.alert(
      t("Access to contacts"),
      t("Allow Board Game Organizer to access your contacts to find your friends?"),
      [
        { text: t("No"), style: "cancel" },
        { text: t("Yes"), onPress: () => void requestContactsAccess() },
      ],
    );
  }, [requestContactsAccess, t]);

  // Restore a previously granted consent (survives app restarts) so the tab
  // never re-prompts and the "Add contacts" CTA stays hidden.
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync("contacts_granted")
      .then((v) => {
        if (active && v === "true") setContactsPermission("granted");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // When the user grants in the SYSTEM SETTINGS and returns to the app, sync
  // automatically (AppState → active).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        let granted = false;
        try {
          const p = await Contacts.getPermissionsAsync();
          granted = Boolean(p?.granted);
        } catch {
          granted = false;
        }
        if (granted && contactsPermission !== "granted") {
          setContactsPermission("granted");
          try {
            await SecureStore.setItemAsync("contacts_granted", "true");
          } catch {
            /* non-fatal */
          }
          await syncContactsData();
        }
      })();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactsPermission, syncContactsData]);

  // Ask for permission the first time the user opens the Suggestions tab
  // (through the confirmation dialog — never an unprompted system dialog).
  useEffect(() => {
    if (tab !== "suggestions") return;
    if (contactsPermission !== "undetermined") return;
    confirmAndRequestContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Auto-search on input: fires 300ms after the user stops typing, only when
  // at least 4 characters are present (min prefix length per product spec).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 4) {
      debounceRef.current = null;
      return;
    }
    debounceRef.current = setTimeout(() => {
      contacts.runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const followingRows = contacts.following.data ?? [];
  // Ids the viewer follows — used by the Followers tab to render the right
  // icon (the server-side profile.isFollowing is relative to the list row and
  // is always false for follower rows).
  const followingIds = new Set(
    followingRows.map((r) => r.profile?.id).filter((id): id is string => Boolean(id)),
  );
  const followersRows = contacts.followers.data ?? [];
  const blockedRows = contacts.blocked.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const hasContacts = contacts.suggestions.data?.hasContacts ?? false;
  const searchResults = contacts.search.data?.users ?? [];

  const tabButtons: Array<[TabKey, string]> = [
    ["following", t("Following")],
    ["followers", t("Followers")],
    ["blocked", t("Blocked")],
    ["suggestions", t("Suggestions")],
    ["search", t("Search")],
  ];

  const listTab =
    tab === "following" || tab === "followers" || tab === "friends" || tab === "blocked"
      ? tab
      : null;
  const listRows =
    listTab === "following" ? followingRows : listTab === "followers" ? followersRows : blockedRows;
  const listLoading =
    listTab === "following"
      ? contacts.following.isLoading
      : listTab === "followers"
        ? contacts.followers.isLoading
        : contacts.blocked.isLoading;
  const listEmpty =
    listTab === "following"
      ? t("You are not following anyone yet")
      : listTab === "followers"
        ? t("No followers yet")
        : t("No blocked users");

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <InviteCard apiUrl={apiUrl()} token={token} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 12, marginBottom: 12, flexGrow: 0 }}
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
                  onChangeText={setQuery}
                  placeholder={t("Search users (at least 4 characters)")}
                />
              </View>
              {query.length > 0 && (
                <Pressable
                  onPress={() => {
                    setQuery("");
                    contacts.runSearch("");
                  }}
                  hitSlop={8}
                  accessibilityLabel={t("Clear search")}
                >
                  <X size={18} color="#8e8e93" />
                </Pressable>
              )}
            </View>
            {query.trim().length > 0 && query.trim().length < 4 && (
              <Text style={{ fontSize: 13, color: "#8e8e93" }}>
                {t("Type at least 4 characters to search")}
              </Text>
            )}
            {contacts.search.isPending && <ContactListSkeleton count={2} />}
            {query.trim().length >= 4 &&
              !contacts.search.isPending &&
              searchResults.length === 0 && (
                <Text style={{ fontSize: 13, color: "#8e8e93" }}>{t("No users found")}</Text>
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
                <AvatarWithPresence
                  name={u.name}
                  avatarUrl={u.avatarUrl}
                  online={u.presence.online}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text className="font-medium">{u.name}</Text>
                  </View>
                  {u.email ? (
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ fontSize: 13, color: "#8e8e93" }}
                    >
                      {u.email}
                    </Text>
                  ) : null}
                </View>
                <Button
                  variant="outline"
                  isIconOnly
                  size="sm"
                  style={{ minHeight: 30, minWidth: 30 }}
                  isDisabled={isBusy}
                  accessibilityLabel={u.isFollowing ? t("Unfollow") : t("Follow")}
                  testID={u.isFollowing ? "unfollow-btn" : "follow-btn"}
                  onPress={() =>
                    u.isFollowing
                      ? contacts.unfollow.mutate({ targetUserId: u.id })
                      : contacts.follow.mutate({ targetUserId: u.id })
                  }
                >
                  {u.isFollowing ? (
                    <UserMinus size={16} color="#111" />
                  ) : (
                    <UserPlus size={16} color="#111" />
                  )}
                </Button>
                <Pressable
                  onPress={() => setMenuUser(u)}
                  hitSlop={8}
                  accessibilityLabel={t("Actions")}
                  style={{ padding: 6 }}
                >
                  <MoreVertical size={18} color="#333" />
                </Pressable>
              </Card>
            ))}
          </View>
        )}

        {tab === "suggestions" && (
          <View style={{ gap: 8 }}>
            {contacts.suggestions.isLoading && <ContactListSkeleton count={3} />}
            {syncingContacts && <ContactListSkeleton count={2} />}
            {!contacts.suggestions.isLoading &&
              !syncingContacts &&
              suggestions.length === 0 &&
              !hasContacts && (
                <View style={{ gap: 8 }}>
                  <Text className="text-sm text-muted">
                    {contactsPermission === "denied"
                      ? t("Allow address book access to find your friends here.")
                      : t("No suggestions yet — sync your address book to find friends.")}
                  </Text>
                  {contactsPermission !== "granted" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={syncingContacts}
                      onPress={confirmAndRequestContacts}
                    >
                      <BookUser size={16} color="#111" />
                      <Text>{t("Add contacts")}</Text>
                    </Button>
                  ) : null}
                </View>
              )}
            {!contacts.suggestions.isLoading && suggestions.length === 0 && hasContacts && (
              <Text className="text-sm text-muted">
                {t("No friends from your contacts are on Board Game Organizer yet.")}
              </Text>
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
                <AvatarWithPresence
                  name={u.name}
                  avatarUrl={u.avatarUrl}
                  online={u.presence.online}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text className="font-medium">{u.name}</Text>
                  </View>
                  {u.email ? (
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ fontSize: 13, color: "#8e8e93" }}
                    >
                      {u.email}
                    </Text>
                  ) : null}
                </View>
                <Button
                  variant="outline"
                  isIconOnly
                  size="sm"
                  style={{ minHeight: 30, minWidth: 30 }}
                  isDisabled={isBusy}
                  accessibilityLabel={u.isFollowing ? t("Unfollow") : t("Follow")}
                  testID={u.isFollowing ? "unfollow-btn" : "follow-btn"}
                  onPress={() =>
                    u.isFollowing
                      ? contacts.unfollow.mutate({ targetUserId: u.id })
                      : contacts.follow.mutate({ targetUserId: u.id })
                  }
                >
                  {u.isFollowing ? (
                    <UserMinus size={16} color="#111" />
                  ) : (
                    <UserPlus size={16} color="#111" />
                  )}
                </Button>
                <Pressable
                  onPress={() => setMenuUser(u)}
                  hitSlop={8}
                  accessibilityLabel={t("Actions")}
                  style={{ padding: 6 }}
                >
                  <MoreVertical size={18} color="#333" />
                </Pressable>
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
                  <AvatarWithPresence
                    name={profile.name}
                    avatarUrl={profile.avatarUrl}
                    online={profile.presence.online}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text className="font-medium">{profile.name}</Text>
                    </View>
                    {profile.email ? (
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={{ fontSize: 13, color: "#8e8e93" }}
                      >
                        {profile.email}
                      </Text>
                    ) : null}
                  </View>
                  {listTab === "following" ? (
                    <Button
                      variant="outline"
                      isIconOnly
                      size="sm"
                      style={{ minHeight: 30, minWidth: 30 }}
                      isDisabled={isBusy}
                      accessibilityLabel={t("Unfollow")}
                      testID="unfollow-btn"
                      onPress={() => contacts.unfollow.mutate({ targetUserId: profile.id })}
                    >
                      <UserMinus size={16} color="#111" />
                    </Button>
                  ) : listTab === "followers" ? (
                    <Button
                      variant="outline"
                      isIconOnly
                      size="sm"
                      style={{ minHeight: 30, minWidth: 30 }}
                      isDisabled={isBusy}
                      accessibilityLabel={
                        followingIds.has(profile.id) ? t("Unfollow") : t("Follow")
                      }
                      testID={followingIds.has(profile.id) ? "unfollow-btn" : "follow-btn"}
                      onPress={() =>
                        followingIds.has(profile.id)
                          ? contacts.unfollow.mutate({ targetUserId: profile.id })
                          : contacts.follow.mutate({ targetUserId: profile.id })
                      }
                    >
                      {followingIds.has(profile.id) ? (
                        <UserMinus size={16} color="#111" />
                      ) : (
                        <UserPlus size={16} color="#111" />
                      )}
                    </Button>
                  ) : null}
                  <Pressable
                    onPress={() => setMenuUser(profile)}
                    hitSlop={8}
                    accessibilityLabel={t("Actions")}
                    style={{ padding: 6 }}
                  >
                    <MoreVertical size={18} color="#333" />
                  </Pressable>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      <UserActionsSheet
        visible={menuUser !== null}
        user={menuUser}
        busy={isBusy}
        error={
          contacts.follow.isError ||
          contacts.unfollow.isError ||
          contacts.block.isError ||
          contacts.unblock.isError
            ? t("Could not complete the action. Try again.")
            : null
        }
        onClose={() => setMenuUser(null)}
        onAction={(key) => {
          if (menuUser) handleUserAction(menuUser)(key);
        }}
      />
    </View>
  );
}
