"use client";

import {
  type ContactUser,
  contactConnections,
  reportPresence,
  resolveApiUrl,
  useContacts,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Card, Chip, SearchField, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BookUser,
  Mail,
  Search,
  SearchX,
  Send,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { ContactLegend } from "@/components/contacts/ContactLegend";
import { type UserActionKey, UserMenu } from "@/components/contacts/UserMenu";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

// NEXT_PUBLIC_* reads are only inlined by Next.js in project files, so the
// bypass must be read here and passed down to the shared API helpers.
function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

function ContactCard({
  name,
  email,
  avatarUrl,
  online,
  menu,
  badge,
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  online: boolean;
  menu?: React.ReactNode;
  badge?: { icon: LucideIcon; label: string; color: string };
}) {
  const BadgeIcon = badge?.icon;
  return (
    <GroupedRow className="flex-col sm:flex-row sm:items-center">
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
          {badge && BadgeIcon ? (
            <span
              role="img"
              aria-label={badge.label}
              className={`absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-surface ${badge.color}`}
            >
              <BadgeIcon className="size-3" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          {email ? <p className="truncate text-sm text-default-500">{email}</p> : null}
        </div>
      </div>
      {menu ? (
        <div className="flex shrink-0 items-center justify-end self-end sm:self-auto">{menu}</div>
      ) : null}
    </GroupedRow>
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
  const [query, setQuery] = useState("");
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
  const connectionPages = [
    contacts.friends,
    contacts.following,
    contacts.followers,
    contacts.blocked,
  ];
  const nextConnectionPage = connectionPages.find((page) => page.hasNextPage);
  const requestPages = [contacts.pending, contacts.sent];
  const nextRequestPage = requestPages.find((page) => page.hasNextPage);
  const endRefs = {
    connections: useInfiniteScroll({
      hasNextPage: Boolean(nextConnectionPage),
      isFetchingNextPage: nextConnectionPage?.isFetchingNextPage,
      isFetchNextPageError: nextConnectionPage?.isFetchNextPageError,
      fetchNextPage: () => nextConnectionPage?.fetchNextPage() ?? Promise.resolve(),
    }),
    requests: useInfiniteScroll({
      hasNextPage: Boolean(nextRequestPage),
      isFetchingNextPage: nextRequestPage?.isFetchingNextPage,
      isFetchNextPageError: nextRequestPage?.isFetchNextPageError,
      fetchNextPage: () => nextRequestPage?.fetchNextPage() ?? Promise.resolve(),
    }),
    suggestions: useInfiniteScroll({
      ...contacts.suggestions,
      fetchNextPage: () => contacts.suggestions.fetchNextPage(),
    }),
  };
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

  const blockedRows = contacts.blocked.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const searchResults = contacts.search.data?.users ?? [];

  const connections = contactConnections(
    friendsRows,
    followingRows,
    followersRows,
    suggestions,
    blockedRows,
  );
  const bgoContacts = connections.find((section) => section.key === "device")?.users ?? [];
  const connectionLabels = {
    friends: t`Friends`,
    following: t`Following`,
    followers: t`Followers`,
    blocked: t`Blocked`,
  };
  const connectionDescriptions = {
    friends: t`Friendship accepted.`,
    following: t`People you follow.`,
    followers: t`People who follow you.`,
    blocked: t`People you have blocked.`,
  };
  const connectionIcons = {
    friends: UsersRound,
    following: UserRoundPlus,
    followers: UserRoundCheck,
    blocked: Ban,
  };
  const connectionColors = {
    friends: "text-primary",
    following: "text-warning",
    followers: "text-success",
    blocked: "text-danger",
  };
  const contactCard = (
    user: ContactUser,
    friendRequest?: "incoming" | "outgoing",
    badge?: { icon: LucideIcon; label: string; color: string },
  ) => (
    <ContactCard
      key={`${friendRequest ?? "contact"}-${user.id}`}
      name={user.name}
      email={user.email}
      avatarUrl={user.avatarUrl}
      online={user.presence.online}
      badge={badge}
      menu={
        <UserMenu
          user={user}
          busy={isBusy}
          canSendFriendRequest={canSendFriendRequest(user)}
          friendRequest={
            friendRequest ??
            (pendingRequestIds.has(user.id)
              ? "incoming"
              : sentRequestIds.has(user.id)
                ? "outgoing"
                : undefined)
          }
          onAction={handleUserAction(user)}
        />
      }
    />
  );

  return (
    <div className="min-w-0 space-y-4">
      {actionFailed ? (
        <p role="alert" className="text-sm text-danger">
          {t`Could not complete the action. Try again.`}
        </p>
      ) : null}

      <Tabs aria-label={t`Contacts`} defaultSelectedKey="connections">
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="connections">
              {t`Connections`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="requests">
              {t`Requests`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="search">
              {t`Search`}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="search" className="space-y-3 pt-4">
          <SearchField
            fullWidth
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (!value) contacts.runSearch("");
            }}
          >
            <SearchHelpLabel
              label={t`Search users by name or email`}
              help={t`Type at least 4 characters to search`}
            />
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={t`Search users`} />
              <SearchField.ClearButton aria-label={t`Clear search`} />
            </SearchField.Group>
          </SearchField>

          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Search className="size-4" aria-hidden="true" />
            {t`Search results`}
          </h2>
          {query.trim().length < 4 && (
            <EmptyList icon={<Search className="size-7" />}>
              {t`Type at least 4 characters to search`}
            </EmptyList>
          )}
          {contacts.search.isLoading && <ContactListSkeleton count={2} />}
          {query.trim().length >= 4 &&
            !contacts.search.isLoading &&
            !contacts.search.isError &&
            searchResults.length === 0 && (
              <EmptyList icon={<SearchX className="size-7" />}>{t`No users found`}</EmptyList>
            )}
          {contacts.search.isError ? (
            <p role="alert" className="text-sm text-danger">{t`Could not load contacts`}</p>
          ) : null}
          <GroupedList>{searchResults.map((user) => contactCard(user))}</GroupedList>
          <section className="space-y-2" aria-labelledby="device-contacts-title">
            <h2
              id="device-contacts-title"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <BookUser className="size-4" aria-hidden="true" />
              {t`Device Contacts`}
            </h2>
            {contacts.suggestions.isLoading ? <ContactListSkeleton count={2} /> : null}
            {contacts.suggestions.isError ? (
              <p role="alert" className="text-sm text-danger">{t`Could not load contacts`}</p>
            ) : null}
            {!contacts.suggestions.isLoading &&
            !contacts.suggestions.isError &&
            bgoContacts.length === 0 ? (
              <EmptyList icon={<BookUser className="size-7" />}>
                {t`No contacts to invite`}
              </EmptyList>
            ) : null}
            <GroupedList>{bgoContacts.map((user) => contactCard(user))}</GroupedList>
            <div ref={endRefs.suggestions} aria-hidden="true" />
            {contacts.suggestions.isFetchNextPageError ? (
              <button
                type="button"
                className="text-sm text-primary"
                onClick={() => void contacts.suggestions.fetchNextPage()}
              >{t`Retry`}</button>
            ) : null}
          </section>
        </Tabs.Panel>

        <Tabs.Panel id="requests" className="space-y-3 pt-4">
          <ContactLegend
            title={t`Requests`}
            icon={Mail}
            entries={[
              {
                icon: Mail,
                label: t`Received`,
                color: "text-primary",
                description: t`Requests awaiting your reply.`,
              },
              {
                icon: Send,
                label: t`Sent`,
                color: "text-warning",
                description: t`Requests awaiting their reply.`,
              },
            ]}
          />
          {requestPages.some((page) => page.isLoading) ? <ContactListSkeleton count={2} /> : null}
          {requestPages.some((page) => page.isError) ? (
            <p role="alert" className="text-sm text-danger">{t`Could not load friend requests`}</p>
          ) : null}
          {!requestPages.some((page) => page.isLoading || page.isError) &&
          pendingRows.length === 0 &&
          sentRows.length === 0 ? (
            <EmptyList icon={<Mail className="size-7" />}>{t`No friend requests`}</EmptyList>
          ) : null}
          <GroupedList>
            {pendingRows.map((row) =>
              row.profile
                ? contactCard(row.profile, "incoming", {
                    icon: Mail,
                    label: t`Received`,
                    color: "text-primary",
                  })
                : null,
            )}
            {sentRows.map((row) =>
              row.profile
                ? contactCard(row.profile, "outgoing", {
                    icon: Send,
                    label: t`Sent`,
                    color: "text-warning",
                  })
                : null,
            )}
          </GroupedList>
          <div ref={endRefs.requests} aria-hidden="true" />
          {requestPages.some((page) => page.isFetchNextPageError) ? (
            <button
              type="button"
              className="text-sm text-primary"
              onClick={() => {
                for (const page of requestPages) {
                  if (page.isFetchNextPageError) void page.fetchNextPage();
                }
              }}
            >{t`Retry`}</button>
          ) : null}
        </Tabs.Panel>

        <Tabs.Panel id="connections" className="space-y-3 pt-4">
          <ContactLegend
            title={t`Connections`}
            icon={UsersRound}
            entries={(["friends", "following", "followers", "blocked"] as const).map((type) => ({
              icon: connectionIcons[type],
              label: connectionLabels[type],
              color: connectionColors[type],
              description: connectionDescriptions[type],
            }))}
          />
          {connectionPages.some((page) => page.isLoading) ? (
            <ContactListSkeleton count={2} />
          ) : null}
          {connectionPages.some((page) => page.isError) ? (
            <p role="alert" className="text-sm text-danger">{t`Could not load contacts`}</p>
          ) : null}
          {!connectionPages.some((page) => page.isLoading || page.isError) &&
          connections.every((section) => section.key === "device" || section.users.length === 0) ? (
            <EmptyList icon={<UsersRound className="size-7" />}>{t`No connections yet`}</EmptyList>
          ) : null}
          <GroupedList>
            {connections
              .filter((section) => section.key !== "device")
              .flatMap((section) =>
                section.users.map((user) =>
                  contactCard(user, undefined, {
                    icon: connectionIcons[section.key],
                    label: connectionLabels[section.key],
                    color: connectionColors[section.key],
                  }),
                ),
              )}
          </GroupedList>
          <div ref={endRefs.connections} aria-hidden="true" />
          {connectionPages.some((page) => page.isFetchNextPageError) ? (
            <button
              type="button"
              className="text-sm text-primary"
              onClick={() => {
                for (const page of connectionPages) {
                  if (page.isFetchNextPageError) void page.fetchNextPage();
                }
              }}
            >{t`Retry`}</button>
          ) : null}
        </Tabs.Panel>
      </Tabs>

      {!isSignedIn && (
        <Chip color="warning" variant="soft">
          {t`Sign in to see your contacts`}
        </Chip>
      )}
    </div>
  );
}
