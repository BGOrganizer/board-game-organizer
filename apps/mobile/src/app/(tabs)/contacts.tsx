import {
  type ContactUser,
  contactConnections,
  reportPresence,
  resolveApiUrl,
  type SyncedContactIdentifiers,
  useContacts,
  useInvites,
} from "@board-game-organizer/shared";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { BookUser, MoreVertical, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { type UserActionConfirmation, UserActionsSheet } from "@/components/UserActionsSheet";
import { type ContactTab, contactSyncPayload, contactTab } from "@/lib/contacts";
import { useT } from "@/lib/i18n";
import { unregisteredContacts } from "@/lib/unregisteredContacts";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import type { FriendRequestContext, UserActionKey } from "@/lib/user-actions";
import { useSessionAuth } from "@/lib/useSessionAuth";

const CONTACT_SCAN_PAGE_SIZE = 200;
const CONTACT_LIST_PAGE_SIZE = 40;

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
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
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
  const [unregistered, setUnregistered] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingDevicePage, setLoadingDevicePage] = useState(false);
  const [hasMoreDeviceContacts, setHasMoreDeviceContacts] = useState(false);
  const [contactsReadError, setContactsReadError] = useState(false);
  const [contactsPermission, setContactsPermission] = useState<
    "checking" | "undetermined" | "granted" | "denied"
  >("checking");
  const [syncingContacts, setSyncingContacts] = useState(false);
  const contactsSyncRef = useRef<Promise<void> | null>(null);
  const devicePageRef = useRef<Promise<void> | null>(null);
  const deviceOffsetRef = useRef(0);
  const deviceHasMoreRef = useRef(false);
  const deviceGenerationRef = useRef(0);
  const deviceMatchesRef = useRef<{
    submitted: SyncedContactIdentifiers;
    registered: SyncedContactIdentifiers;
  } | null>(null);
  const contactsPromptShownRef = useRef(false);
  const initialSyncRef = useRef(false);
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
  const invite = useInvites({ apiUrl: apiUrl(), token, getToken, feedback: mutationFeedback });
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

  // Device address book: on entry to Contacts (or via the Search tab CTA)
  // we show a confirmation dialog before the native permission request. Only if the user
  // taps "Yes" does the real Android/iOS permission dialog fire. If the user
  // declines twice the system stops asking (canAskAgain=false) and we open
  // the app settings instead. The CTA stays tappable until consent is given.
  // With consent matched users are persisted through POST /api/contacts/sync;
  // unmatched names are kept in memory only, never persisted.
  const syncContactsMutation = contacts.syncContacts.mutateAsync;
  const loadDevicePage = useCallback(() => {
    if (!deviceHasMoreRef.current || !deviceMatchesRef.current || devicePageRef.current) {
      return devicePageRef.current ?? Promise.resolve();
    }
    const generation = deviceGenerationRef.current;
    const matches = deviceMatchesRef.current;
    const task = (async () => {
      setLoadingDevicePage(true);
      try {
        // Skip pages without eligible contacts; otherwise an empty first page
        // would never give the user a scroll event to request the next page.
        while (deviceHasMoreRef.current) {
          const page = await Contacts.Contact.getAllDetails(
            [
              Contacts.ContactField.FULL_NAME,
              Contacts.ContactField.EMAILS,
              Contacts.ContactField.PHONES,
            ],
            {
              limit: CONTACT_LIST_PAGE_SIZE,
              offset: deviceOffsetRef.current,
              sortOrder: Contacts.ContactsSortOrder.GivenName,
            },
          );
          if (generation !== deviceGenerationRef.current) return;
          deviceOffsetRef.current += page.length;
          deviceHasMoreRef.current = page.length === CONTACT_LIST_PAGE_SIZE;
          setHasMoreDeviceContacts(deviceHasMoreRef.current);
          const next = unregisteredContacts(page, matches.submitted, matches.registered);
          if (next.length) setUnregistered((current) => [...current, ...next]);
          if (next.length || !deviceHasMoreRef.current) break;
        }
      } catch (error) {
        if (generation !== deviceGenerationRef.current) return;
        Sentry.captureException(error, { tags: { operation: "contacts.page" } });
        setContactsReadError(true);
        deviceHasMoreRef.current = false;
        setHasMoreDeviceContacts(false);
      } finally {
        if (generation === deviceGenerationRef.current) setLoadingDevicePage(false);
        devicePageRef.current = null;
      }
    })();
    devicePageRef.current = task;
    return task;
  }, []);

  const syncContactsData = useCallback(
    (showFeedback = true) => {
      if (!token) return Promise.resolve();
      if (contactsSyncRef.current) return contactsSyncRef.current;
      initialSyncRef.current = true;
      const generation = ++deviceGenerationRef.current;
      deviceHasMoreRef.current = false;
      deviceMatchesRef.current = null;
      setUnregistered([]);
      setHasMoreDeviceContacts(false);
      setLoadingDevicePage(false);

      const sync = (async () => {
        setSyncingContacts(true);
        setContactsReadError(false);
        let stage = "read";
        try {
          if (devicePageRef.current) await devicePageRef.current;
          const emails = new Set<string>();
          const phoneNumbers = new Set<string>();
          let offset = 0;
          while (true) {
            const page = await Contacts.Contact.getAllDetails(
              [Contacts.ContactField.EMAILS, Contacts.ContactField.PHONES],
              {
                limit: CONTACT_SCAN_PAGE_SIZE,
                offset,
                sortOrder: Contacts.ContactsSortOrder.GivenName,
              },
            );
            if (generation !== deviceGenerationRef.current) return;
            const identifiers = contactSyncPayload(page);
            for (const email of identifiers.emails) {
              if (emails.size < 1000) emails.add(email);
            }
            for (const phone of identifiers.phoneNumbers) {
              if (phoneNumbers.size < 1000) phoneNumbers.add(phone);
            }
            offset += page.length;
            if (page.length < CONTACT_SCAN_PAGE_SIZE) break;
          }
          const submitted = { emails: [...emails], phoneNumbers: [...phoneNumbers] };
          stage = "request";
          const synced = await syncContactsMutation({ ...submitted, silent: !showFeedback });
          if (generation !== deviceGenerationRef.current) return;
          deviceMatchesRef.current = { submitted, registered: synced.registeredIdentifiers };
          deviceOffsetRef.current = 0;
          deviceHasMoreRef.current = true;
          setHasMoreDeviceContacts(true);
          await loadDevicePage();
        } catch (error) {
          if (generation !== deviceGenerationRef.current) return;
          Sentry.captureException(error, { tags: { operation: "contacts.sync", stage } });
          setContactsReadError(stage === "read");
          if (stage === "read" && showFeedback) {
            mutationFeedback.onError?.(
              error instanceof Error ? error : new Error("Could not read contacts"),
              "sync_contacts",
            );
          }
        } finally {
          if (generation === deviceGenerationRef.current) setSyncingContacts(false);
          contactsSyncRef.current = null;
        }
      })();
      contactsSyncRef.current = sync;
      return sync;
    },
    [loadDevicePage, mutationFeedback, syncContactsMutation, token],
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
          deviceGenerationRef.current += 1;
          deviceHasMoreRef.current = false;
          deviceMatchesRef.current = null;
          setUnregistered([]);
          setHasMoreDeviceContacts(false);
          setLoadingDevicePage(false);
          setContactsReadError(false);
          initialSyncRef.current = false;
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

  // Ask on entry to Contacts, never show an unprompted system permission dialog.
  useEffect(() => {
    if (contactsPermission !== "undetermined" || contactsPromptShownRef.current) {
      return;
    }
    contactsPromptShownRef.current = true;
    confirmAndRequestContacts();
  }, [confirmAndRequestContacts, contactsPermission]);

  // Restore the in-memory invite list when permission was granted earlier.
  useEffect(() => {
    if (contactsPermission !== "granted" || !token || initialSyncRef.current) return;
    initialSyncRef.current = true;
    void syncContactsData(false);
  }, [contactsPermission, syncContactsData, token]);

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
  const searchResults = contacts.search.data?.users ?? [];
  const searchRows = [
    ...searchResults.map((user) => ({ kind: "user" as const, id: `user:${user.id}`, user })),
    { kind: "device-header" as const, id: "device-header" },
    ...unregistered.map((contact) => ({
      kind: "device" as const,
      id: `device:${contact.id}`,
      contact,
    })),
  ];

  const connections = contactConnections(
    friendsRows,
    followingRows,
    followersRows,
    visibleSuggestions,
  );
  const connectionLabels = {
    friends: t("Friends"),
    following: t("Following"),
    followers: t("Followers"),
    device: t("Contacts on BGO"),
  };
  const connectionQueries = {
    friends: contacts.friends,
    following: contacts.following,
    followers: contacts.followers,
    device: contacts.suggestions,
  };
  const canSendFriendRequest = (user: ContactUser) =>
    friendRequestsLoaded &&
    !user.isFriend &&
    !user.blockedByMe &&
    !user.blockedMe &&
    !pendingRequestIds.has(user.id) &&
    !sentRequestIds.has(user.id);
  const contactRow = (user: ContactUser, friendRequest?: FriendRequestContext) => (
    <GroupedRow key={user.id}>
      <AvatarWithPresence
        name={user.name}
        avatarUrl={user.avatarUrl}
        online={user.presence.online}
      />
      <View style={{ flex: 1 }}>
        <Typography className="font-medium text-foreground" numberOfLines={1}>
          {user.name}
        </Typography>
        {user.email ? (
          <Typography className="text-sm text-muted" numberOfLines={1}>
            {user.email}
          </Typography>
        ) : null}
      </View>
      <Pressable
        onPress={() =>
          openUserActions(
            user,
            friendRequest ??
              (pendingRequestIds.has(user.id)
                ? "incoming"
                : sentRequestIds.has(user.id)
                  ? "outgoing"
                  : undefined),
          )
        }
        hitSlop={8}
        accessibilityLabel={`${t("Actions")}: ${user.name}`}
        style={{ padding: 6 }}
      >
        <MoreVertical size={18} color="#333" />
      </Pressable>
    </GroupedRow>
  );

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Tabs
        style={{ flex: 1 }}
        value={tab}
        onValueChange={(value) => router.setParams({ tab: value as ContactTab })}
        variant="primary"
      >
        <Tabs.List>
          <Tabs.Indicator />
          <Tabs.Trigger value="connections" style={{ flex: 1 }}>
            <Tabs.Label>{t("Connections")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="requests" style={{ flex: 1 }}>
            <Tabs.Label>{t("Requests")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="search" style={{ flex: 1 }}>
            <Tabs.Label>{t("Search")}</Tabs.Label>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="search" style={{ flex: 1, marginTop: 12 }}>
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            data={searchRows}
            keyExtractor={(row) => row.id}
            onEndReached={() => void loadDevicePage()}
            onEndReachedThreshold={0.5}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            ListFooterComponent={loadingDevicePage ? <ContactListSkeleton count={2} /> : null}
            ListHeaderComponent={
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
                  {contactsPermission !== "granted" && contactsPermission !== "checking" ? (
                    <Button
                      isIconOnly
                      variant="outline"
                      accessibilityLabel={t("Add contacts")}
                      onPress={confirmAndRequestContacts}
                      testID="enable-contacts-btn"
                    >
                      <BookUser size={18} color="#111" />
                    </Button>
                  ) : null}
                </View>
                {query.trim().length > 0 && query.trim().length < 4 && (
                  <Typography style={{ fontSize: 13, color: "#8e8e93" }}>
                    {t("Type at least 4 characters to search")}
                  </Typography>
                )}
                {contacts.search.isLoading && <ContactListSkeleton count={2} />}
                {query.trim().length >= 4 &&
                  !contacts.search.isLoading &&
                  !contacts.search.isError &&
                  searchResults.length === 0 && (
                    <Typography style={{ fontSize: 13, color: "#8e8e93" }}>
                      {t("No users found")}
                    </Typography>
                  )}
                {contacts.search.isError ? (
                  <Typography className="text-danger">{t("Could not load contacts")}</Typography>
                ) : null}
              </View>
            }
            renderItem={({ item }) => {
              if (item.kind === "user") {
                return <GroupedList>{contactRow(item.user)}</GroupedList>;
              }
              if (item.kind === "device-header") {
                return (
                  <View style={{ gap: 8 }}>
                    <Typography className="font-semibold text-foreground">
                      {t("Invite device contacts")}
                    </Typography>
                    {contactsPermission === "checking" || syncingContacts ? (
                      <ContactListSkeleton count={2} />
                    ) : null}
                    {contactsPermission !== "granted" && contactsPermission !== "checking" ? (
                      <Typography className="text-muted">
                        {t("Allow address book access to find your friends here.")}
                      </Typography>
                    ) : null}
                    {contactsPermission === "granted" &&
                    (contacts.syncContacts.isError || contactsReadError) ? (
                      <Button variant="outline" onPress={() => void syncContactsData()}>
                        <Typography>{t("Could not synchronize contacts. Retry")}</Typography>
                      </Button>
                    ) : null}
                    {contactsPermission === "granted" &&
                    !syncingContacts &&
                    !contacts.syncContacts.isError &&
                    !contactsReadError &&
                    !loadingDevicePage &&
                    !hasMoreDeviceContacts &&
                    unregistered.length === 0 ? (
                      <Typography className="text-muted">{t("No contacts to invite")}</Typography>
                    ) : null}
                    {invite.isError ? (
                      <Typography className="text-danger">
                        {t("Could not create the invite. Try again.")}
                      </Typography>
                    ) : null}
                  </View>
                );
              }
              const contact = item.contact;
              return (
                <GroupedList>
                  <GroupedRow>
                    <Avatar size="md">
                      <Avatar.Fallback>{contact.name.charAt(0).toUpperCase()}</Avatar.Fallback>
                    </Avatar>
                    <Typography
                      className="font-medium text-foreground"
                      style={{ flex: 1 }}
                      numberOfLines={1}
                    >
                      {contact.name}
                    </Typography>
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={invite.isPending}
                      accessibilityLabel={`${t("Send invite")}: ${contact.name}`}
                      onPress={() =>
                        invite.mutate(undefined, {
                          onSuccess: (created) => {
                            void Share.share({ message: created.link }).catch(() => {});
                          },
                        })
                      }
                    >
                      <Typography>{t("Send")}</Typography>
                    </Button>
                  </GroupedRow>
                </GroupedList>
              );
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="requests" style={{ flex: 1, marginTop: 12 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 20, paddingBottom: 24 }}>
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
                <Typography className="font-semibold text-foreground">{section.label}</Typography>
                {section.isLoading && <ContactListSkeleton count={2} />}
                {section.isError && (
                  <Typography accessibilityRole="alert" className="text-sm text-danger">
                    {t("Could not load friend requests")}
                  </Typography>
                )}
                {!section.isLoading && !section.isError && section.rows.length === 0 && (
                  <Typography className="text-sm text-muted">{section.empty}</Typography>
                )}
                <GroupedList>
                  {section.rows.map((row) =>
                    row.profile
                      ? contactRow(
                          row.profile,
                          section.key === "received" ? "incoming" : "outgoing",
                        )
                      : null,
                  )}
                </GroupedList>
              </View>
            ))}
            <View style={{ gap: 8, marginTop: 20 }}>
              <Typography className="font-semibold text-foreground">{t("Blocked")}</Typography>
              {contacts.blocked.isLoading ? <ContactListSkeleton count={2} /> : null}
              {contacts.blocked.isError ? (
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load contacts")}
                </Typography>
              ) : null}
              {!contacts.blocked.isLoading &&
              !contacts.blocked.isError &&
              blockedRows.length === 0 ? (
                <Typography className="text-muted">{t("No blocked users")}</Typography>
              ) : null}
              <GroupedList>
                {blockedRows.map((row) => (row.profile ? contactRow(row.profile) : null))}
              </GroupedList>
            </View>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="connections" style={{ flex: 1, marginTop: 12 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 20, paddingBottom: 24 }}>
            {connections.map((section) => {
              const state = connectionQueries[section.key];
              if (!section.users.length && !state.isLoading && !state.isError) return null;
              return (
                <View key={section.key} style={{ gap: 8 }}>
                  <Typography className="font-semibold text-foreground">
                    {connectionLabels[section.key]}
                  </Typography>
                  {state.isLoading ? <ContactListSkeleton count={2} /> : null}
                  {state.isError ? (
                    <Typography accessibilityRole="alert" className="text-danger">
                      {t("Could not load contacts")}
                    </Typography>
                  ) : null}
                  <GroupedList>{section.users.map((user) => contactRow(user))}</GroupedList>
                </View>
              );
            })}
            {syncingContacts || contactsPermission === "checking" ? (
              <ContactListSkeleton count={2} />
            ) : null}
            {contactsPermission === "granted" &&
            (contactsReadError || contacts.syncContacts.isError) ? (
              <Button variant="outline" onPress={() => void syncContactsData()}>
                <Typography>{t("Could not synchronize contacts. Retry")}</Typography>
              </Button>
            ) : null}
            {connections.every((section) => section.users.length === 0) &&
            !syncingContacts &&
            !contactsReadError &&
            !contacts.syncContacts.isError &&
            contactsPermission !== "checking" &&
            !Object.values(connectionQueries).some((state) => state.isLoading || state.isError) ? (
              <Typography className="text-muted">{t("No connections yet")}</Typography>
            ) : null}
          </ScrollView>
        </Tabs.Content>
      </Tabs>

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
