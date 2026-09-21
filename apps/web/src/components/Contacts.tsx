"use client";

import {
  type ContactUser,
  reportPresence,
  resolveApiUrl,
  useContacts,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button, Card, Chip, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserMinus, UserPlus, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { InviteCard } from "@/components/InviteCard";
import { type UserActionKey, UserMenu } from "@/components/UserMenu";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

// NEXT_PUBLIC_* reads are only inlined by Next.js in project files, so the
// bypass must be read here and passed down to the shared API helpers.
function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

type TabKey =
  | "following"
  | "followers"
  | "friends"
  | "requests"
  | "blocked"
  | "suggestions"
  | "search";

function ContactCard({
  name,
  email,
  avatarUrl,
  online,
  action,
  menu,
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  online: boolean;
  action?: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar size="md" color="accent">
            <Avatar.Image src={avatarUrl ?? undefined} alt={name} />
            <Avatar.Fallback>{name?.charAt(0) ?? "?"}</Avatar.Fallback>
          </Avatar>
          <span
            className={`absolute -right-0.5 -top-0.5 block h-2.5 w-2.5 rounded-full border-2 border-white ${
              online ? "bg-green-500" : "bg-gray-300"
            }`}
            title={online ? "online" : "offline"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          {email ? <p className="truncate text-sm text-default-500">{email}</p> : null}
        </div>
      </div>
      {action || menu ? (
        <div className="flex shrink-0 items-center justify-end gap-1 self-end sm:self-auto">
          {action}
          {menu}
        </div>
      ) : null}
    </Card>
  );
}

/** Placeholder shown while a contact list is loading. */
function ContactListSkeleton({ count = 4 }: { count?: number }) {
  const keys = Array.from({ length: count }, (_, i) => `sk-${count}-${i}`);
  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <Card
          key={key}
          data-testid="contact-skeleton-row"
          className="flex w-full min-w-0 flex-row items-center gap-3 p-3"
        >
          <Skeleton animationType="pulse" className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton animationType="pulse" className="h-3 w-48 max-w-full rounded" />
            <Skeleton animationType="pulse" className="h-3 w-32 max-w-full rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function Contacts() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { t } = useLingui();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("following");
  const [query, setQuery] = useState("");
  const [confirmUnfriend, setConfirmUnfriend] = useState<ContactUser | null>(null);
  const [requestDecision, setRequestDecision] = useState<ContactUser | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    let attempts = 0;
    const obtain = () => {
      if (!active) return;
      getToken()
        .then((tok) => {
          if (!active) return;
          if (tok) {
            setToken(tok);
          } else if (attempts < 10) {
            attempts += 1;
            setTimeout(obtain, 500);
          } else {
            setToken(null);
          }
        })
        .catch(() => {
          if (active) setToken(null);
        });
    };
    obtain();
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  // Presence heartbeat: keep the green-dot fresh while the tab is open.
  // Uses a fresh session token each beat so the JWT rotation never 401s.
  useEffect(() => {
    if (!token) return;
    const heartbeat = () => {
      getToken()
        .then((tok) => {
          if (tok) reportPresence(apiUrl(), tok, "online", protectionBypass()).catch(() => {});
        })
        .catch(() => {});
    };
    heartbeat();
    const interval = setInterval(heartbeat, 60_000);
    return () => clearInterval(interval);
  }, [token, getToken]);

  const contacts = useContacts(
    apiUrl(),
    token,
    getToken,
    protectionBypass(),
    userId,
    mutationFeedback,
  );
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
  const actionFailed =
    contacts.follow.isError ||
    contacts.unfollow.isError ||
    contacts.unfriend.isError ||
    contacts.friendRequest.isError ||
    contacts.cancelFriendRequest.isError ||
    contacts.acceptFriendRequest.isError ||
    contacts.rejectFriendRequest.isError ||
    contacts.block.isError ||
    contacts.unblock.isError;

  const handleUserAction = (user: ContactUser) => (key: UserActionKey) => {
    const variables = { targetUserId: user.id, targetUser: user };
    if (key === "follow") contacts.follow.mutate(variables);
    else if (key === "unfollow") contacts.unfollow.mutate(variables);
    else if (key === "unfriend") contacts.unfriend.mutate(variables);
    else if (key === "friend_request") contacts.friendRequest.mutate(variables);
    else if (key === "cancel_friend_request") contacts.cancelFriendRequest.mutate(variables);
    else if (key === "accept_friend_request") contacts.acceptFriendRequest.mutate(variables);
    else if (key === "reject_friend_request") contacts.rejectFriendRequest.mutate(variables);
    else if (key === "block") contacts.block.mutate(variables);
    else if (key === "unblock") contacts.unblock.mutate(variables);
    // profile: not implemented yet — no-op.
  };

  // Auto-search on input: fires 300ms after the user stops typing, only when
  // at least 4 characters are present (min prefix length per product spec).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 4) {
      debounceRef.current = null;
      return;
    }
    debounceRef.current = setTimeout(() => {
      // If the session token is not ready yet (Clerk client still booting),
      // skip: the token effect below re-runs the pending search once the
      // token arrives, so the search is never silently lost.
      if (!token) return;
      contacts.runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [contacts.runSearch, query, token]);

  const followingRows = contacts.following.data ?? [];
  // Ids the viewer follows — used by the Followers tab to render the right
  // icon (server-side isFollowing is always false for follower rows).
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
  const canSendFriendRequest = (user: ContactUser) =>
    friendRequestsLoaded &&
    !user.isFriend &&
    !user.blockedByMe &&
    !user.blockedMe &&
    !pendingRequestIds.has(user.id) &&
    !sentRequestIds.has(user.id);
  const relationshipActions = (user: ContactUser) => {
    if (user.blockedByMe || user.blockedMe) return undefined;
    if (user.isFriend) {
      return (
        <Button
          isIconOnly
          size="sm"
          variant="danger-soft"
          isDisabled={isBusy}
          aria-label={`${t`Remove friend`}: ${user.name}`}
          onPress={() => setConfirmUnfriend(user)}
        >
          <UserRoundX className="h-4 w-4" />
        </Button>
      );
    }
    return (
      <Button
        isIconOnly
        size="sm"
        variant="outline"
        isDisabled={isBusy}
        aria-label={user.isFollowing ? t`Unfollow` : t`Follow`}
        onPress={() => handleUserAction(user)(user.isFollowing ? "unfollow" : "follow")}
      >
        {user.isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      </Button>
    );
  };
  const blockedRows = contacts.blocked.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const hasContacts = contacts.suggestions.data?.hasContacts ?? false;
  const searchResults = contacts.search.data?.users ?? [];

  // List tabs: which query feeds each tab, plus the empty-state copy.
  const listTabs: Array<{
    key: TabKey;
    label: string;
    rows: typeof followingRows;
    isLoading: boolean;
    isError: boolean;
    empty: string;
  }> = [
    {
      key: "following",
      label: t`Following`,
      rows: followingRows,
      isLoading: contacts.following.isLoading,
      isError: contacts.following.isError,
      empty: t`You are not following anyone yet`,
    },
    {
      key: "followers",
      label: t`Followers`,
      rows: followersRows,
      isLoading: contacts.followers.isLoading,
      isError: contacts.followers.isError,
      empty: t`No followers yet`,
    },
    {
      key: "friends",
      label: t`Friends`,
      rows: friendsRows,
      isLoading: contacts.friends.isLoading,
      isError: contacts.friends.isError,
      empty: t`No friends yet`,
    },
    {
      key: "blocked",
      label: t`Blocked`,
      rows: blockedRows,
      isLoading: contacts.blocked.isLoading,
      isError: contacts.blocked.isError,
      empty: t`No blocked users`,
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <InviteCard apiUrl={apiUrl()} protectionBypass={protectionBypass()} />

      {actionFailed ? (
        <p role="alert" className="text-sm text-danger">
          {t`Could not complete the action. Try again.`}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["following", t`Following`],
            ["followers", t`Followers`],
            ["friends", t`Friends`],
            ["requests", t`Friend requests`],
            ["blocked", t`Blocked`],
            ["suggestions", t`Suggestions`],
            ["search", t`Search`],
          ] as Array<[TabKey, string]>
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "primary" : "outline"}
            onPress={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "search" && (
        <div className="space-y-3">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t`Search users (at least 4 characters)`}
              aria-label={t`Search users by name or email`}
              className="w-full rounded-lg border border-default-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {query.length > 0 && (
              <button
                type="button"
                aria-label={t`Clear search`}
                onClick={() => {
                  setQuery("");
                  contacts.runSearch("");
                }}
                className="absolute inset-y-0 right-2 flex items-center text-default-400 hover:text-default-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {query.trim().length > 0 && query.trim().length < 4 && (
            <p className="text-sm text-default-500">{t`Type at least 4 characters to search`}</p>
          )}
          {contacts.search.isLoading && <ContactListSkeleton count={2} />}
          {query.trim().length >= 4 && !contacts.search.isLoading && searchResults.length === 0 && (
            <p className="text-sm text-default-500">{t`No users found`}</p>
          )}
          <div className="space-y-2">
            {searchResults.map((u) => (
              <ContactCard
                key={u.id}
                name={u.name}
                email={u.email}
                avatarUrl={u.avatarUrl}
                online={u.presence.online}
                action={relationshipActions(u)}
                menu={
                  <UserMenu
                    user={u}
                    busy={isBusy}
                    canSendFriendRequest={canSendFriendRequest(u)}
                    onAction={handleUserAction(u)}
                  />
                }
              />
            ))}
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-5">
          {[
            {
              key: "received",
              label: t`Received`,
              rows: pendingRows,
              isLoading: contacts.pending.isLoading,
              isError: contacts.pending.isError,
              empty: t`No received friend requests`,
            },
            {
              key: "sent",
              label: t`Sent`,
              rows: sentRows,
              isLoading: contacts.sent.isLoading,
              isError: contacts.sent.isError,
              empty: t`No sent friend requests`,
            },
          ].map((section) => (
            <section
              className="space-y-2"
              key={section.key}
              aria-labelledby={`${section.key}-title`}
            >
              <h2 id={`${section.key}-title`} className="text-sm font-semibold">
                {section.label}
              </h2>
              {section.isLoading && <ContactListSkeleton count={2} />}
              {section.isError && (
                <p role="alert" className="text-sm text-danger">
                  {t`Could not load friend requests`}
                </p>
              )}
              {!section.isLoading && !section.isError && section.rows.length === 0 && (
                <p className="text-sm text-default-500">{section.empty}</p>
              )}
              {section.rows.map((row) => {
                const profile = row.profile;
                if (!profile) return null;
                return (
                  <ContactCard
                    key={profile.id}
                    name={profile.name}
                    email={profile.email}
                    avatarUrl={profile.avatarUrl}
                    online={profile.presence.online}
                    action={
                      section.key === "received" ? (
                        <Button
                          isIconOnly
                          size="sm"
                          isDisabled={isBusy}
                          aria-label={`${t`Respond to friend request`}: ${profile.name}`}
                          onPress={() => setRequestDecision(profile)}
                        >
                          <UserRoundCheck className="h-4 w-4" />
                        </Button>
                      ) : undefined
                    }
                    menu={
                      <UserMenu
                        user={profile}
                        busy={isBusy}
                        friendRequest={section.key === "received" ? "incoming" : "outgoing"}
                        onAction={handleUserAction(profile)}
                      />
                    }
                  />
                );
              })}
            </section>
          ))}
        </div>
      )}

      {tab === "suggestions" && (
        <div className="space-y-2">
          {contacts.suggestions.isLoading && <ContactListSkeleton count={3} />}
          {suggestions.length === 0 && !contacts.suggestions.isLoading && (
            <p className="text-sm text-default-500">
              {hasContacts
                ? t`No friends from your contacts are on Board Game Organizer yet.`
                : t`Sync your address book from the mobile app to see friend suggestions here.`}
            </p>
          )}
          {suggestions.map((u) => (
            <ContactCard
              key={u.id}
              name={u.name}
              email={u.email}
              avatarUrl={u.avatarUrl}
              online={u.presence.online}
              action={relationshipActions(u)}
              menu={
                <UserMenu
                  user={u}
                  busy={isBusy}
                  canSendFriendRequest={canSendFriendRequest(u)}
                  onAction={handleUserAction(u)}
                />
              }
            />
          ))}
        </div>
      )}

      {listTabs.some((t) => t.key === tab) &&
        listTabs
          .filter((t) => t.key === tab)
          .map((listTab) => (
            <div className="space-y-2" key={listTab.key}>
              {listTab.isLoading && <ContactListSkeleton count={4} />}
              {listTab.isError && (
                <p role="alert" className="text-sm text-danger">
                  {listTab.key === "friends"
                    ? t`Could not load friends`
                    : t`Could not load contacts`}
                </p>
              )}
              {listTab.rows.length === 0 && !listTab.isLoading && !listTab.isError && (
                <p className="text-sm text-default-500">{listTab.empty}</p>
              )}
              {listTab.rows.map((row) => {
                const profile = row.profile;
                if (!profile) return null;
                const actionUser =
                  listTab.key === "following"
                    ? { ...profile, isFollowing: true }
                    : listTab.key === "followers"
                      ? { ...profile, isFollowing: followingIds.has(profile.id) }
                      : profile;
                return (
                  <ContactCard
                    key={profile.id}
                    name={profile.name}
                    email={profile.email}
                    avatarUrl={profile.avatarUrl}
                    online={profile.presence.online}
                    action={listTab.key === "blocked" ? undefined : relationshipActions(actionUser)}
                    menu={
                      <UserMenu
                        user={actionUser}
                        busy={isBusy}
                        canSendFriendRequest={canSendFriendRequest(actionUser)}
                        onAction={handleUserAction(actionUser)}
                      />
                    }
                  />
                );
              })}
            </div>
          ))}

      {!isSignedIn && (
        <Chip color="warning" variant="soft">
          {t`Sign in to see your contacts`}
        </Chip>
      )}

      {confirmUnfriend && (
        <ContactConfirmDialog
          title={t`Remove friend?`}
          description={t`The friendship and your follow will be removed.`}
          busy={isBusy}
          onCancel={() => setConfirmUnfriend(null)}
          actions={[
            {
              label: t`Remove friend`,
              variant: "danger",
              onPress: () => {
                handleUserAction(confirmUnfriend)("unfriend");
                setConfirmUnfriend(null);
              },
            },
          ]}
        />
      )}

      {requestDecision && (
        <ContactConfirmDialog
          title={t`Respond to friend request`}
          description={t`Accept or decline this friend request.`}
          busy={isBusy}
          onCancel={() => setRequestDecision(null)}
          actions={[
            {
              label: t`Decline`,
              variant: "danger",
              onPress: () => {
                handleUserAction(requestDecision)("reject_friend_request");
                setRequestDecision(null);
              },
            },
            {
              label: t`Accept`,
              onPress: () => {
                handleUserAction(requestDecision)("accept_friend_request");
                setRequestDecision(null);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
