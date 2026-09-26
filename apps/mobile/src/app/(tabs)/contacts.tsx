import {
  type ContactUser,
  reportPresence,
  resolveApiUrl,
  useContacts,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Chip } from "heroui-native/chip";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import {
  BookUser,
  MoreVertical,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { InviteCard } from "@/components/InviteCard";
import { type UserActionConfirmation, UserActionsSheet } from "@/components/UserActionsSheet";
import { type ContactTab, contactSyncPayload, contactTab } from "@/lib/contacts";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import type { FriendRequestContext, UserActionKey } from "@/lib/user-actions";

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
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const mutationFeedback = useMutationFeedback();
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string | string[] }>();
  const tab = contactTab(tabParam);
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [menuUser, setMenuUser] = useState<ContactUser | null>(null);
  const [menuFriendRequest, setMenuFriendRequest] = useState<FriendRequestContext>();
  const [initialConfirmAction, setInitialConfirmAction] = useState<UserActionConfirmation>();
  const [contactsPermission, setContactsPermission] = useState<
    "checking" | "undetermined" | "granted" | "denied"
  >("checking");
  const [syncingContacts, setSyncingContacts] = useState(false);
  const contactsSyncRef = useRef<Promise<void> | null>(null);
  const contactsPromptShownRef = useRef(false);
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
  }, [getToken, isLoaded, isSignedIn]);

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

  const contacts = useContacts(apiUrl(), token, getToken, undefined, userId, mutationFeedback);
  const isBusy =
    contacts.follow.isPending ||
    contacts.unfollow.isPending ||
    contacts.unfriend.isPending ||
    contacts.friendRequest.isPending ||
    contacts.cancelFriendRequest.isPending ||
    contacts.acceptFriendRequest.isPending ||
    contacts.rejectFriendRequest.isPending ||
    contacts.block.isPending ||
    contacts.unblock.isPending;
  const openUserActions = (
    user: ContactUser,
    friendRequest?: FriendRequestContext,
    confirmation?: UserActionConfirmation,
  ) => {
    setMenuUser(user);
    setMenuFriendRequest(friendRequest);
    setInitialConfirmAction(confirmation);
  };
  const closeUserActions = () => {
    setMenuUser(null);
    setMenuFriendRequest(undefined);
    setInitialConfirmAction(undefined);
  };
  const handleUserAction = (user: ContactUser) => async (key: UserActionKey) => {
    const variables = { targetUserId: user.id, targetUser: user };
    if (key === "follow") await contacts.follow.mutateAsync(variables);
    else if (key === "unfollow") await contacts.unfollow.mutateAsync(variables);
    else if (key === "unfriend") await contacts.unfriend.mutateAsync(variables);
    else if (key === "friend_request") await contacts.friendRequest.mutateAsync(variables);
    else if (key === "cancel_friend_request") {
      await contacts.cancelFriendRequest.mutateAsync(variables);
    } else if (key === "accept_friend_request") {
      await contacts.acceptFriendRequest.mutateAsync(variables);
    } else if (key === "reject_friend_request") {
      await contacts.rejectFriendRequest.mutateAsync(variables);
    } else if (key === "block") await contacts.block.mutateAsync(variables);
    else if (key === "unblock") await contacts.unblock.mutateAsync(variables);
    // profile: not implemented yet — no-op.
  };

  // Device address book: on first visit to Suggestions (and via the "Add
  // contacts" CTA) we show a CONFIRMATION dialog first. Only if the user
  // taps "Yes" does the real Android/iOS permission dialog fire. If the user
  // declines twice the system stops asking (canAskAgain=false) and we open
  // the app settings instead. The CTA stays tappable until consent is given.
  // With consent matched users are persisted through POST /api/contacts/sync;
  // raw address-book values are never stored locally.
  const syncContactsMutation = contacts.syncContacts.mutateAsync;
  const syncContactsData = useCallback(
    (showFeedback = true) => {
      if (contactsSyncRef.current) return contactsSyncRef.current;

      const sync = (async () => {
        setSyncingContacts(true);
        let stage = "read";
        try {
          const data = await Contacts.Contact.getAllDetails([
            Contacts.ContactField.EMAILS,
            Contacts.ContactField.PHONES,
          ]);
          stage = "request";
          await syncContactsMutation({ ...contactSyncPayload(data), silent: !showFeedback });
        } catch (error) {
          Sentry.captureException(error, { tags: { operation: "contacts.sync", stage } });
          if (stage === "read" && showFeedback) {
            mutationFeedback.onError?.(
              error instanceof Error ? error : new Error("Could not read contacts"),
              "sync_contacts",
            );
          }
        } finally {
          setSyncingContacts(false);
          contactsSyncRef.current = null;
        }
      })();
      contactsSyncRef.current = sync;
      return sync;
    },
    [mutationFeedback, syncContactsMutation],
  );

  // Fire the REAL system permission request and track denials. A denial only
  // returns to the screen (the CTA stays). The app settings are opened ONLY
  // when the user taps "Yes" again after already denying twice — the system
  // dialog would not re-appear anyway (canAskAgain=false).
  const requestContactsAccess = useCallback(async () => {
    let permission = null;
    try {
      permission = await Contacts.getPermissionsAsync();
    } catch {
      permission = null;
    }
    if (permission?.granted) {
      setContactsPermission("granted");
      await SecureStore.deleteItemAsync("contacts_denials").catch(() => {});
      await syncContactsData();
      return;
    }

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
    try {
      permission = await Contacts.requestPermissionsAsync();
    } catch {
      permission = null;
    }
    if (!permission?.granted) {
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

    setContactsPermission("granted");
    await SecureStore.deleteItemAsync("contacts_denials").catch(() => {});
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

  // Native permission is the only source of truth; OS already persists it.
  useEffect(() => {
    let active = true;
    void Contacts.getPermissionsAsync()
      .then((permission) => {
        if (!active) return;
        setContactsPermission(
          permission.granted
            ? "granted"
            : permission.status === "denied"
              ? "denied"
              : "undetermined",
        );
      })
      .catch(() => {
        if (active) setContactsPermission("undetermined");
      });
    return () => {
      active = false;
    };
  }, []);

  // When the user grants in SYSTEM SETTINGS and returns, sync automatically.
  const checkContactsGranted = useCallback(async () => {
    if (contactsPermission === "granted") {
      try {
        const permission = await Contacts.getPermissionsAsync();
        if (!permission.granted) {
          setContactsPermission("denied");
          return;
        }
        await syncContactsData(false);
      } catch {
        /* keep last known permission state */
      }
      return;
    }

    // Android can lag briefly before publishing the new permission state.
    for (let i = 0; i < 5; i += 1) {
      try {
        const permission = await Contacts.getPermissionsAsync();
        if (permission.granted) {
          setContactsPermission("granted");
          await SecureStore.deleteItemAsync("contacts_denials").catch(() => {});
          await syncContactsData(false);
          return;
        }
      } catch {
        /* retry below */
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    }
  }, [contactsPermission, syncContactsData]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkContactsGranted();
    });
    return () => sub.remove();
  }, [checkContactsGranted]);

  // Ask for permission the first time the user opens the Suggestions tab
  // (through the confirmation dialog — never an unprompted system dialog).
  useEffect(() => {
    if (
      tab !== "suggestions" ||
      contactsPermission !== "undetermined" ||
      contactsPromptShownRef.current
    ) {
      return;
    }
    contactsPromptShownRef.current = true;
    confirmAndRequestContacts();
  }, [confirmAndRequestContacts, contactsPermission, tab]);

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
  }, [contacts.runSearch, query]);

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
  const visibleSuggestions =
    contacts.suggestions.isLoading || syncingContacts || contactsPermission === "checking"
      ? []
      : suggestions;
  const hasContacts = contacts.suggestions.data?.hasContacts ?? false;
  const searchResults = contacts.search.data?.users ?? [];

  const tabButtons: Array<[ContactTab, string]> = [
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
          onPress={() => openUserActions(user, undefined, "unfriend")}
        >
          <UserRoundX size={16} color="#dc2626" />
        </Button>
      );
    }
    return (
      <Button
        variant="outline"
        isIconOnly
        size="sm"
        style={{ minHeight: 30, minWidth: 30 }}
        isDisabled={isBusy}
        accessibilityLabel={user.isFollowing ? t("Unfollow") : t("Follow")}
        testID={user.isFollowing ? "unfollow-btn" : "follow-btn"}
        onPress={() =>
          void handleUserAction(user)(user.isFollowing ? "unfollow" : "follow").catch(() => {})
        }
      >
        {user.isFollowing ? (
          <UserMinus size={16} color="#111" />
        ) : (
          <UserPlus size={16} color="#111" />
        )}
      </Button>
    );
  };

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
              onPress={() => router.setParams({ tab: key })}
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
            {contacts.search.isLoading && <ContactListSkeleton count={2} />}
            {query.trim().length >= 4 &&
              !contacts.search.isLoading &&
              searchResults.length === 0 && (
                <Text style={{ fontSize: 13, color: "#8e8e93" }}>{t("No users found")}</Text>
              )}
            <GroupedList>
              {searchResults.map((u) => (
                <GroupedRow key={u.id}>
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
                </GroupedRow>
              ))}
            </GroupedList>
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
                <GroupedList>
                  {section.rows.map((row) => {
                    const profile = row.profile;
                    if (!profile) return null;
                    return (
                      <GroupedRow key={profile.id}>
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
                          <Button
                            size="sm"
                            isIconOnly
                            isDisabled={isBusy}
                            accessibilityLabel={`${t("Respond to friend request")}: ${profile.name}`}
                            testID="respond-friend-request-btn"
                            onPress={() =>
                              openUserActions(profile, "incoming", "respond_friend_request")
                            }
                          >
                            <UserRoundCheck size={16} color="#fff" />
                          </Button>
                        ) : null}
                        <Pressable
                          onPress={() =>
                            openUserActions(
                              profile,
                              section.key === "received" ? "incoming" : "outgoing",
                            )
                          }
                          hitSlop={8}
                          accessibilityLabel={t("Actions")}
                          style={{ padding: 6 }}
                        >
                          <MoreVertical size={18} color="#333" />
                        </Pressable>
                      </GroupedRow>
                    );
                  })}
                </GroupedList>
              </View>
            ))}
          </View>
        )}

        {tab === "suggestions" && (
          <View style={{ gap: 8 }}>
            {(contacts.suggestions.isLoading ||
              syncingContacts ||
              contactsPermission === "checking") && <ContactListSkeleton count={3} />}
            {!contacts.suggestions.isLoading &&
              !syncingContacts &&
              contactsPermission !== "checking" &&
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
              !syncingContacts &&
              contactsPermission === "granted" &&
              suggestions.length === 0 && (
                <Text className="text-sm text-muted">
                  {hasContacts
                    ? t("No friends from your contacts are on Board Game Organizer yet.")
                    : t("No contacts found in your address book.")}
                </Text>
              )}
            <GroupedList>
              {visibleSuggestions.map((u) => (
                <GroupedRow key={u.id}>
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
                </GroupedRow>
              ))}
            </GroupedList>
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
            <GroupedList>
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
                  <GroupedRow key={profile.id}>
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
                  </GroupedRow>
                );
              })}
            </GroupedList>
          </View>
        )}
      </ScrollView>

      <UserActionsSheet
        visible={menuUser !== null}
        user={menuUser}
        busy={isBusy}
        canSendFriendRequest={menuUser !== null && canSendFriendRequest(menuUser)}
        friendRequest={menuFriendRequest}
        initialConfirmAction={initialConfirmAction}
        onClose={closeUserActions}
        onAction={(key) => (menuUser ? handleUserAction(menuUser)(key) : Promise.resolve())}
      />
    </View>
  );
}
