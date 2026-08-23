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
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InviteCard } from "@/components/InviteCard";
import { type UserActionKey, UserMenu } from "@/components/UserMenu";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

// NEXT_PUBLIC_* reads are only inlined by Next.js in project files, so the
// bypass must be read here and passed down to the shared API helpers.
function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

type TabKey = "following" | "followers" | "friends" | "suggestions" | "search";

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
    <Card className="flex flex-row items-center gap-3 p-3">
      {" "}
      <Avatar size="md" color="accent">
        <Avatar.Image src={avatarUrl ?? undefined} alt={name} />
        <Avatar.Fallback>{name?.charAt(0) ?? "?"}</Avatar.Fallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate font-medium">
          {name}
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              online ? "bg-green-500" : "bg-gray-300"
            }`}
            title={online ? "online" : "offline"}
          />
        </p>
        {email ? <p className="truncate text-sm text-default-500">{email}</p> : null}
      </div>
      {action}
      {menu}
    </Card>
  );
}

/** Placeholder shown while a contact list is loading. */
function ContactListSkeleton({ count = 4 }: { count?: number }) {
  const keys = Array.from({ length: count }, (_, i) => `sk-${count}-${i}`);
  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <Card key={key} className="flex flex-row items-center gap-3 p-3">
          <Skeleton animationType="pulse" className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton animationType="pulse" className="h-3 w-2/3 rounded" />
            <Skeleton animationType="pulse" className="h-3 w-1/2 rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function Contacts() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("following");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => {
        if (active) setToken(tok ?? null);
      })
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

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

  const contacts = useContacts(apiUrl(), token, getToken, protectionBypass());
  const isBusy =
    contacts.follow.isPending ||
    contacts.unfollow.isPending ||
    contacts.block.isPending ||
    contacts.unblock.isPending;

  const handleUserAction = (u: ContactUser) => (key: UserActionKey) => {
    if (key === "follow") contacts.follow.mutate({ targetUserId: u.id });
    else if (key === "unfollow") contacts.unfollow.mutate({ targetUserId: u.id });
    else if (key === "block") contacts.block.mutate({ targetUserId: u.id });
    else if (key === "unblock") contacts.unblock.mutate({ targetUserId: u.id });
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
      contacts.runSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const followingRows = contacts.following.data ?? [];
  const followersRows = contacts.followers.data ?? [];
  const friendsRows = contacts.friends.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const searchResults = contacts.search.data?.users ?? [];

  // List tabs: which query feeds each tab, plus the empty-state copy.
  const listTabs: Array<{
    key: TabKey;
    label: string;
    rows: typeof followingRows;
    isLoading: boolean;
    empty: string;
    showUnfollow: boolean;
  }> = [
    {
      key: "following",
      label: t`Following`,
      rows: followingRows,
      isLoading: contacts.following.isLoading,
      empty: t`You are not following anyone yet`,
      showUnfollow: true,
    },
    {
      key: "followers",
      label: t`Followers`,
      rows: followersRows,
      isLoading: contacts.followers.isLoading,
      empty: t`No followers yet`,
      showUnfollow: false,
    },
    {
      key: "friends",
      label: t`Friends`,
      rows: friendsRows,
      isLoading: contacts.friends.isLoading,
      empty: t`No friends yet`,
      showUnfollow: false,
    },
  ];

  return (
    <div className="space-y-4">
      <InviteCard apiUrl={apiUrl()} protectionBypass={protectionBypass()} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["following", t`Following`],
            ["followers", t`Followers`],
            ["friends", t`Friends`],
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
          {contacts.search.isPending && <ContactListSkeleton count={2} />}
          {query.trim().length >= 4 && !contacts.search.isPending && searchResults.length === 0 && (
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
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={isBusy}
                    onPress={() =>
                      u.isFollowing
                        ? contacts.unfollow.mutate({ targetUserId: u.id })
                        : contacts.follow.mutate({ targetUserId: u.id })
                    }
                  >
                    {u.isFollowing ? t`Unfollow` : t`Follow`}
                  </Button>
                }
                menu={<UserMenu user={u} busy={isBusy} onAction={handleUserAction(u)} />}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "suggestions" && (
        <div className="space-y-2">
          {contacts.suggestions.isLoading && <ContactListSkeleton count={3} />}
          {suggestions.length === 0 && !contacts.suggestions.isLoading && (
            <p className="text-sm text-default-500">{t`No suggestions right now`}</p>
          )}
          {suggestions.map((u) => (
            <ContactCard
              key={u.id}
              name={u.name}
              email={u.email}
              avatarUrl={u.avatarUrl}
              online={u.presence.online}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={isBusy}
                  onPress={() => contacts.follow.mutate({ targetUserId: u.id })}
                >
                  {t`Follow`}
                </Button>
              }
              menu={<UserMenu user={u} busy={isBusy} onAction={handleUserAction(u)} />}
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
              {listTab.rows.length === 0 && !listTab.isLoading && (
                <p className="text-sm text-default-500">{listTab.empty}</p>
              )}
              {listTab.rows.map((row) => {
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
                      listTab.showUnfollow ? (
                        <Button
                          size="sm"
                          variant="outline"
                          isDisabled={isBusy}
                          onPress={() => contacts.unfollow.mutate({ targetUserId: profile.id })}
                        >
                          {t`Unfollow`}
                        </Button>
                      ) : undefined
                    }
                    menu={
                      <UserMenu user={profile} busy={isBusy} onAction={handleUserAction(profile)} />
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
    </div>
  );
}
