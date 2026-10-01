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
import { EmptyList } from "@/components/EmptyList";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { SearchHelpLabel } from "@/components/SearchHelpLabel";
import { type UserActionKey, UserMenu } from "@/components/UserMenu";
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
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  online: boolean;
  menu?: React.ReactNode;
}) {
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
  const endRefs = {
    friends: useInfiniteScroll({
      ...contacts.friends,
      fetchNextPage: () => contacts.friends.fetchNextPage(),
    }),
    following: useInfiniteScroll({
      ...contacts.following,
      fetchNextPage: () => contacts.following.fetchNextPage(),
    }),
    followers: useInfiniteScroll({
      ...contacts.followers,
      fetchNextPage: () => contacts.followers.fetchNextPage(),
    }),
    pending: useInfiniteScroll({
      ...contacts.pending,
      fetchNextPage: () => contacts.pending.fetchNextPage(),
    }),
    sent: useInfiniteScroll({
      ...contacts.sent,
      fetchNextPage: () => contacts.sent.fetchNextPage(),
    }),
    blocked: useInfiniteScroll({
      ...contacts.blocked,
      fetchNextPage: () => contacts.blocked.fetchNextPage(),
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

  const connections = contactConnections(friendsRows, followingRows, followersRows, suggestions);
  const bgoContacts = connections.find((section) => section.key === "device")?.users ?? [];
  const connectionLabels = {
    friends: t`Friends`,
    following: t`Following`,
    followers: t`Followers`,
  };
  const connectionEmpty = {
    friends: t`No friends yet`,
    following: t`Not following anyone yet`,
    followers: t`No followers yet`,
  };
  const connectionIcons = {
    friends: UsersRound,
    following: UserRoundPlus,
    followers: UserRoundCheck,
  };
  const connectionQueries = {
    friends: contacts.friends,
    following: contacts.following,
    followers: contacts.followers,
  };
  const contactCard = (user: ContactUser, friendRequest?: "incoming" | "outgoing") => (
    <ContactCard
      key={user.id}
      name={user.name}
      email={user.email}
      avatarUrl={user.avatarUrl}
      online={user.presence.online}
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

        <Tabs.Panel id="requests" className="space-y-5 pt-4">
          {[
            {
              key: "received",
              label: t`Received`,
              icon: Mail,
              rows: pendingRows,
              isLoading: contacts.pending.isLoading,
              isError: contacts.pending.isError,
              empty: t`No received friend requests`,
            },
            {
              key: "sent",
              label: t`Sent`,
              icon: Send,
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
              <h2
                id={`${section.key}-title`}
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <section.icon className="size-4" aria-hidden="true" />
                {section.label}
              </h2>
              {section.isLoading && <ContactListSkeleton count={2} />}
              {section.isError && (
                <p role="alert" className="text-sm text-danger">
                  {t`Could not load friend requests`}
                </p>
              )}
              {!section.isLoading && !section.isError && section.rows.length === 0 && (
                <EmptyList icon={<section.icon className="size-7" />}>{section.empty}</EmptyList>
              )}
              <GroupedList>
                {section.rows.map((row) =>
                  row.profile
                    ? contactCard(row.profile, section.key === "received" ? "incoming" : "outgoing")
                    : null,
                )}
              </GroupedList>
              <div
                ref={section.key === "received" ? endRefs.pending : endRefs.sent}
                aria-hidden="true"
              />
              {(section.key === "received" ? contacts.pending : contacts.sent)
                .isFetchNextPageError ? (
                <button
                  type="button"
                  className="text-sm text-primary"
                  onClick={() =>
                    void (
                      section.key === "received" ? contacts.pending : contacts.sent
                    ).fetchNextPage()
                  }
                >{t`Retry`}</button>
              ) : null}
            </section>
          ))}
          <section className="space-y-2" aria-labelledby="blocked-title">
            <h2 id="blocked-title" className="flex items-center gap-2 text-sm font-semibold">
              <Ban className="size-4" aria-hidden="true" />
              {t`Blocked`}
            </h2>
            {contacts.blocked.isLoading ? <ContactListSkeleton count={2} /> : null}
            {contacts.blocked.isError ? (
              <p role="alert" className="text-sm text-danger">{t`Could not load contacts`}</p>
            ) : null}
            {!contacts.blocked.isLoading &&
            !contacts.blocked.isError &&
            blockedRows.length === 0 ? (
              <EmptyList icon={<Ban className="size-7" />}>{t`No blocked users`}</EmptyList>
            ) : null}
            <GroupedList>
              {blockedRows.map((row) => (row.profile ? contactCard(row.profile) : null))}
            </GroupedList>
            <div ref={endRefs.blocked} aria-hidden="true" />
            {contacts.blocked.isFetchNextPageError ? (
              <button
                type="button"
                className="text-sm text-primary"
                onClick={() => void contacts.blocked.fetchNextPage()}
              >{t`Retry`}</button>
            ) : null}
          </section>
        </Tabs.Panel>

        <Tabs.Panel id="connections" className="space-y-5 pt-4">
          {connections
            .filter((section) => section.key !== "device")
            .map((section) => {
              const state = connectionQueries[section.key];
              const Icon = connectionIcons[section.key];
              return (
                <section
                  key={section.key}
                  className="space-y-2"
                  aria-labelledby={`connections-${section.key}`}
                >
                  <h2
                    id={`connections-${section.key}`}
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {connectionLabels[section.key]}
                  </h2>
                  {state.isLoading ? <ContactListSkeleton count={2} /> : null}
                  {state.isError ? (
                    <p role="alert" className="text-sm text-danger">{t`Could not load contacts`}</p>
                  ) : null}
                  {!state.isLoading && !state.isError && section.users.length === 0 && (
                    <EmptyList icon={<Icon className="size-7" />}>
                      {connectionEmpty[section.key]}
                    </EmptyList>
                  )}
                  <GroupedList>{section.users.map((user) => contactCard(user))}</GroupedList>
                  <div ref={endRefs[section.key]} aria-hidden="true" />
                  {state.isFetchNextPageError ? (
                    <button
                      type="button"
                      className="text-sm text-primary"
                      onClick={() => void state.fetchNextPage()}
                    >{t`Retry`}</button>
                  ) : null}
                </section>
              );
            })}
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
