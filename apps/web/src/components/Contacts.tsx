"use client";

import { resolveApiUrl, useContacts } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button, Card, Chip, Spinner } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

type TabKey = "following" | "friends" | "suggestions" | "search";

function ContactCard({
  name,
  email,
  avatarUrl,
  online,
  action,
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  online: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-row items-center gap-3 p-3">
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
    </Card>
  );
}

export function Contacts() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("following");
  const [query, setQuery] = useState("");
  const [searchDone, setSearchDone] = useState(false);

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

  const contacts = useContacts(apiUrl(), token);
  const isBusy = contacts.follow.isPending || contacts.unfollow.isPending;

  const followingRows = contacts.following.data ?? [];
  const friendsRows = contacts.friends.data ?? [];
  const suggestions = contacts.suggestions.data?.users ?? [];
  const searchResults = contacts.search.data?.users ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["following", t`Following`],
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
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) {
                contacts.search.mutate({ query: query.trim() });
                setSearchDone(true);
              }
            }}
          >
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchDone(false);
              }}
              placeholder={t`Search users by name or email`}
              aria-label={t`Search users by name or email`}
              className="w-full rounded-lg border border-default-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button type="submit" variant="primary">
              {t`Search`}
            </Button>
          </form>
          {contacts.search.isPending && <Spinner size="sm" />}
          {searchDone && !contacts.search.isPending && searchResults.length === 0 && (
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
                    onPress={() => contacts.follow.mutate({ targetUserId: u.id })}
                  >
                    {t`Follow`}
                  </Button>
                }
              />
            ))}
          </div>
        </div>
      )}

      {tab === "suggestions" && (
        <div className="space-y-2">
          {contacts.suggestions.isLoading && <Spinner size="sm" />}
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
            />
          ))}
        </div>
      )}

      {(tab === "following" || tab === "friends") && (
        <div className="space-y-2">
          {(tab === "following" ? contacts.following.isLoading : contacts.friends.isLoading) && (
            <Spinner size="sm" />
          )}
          {(tab === "following" ? followingRows : friendsRows).length === 0 &&
            !(tab === "following" ? contacts.following.isLoading : contacts.friends.isLoading) && (
              <p className="text-sm text-default-500">
                {tab === "following" ? t`You are not following anyone yet` : t`No friends yet`}
              </p>
            )}
          {(tab === "following" ? followingRows : friendsRows).map((row) =>
            row.profile ? (
              <ContactCard
                key={row.profile.id}
                name={row.profile.name}
                email={row.profile.email}
                avatarUrl={row.profile.avatarUrl}
                online={row.profile.presence.online}
                action={
                  tab === "following" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={isBusy}
                      onPress={() => contacts.unfollow.mutate({ targetUserId: row.profile!.id })}
                    >
                      {t`Unfollow`}
                    </Button>
                  ) : undefined
                }
              />
            ) : null,
          )}
        </div>
      )}

      {!isSignedIn && (
        <Chip color="warning" variant="soft">
          {t`Sign in to see your contacts`}
        </Chip>
      )}
    </div>
  );
}
