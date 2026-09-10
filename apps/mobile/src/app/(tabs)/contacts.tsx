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
import {
  BookUser,
  Check,
  MoreVertical,
  UserMinus,
  UserPlus,
  UserRoundPlus,
  UserRoundX,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import { InviteCard } from "@/components/InviteCard";
import { UserActionsSheet } from "@/components/UserActionsSheet";
import { contactSyncPayload } from "@/lib/contacts";
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
type TabKey =
  | "following"
  | "followers"
  | "friends"
  | "requests"
  | "blocked"
  | "suggestions"
  | "search";

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
    contacts.unfriend.isPending ||
    contacts.friendRequest.isPending ||
    contacts.acceptFriendRequest.isPending ||
    contacts.rejectFriendRequest.isPending ||
    contacts.block.isPending ||
    contacts.unblock.isPending;
  const actionFailed =
    contacts.follow.isError ||
    contacts.unfollow.isError ||
    contacts.unfriend.isError ||
    contacts.friendRequest.isError ||
    contacts.acceptFriendRequest.isError ||
    contacts.rejectFriendRequest.isError ||
    contacts.block.isError ||
    contacts.unblock.isError;

  const handleUserAction = (u: ContactUser) => async (key: string) => {
    if (key === "follow") await contacts.follow.mutateAsync({ targetUserId: u.id });
    else if (key === "unfollow") await contacts.unfollow.mutateAsync({ targetUserId: u.id });
    else if (key === "unfriend") await contacts.unfriend.mutateAsync({ targetUserId: u.id });
    else if (key === "friend_request") {
      await contacts.friendRequest.mutateAsync({ targetUserId: u.id });
    } else if (key === "block") await contacts.block.mutateAsync({ targetUserId: u.id });
    else if (key === "unblock") await contacts.unblock.mutateAsync({ targetUserId: u.id });
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
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      setSyncingContacts(true);
      try {
        await contacts.syncContacts.mutateAsync(contactSyncPayload(data));
      } finally {
        setSyncingContacts(false);
      }
    } catch {
      setContactsPermission("denied");
    }
  }, [contacts.syncContacts]);

  // Fire the REAL system permission request and track denials. A denial only
  // returns to the screen (the CTA stays). The app settings are opened ONLY
  // when the user taps "Yes" again after already denying twice — the system
  // dialog would not re-appear anyway (canAskAgain=false).
  const requestContactsAccess = useCallback(async () => {
    let denials = 0;
    try {
      denials = Number(await SecureStore.getItemAsync("contacts_denials")) || 0;
    } catch {
      /* non-fatal */
    }
    if (denials >= 2) {
      // Consent was given to try again ("Yes") but the OS won't show the
      // dialog anymore → straight to the app settings.
      await Linking.openSettings().catch(() => {});
      return;
    }
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
      // Declined the system dialog → back to the screen, no redirect.
      setContactsPermission("denied");
      denials += 1;
      try {
        await SecureStore.setItemAsync("contacts_denials", String(denials));
      } catch {
        /* non-fatal */
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
    (async () => {
      // Real OS permission is the source of truth (the user may have revoked
      // it in the settings). The SecureStore flag is a fast path only.
      let granted = false;
      try {
        const p = await Contacts.getPermissionsAsync();
        granted = Boolean(p?.granted);
      } catch {
        granted = false;
      }
      if (!granted) {
        try {
          const stored = await SecureStore.getItemAsync("contacts_granted");
          granted = stored === "true";
        } catch {
          granted = false;
        }
      }
      if (active && granted) {
        setContactsPermission("granted");
        try {
          await SecureStore.setItemAsync("contacts_granted", "true");
        } catch {
          /* non-fatal */
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // When the user grants in the SYSTEM SETTINGS and returns to the app, sync
  // automatically (AppState → active). Android can lag a moment before the
  // permission state updates, so re-check briefly instead of trusting a
  // single read.
  const checkContactsGranted = useCallback(async () => {
    for (let i = 0; i < 5; i += 1) {
      let granted = false;
      try {
        const p = await Contacts.getPermissionsAsync();
        granted = Boolean(p?.granted);
      } catch {
        granted = false;
      }
      if (granted) {
        setContactsPermission("granted");
        try {
          await SecureStore.setItemAsync("contacts_granted", "true");
        } catch {
          /* non-fatal */
        }
        await syncContactsData();
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    }
  }, [syncContactsData]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkContactsGranted();
    });
    return () => sub.remove();
  }, [checkContactsGranted]);

  // Re-check when re-entering the Suggestions tab: some Android launchers
  // miss the AppState foreground event, so this is the safety net.
  useEffect(() => {
    if (tab !== "suggestions") return;
    if (contactsPermission === "granted") return;
    void checkContactsGranted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
  const friendsRows = contacts.friends.data ?? [];
  const pendingRows = contacts.pending.data ?? [];
  const sentRows = contacts.sent.data ?? [];
  const pendingRequestIds = new Set(
    pendingRows.map((row) => row.profile?.id).filter((id): id is string => Boolean(id)),
  );
  const sentRequestIds = new Set(
    sentRows.map((row) => row.profile?.id).filter((id): id is string => Boolean(id)),
  );
  const friendRequestsLoaded = contacts.pending.isSuccess && contacts.sent.isSuccess;
  const blockedRows = contacts.blocked.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const hasContacts = contacts.suggestions.data?.hasContacts ?? false;
  const searchResults = contacts.search.data?.users ?? [];

  const tabButtons: Array<[TabKey, string]> = [
    ["following", t("Following")],
    ["followers", t("Followers")],
    ["friends", t("Friends")],
    ["requests", t("Friend requests")],
    ["blocked", t("Blocked")],
    ["suggestions", t("Suggestions")],
    ["search", t("Search")],
  ];

  const listTab =
    tab === "following" || tab === "followers" || tab === "friends" || tab === "blocked"
      ? tab
      : null;
  const listRows =
    listTab === "following"
      ? followingRows
      : listTab === "followers"
        ? followersRows
        : listTab === "friends"
          ? friendsRows
          : blockedRows;
  const listLoading =
    listTab === "following"
      ? contacts.following.isLoading
      : listTab === "followers"
        ? contacts.followers.isLoading
        : listTab === "friends"
          ? contacts.friends.isLoading
          : contacts.blocked.isLoading;
  const listError =
    listTab === "following"
      ? contacts.following.isError
      : listTab === "followers"
        ? contacts.followers.isError
        : listTab === "friends"
          ? contacts.friends.isError
          : contacts.blocked.isError;
  const listEmpty =
    listTab === "following"
      ? t("You are not following anyone yet")
      : listTab === "followers"
        ? t("No followers yet")
        : listTab === "friends"
          ? t("No friends yet")
          : t("No blocked users");
  const canSendFriendRequest = (user: ContactUser) =>
    friendRequestsLoaded &&
    !user.isFriend &&
    !user.blockedByMe &&
    !user.blockedMe &&
    !pendingRequestIds.has(user.id) &&
    !sentRequestIds.has(user.id);
  const relationshipActions = (user: ContactUser) => {
    if (user.blockedByMe || user.blockedMe) return null;
    if (user.isFriend) {
      return (
        <Button
          variant="danger-soft"
          isIconOnly
          size="sm"
          style={{ minHeight: 30, minWidth: 30 }}
          isDisabled={isBusy}
          accessibilityLabel={`${t("Remove friend")}: ${user.name}`}
          testID="remove-friend-btn"
          onPress={() => contacts.unfriend.mutate({ targetUserId: user.id })}
        >
          <UserRoundX size={16} color="#dc2626" />
        </Button>
      );
    }
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          variant="outline"
          isIconOnly
          size="sm"
          style={{ minHeight: 30, minWidth: 30 }}
          isDisabled={isBusy}
          accessibilityLabel={user.isFollowing ? t("Unfollow") : t("Follow")}
          testID={user.isFollowing ? "unfollow-btn" : "follow-btn"}
          onPress={() =>
            user.isFollowing
              ? contacts.unfollow.mutate({ targetUserId: user.id })
              : contacts.follow.mutate({ targetUserId: user.id })
          }
        >
          {user.isFollowing ? (
            <UserMinus size={16} color="#111" />
          ) : (
            <UserPlus size={16} color="#111" />
          )}
        </Button>
        {canSendFriendRequest(user) && (
          <Button
            variant="outline"
            isIconOnly
            size="sm"
            style={{ minHeight: 30, minWidth: 30 }}
            isDisabled={isBusy}
            accessibilityLabel={t("Send friend request")}
            testID="friend-request-btn"
            onPress={() => contacts.friendRequest.mutate({ targetUserId: user.id })}
          >
            <UserRoundPlus size={16} color="#111" />
          </Button>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <InviteCard apiUrl={apiUrl()} token={token} />
      {actionFailed && (
        <Text accessibilityRole="alert" className="mt-2 text-sm text-danger">
          {t("Could not complete the action. Try again.")}
        </Text>
      )}
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
                {relationshipActions(u)}
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

        {tab === "requests" && (
          <View style={{ gap: 20 }}>
            {[
              {
                key: "received",
                label: t("Received"),
                rows: pendingRows,
                isLoading: contacts.pending.isLoading,
                isError: contacts.pending.isError,
                empty: t("No received friend requests"),
              },
              {
                key: "sent",
                label: t("Sent"),
                rows: sentRows,
                isLoading: contacts.sent.isLoading,
                isError: contacts.sent.isError,
                empty: t("No sent friend requests"),
              },
            ].map((section) => (
              <View key={section.key} style={{ gap: 8 }}>
                <Text className="font-semibold text-foreground">{section.label}</Text>
                {section.isLoading && <ContactListSkeleton count={2} />}
                {section.isError && (
                  <Text accessibilityRole="alert" className="text-sm text-danger">
                    {t("Could not load friend requests")}
                  </Text>
                )}
                {!section.isLoading && !section.isError && section.rows.length === 0 && (
                  <Text className="text-sm text-muted">{section.empty}</Text>
                )}
                {section.rows.map((row) => {
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
                        <Text className="font-medium text-foreground">{profile.name}</Text>
                        {profile.email ? (
                          <Text className="text-sm text-muted" numberOfLines={1}>
                            {profile.email}
                          </Text>
                        ) : null}
                      </View>
                      {section.key === "received" ? (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Button
                            size="sm"
                            isIconOnly
                            isDisabled={isBusy}
                            accessibilityLabel={`${t("Accept friend request")}: ${profile.name}`}
                            testID="accept-friend-request-btn"
                            onPress={() =>
                              contacts.acceptFriendRequest.mutate({ targetUserId: profile.id })
                            }
                          >
                            <Check size={16} color="#fff" />
                          </Button>
                          <Button
                            size="sm"
                            variant="danger-soft"
                            isIconOnly
                            isDisabled={isBusy}
                            accessibilityLabel={`${t("Decline friend request")}: ${profile.name}`}
                            testID="decline-friend-request-btn"
                            onPress={() =>
                              contacts.rejectFriendRequest.mutate({ targetUserId: profile.id })
                            }
                          >
                            <X size={16} color="#dc2626" />
                          </Button>
                        </View>
                      ) : (
                        <Chip size="sm" variant="secondary">
                          <Text className="text-muted">{t("Sent")}</Text>
                        </Chip>
                      )}
                    </Card>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {tab === "suggestions" && (
          <View style={{ gap: 8 }}>
            {contacts.suggestions.isLoading && <ContactListSkeleton count={3} />}
            {syncingContacts && <ContactListSkeleton count={2} />}
            {!contacts.suggestions.isLoading &&
              !syncingContacts &&
              contactsPermission !== "granted" && (
                <View style={{ gap: 8 }}>
                  <Text className="text-sm text-muted">
                    {contactsPermission === "denied"
                      ? t("Allow address book access to find your friends here.")
                      : t("No suggestions yet — sync your address book to find friends.")}
                  </Text>
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={syncingContacts}
                    onPress={confirmAndRequestContacts}
                  >
                    <BookUser size={16} color="#111" />
                    <Text>{t("Add contacts")}</Text>
                  </Button>
                </View>
              )}
            {!contacts.suggestions.isLoading &&
              contactsPermission === "granted" &&
              suggestions.length === 0 && (
                <Text className="text-sm text-muted">
                  {hasContacts
                    ? t("No friends from your contacts are on Board Game Organizer yet.")
                    : t("No contacts found in your address book.")}
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
                {relationshipActions(u)}
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
            {listError && (
              <Text accessibilityRole="alert" className="text-sm text-danger">
                {listTab === "friends" ? t("Could not load friends") : t("Could not load contacts")}
              </Text>
            )}
            {listRows.length === 0 && !listLoading && !listError && (
              <Text className="text-sm text-muted" style={{ textAlign: "left" }}>
                {listEmpty}
              </Text>
            )}
            {listRows.map((row) => {
              const profile = row.profile;
              if (!profile) return null;
              const actionUser =
                listTab === "following"
                  ? { ...profile, isFollowing: true }
                  : listTab === "followers"
                    ? { ...profile, isFollowing: followingIds.has(profile.id) }
                    : profile;
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
                  {listTab === "blocked" ? null : relationshipActions(actionUser)}
                  <Pressable
                    onPress={() => setMenuUser(actionUser)}
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
        canSendFriendRequest={menuUser !== null && canSendFriendRequest(menuUser)}
        error={actionFailed ? t("Could not complete the action. Try again.") : null}
        onClose={() => setMenuUser(null)}
        onAction={(key) => (menuUser ? handleUserAction(menuUser)(key) : Promise.resolve())}
      />
    </View>
  );
}
