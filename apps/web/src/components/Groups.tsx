"use client";

import type { GroupResponse } from "@board-game-organizer/schemas";
import {
  matchContactState,
  resolveApiUrl,
  useContacts,
  useGroups,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import squircles from "@dicebear/styles/squircles.json" with { type: "json" };
import {
  Avatar,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Popover,
  Skeleton,
  Switch,
  TextField,
} from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Crown,
  Ellipsis,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { SearchUserPage } from "@/components/SearchUserPage";
import { type UserActionKey, UserMenu } from "@/components/UserMenu";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
type InvitedUser = { id: string; name: string; email: string | null; avatarUrl: string | null };
type Slot = { id: string; user: InvitedUser | null };
const newSlot = (): Slot => ({ id: crypto.randomUUID(), user: null });
const squirclesStyle = new Style(squircles);

function GroupArtwork({ name, adminLabel }: { name: string; adminLabel?: string }) {
  const src = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(new DiceBearAvatar(squirclesStyle, { seed: name, size: 64 }).toString())}`,
    [name],
  );
  return (
    <span className="relative size-16 shrink-0">
      {/* biome-ignore lint/performance/noImgElement: Locally generated DiceBear SVG. */}
      <img src={src} alt="" className="size-16 rounded-xl" />
      {adminLabel ? (
        <span
          className="absolute top-0 left-0 rounded-br-lg bg-surface p-1 shadow-sm"
          role="img"
          aria-label={adminLabel}
        >
          <Crown className="size-4 text-warning" aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}

function GroupEditor({
  group,
  groups,
  token,
  getToken,
}: {
  group?: GroupResponse;
  groups: ReturnType<typeof useGroups>;
  token: string | null;
  getToken: () => Promise<string | null>;
}) {
  const { t } = useLingui();
  const router = useRouter();
  const { userId } = useAuth();
  const contacts = useContacts(apiUrl, token, getToken, protectionBypass, userId);
  const [name, setName] = useState(group?.name ?? "");
  const [isPublic, setIsPublic] = useState(group?.isPublic ?? false);
  const [slots, setSlots] = useState<Slot[]>(() => {
    const invited =
      group?.invitations
        .filter((invitation) => invitation.status !== "DECLINED")
        .map((invitation) => ({
          id: crypto.randomUUID(),
          user: group.memberProfiles.find((user) => user.id === invitation.inviteeUserId) ?? {
            id: invitation.inviteeUserId,
            name: invitation.inviteeUserId,
            email: null,
            avatarUrl: null,
          },
        })) ?? [];
    return [...invited, newSlot()];
  });
  const [searchSlot, setSearchSlot] = useState<string | null>(null);
  const back = group ? `/groups/${group.id}` : "/groups";
  const save = async () => {
    const input = {
      name: name.trim(),
      isPublic,
      invitedUserIds: slots.flatMap((slot) => (slot.user ? [slot.user.id] : [])),
    };
    try {
      if (group) await groups.update.mutateAsync({ id: group.id, input });
      else await groups.create.mutateAsync(input);
      router.replace(back);
    } catch {
      // Shared mutation restores the cache and shows an action-specific toast.
    }
  };

  if (searchSlot)
    return (
      <SearchUserPage
        apiUrl={apiUrl}
        token={token}
        getToken={getToken}
        protectionBypass={protectionBypass}
        excludeIds={slots.flatMap((slot) =>
          slot.id !== searchSlot && slot.user ? [slot.user.id] : [],
        )}
        onSelect={(user) => {
          setSlots((current) =>
            current.map((slot) => (slot.id === searchSlot ? { ...slot, user } : slot)),
          );
          setSearchSlot(null);
        }}
        onClose={() => setSearchSlot(null)}
      />
    );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
      <div className="flex items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t`Back`}
          onPress={() => router.replace(back)}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{group ? t`Edit group` : t`New group`}</h1>
      </div>
      <TextField
        fullWidth
        name="name"
        value={name}
        onChange={setName}
        isInvalid={name.length > 0 && name.trim().length < 5}
      >
        <Label>{t`Group name`}</Label>
        <Input maxLength={120} />
        <FieldError>{t`At least 5 characters`}</FieldError>
      </TextField>
      <Switch isSelected={isPublic} onChange={setIsPublic}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {t`Public group`}
        </Switch.Content>
      </Switch>
      <p className="text-sm text-default-500">
        {t`Public group search and join requests will be available later. Only the admin can invite friends now.`}
      </p>
      <h2 className="text-sm font-semibold">{t`Invite friends`}</h2>
      {contacts.friends.isPending ? <Skeleton className="h-12 w-full rounded-xl" /> : null}
      {contacts.friends.isError ? (
        <p role="alert" className="text-danger">{t`Could not load friends`}</p>
      ) : null}
      <GroupedList>
        {slots.map((slot) => {
          const friend = contacts.friends.data?.find(
            (row) => row.profile?.id === slot.user?.id,
          )?.profile;
          const user = friend ?? slot.user;
          return (
            <GroupedRow key={slot.id} className="relative">
              <Button
                variant="ghost"
                className="w-full min-w-0 justify-start pr-12"
                onPress={() => setSearchSlot(slot.id)}
              >
                {user ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar size="md" color="accent">
                      <Avatar.Image src={user.avatarUrl ?? undefined} alt="" />
                      <Avatar.Fallback>{user.name.charAt(0) || "?"}</Avatar.Fallback>
                    </Avatar>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-sm font-medium">{user.name}</span>
                      <span className="block truncate text-xs text-default-400">{user.email}</span>
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-default-400">
                    <UsersRound className="size-4" />
                    {t`Select a friend`}
                  </span>
                )}
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="danger-soft"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                aria-label={t`Remove invite`}
                onPress={() => setSlots((current) => current.filter((item) => item.id !== slot.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </GroupedRow>
          );
        })}
      </GroupedList>
      <Button
        size="sm"
        variant="primary"
        onPress={() => setSlots((current) => [...current, newSlot()])}
      >
        <Plus className="size-4" />
        {t`Add friend`}
      </Button>
      <Button
        isIconOnly
        variant="primary"
        className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg sm:right-6 sm:bottom-6 sm:h-14 sm:w-14"
        aria-label={group ? t`Save changes` : t`Create group`}
        isDisabled={name.trim().length < 5 || groups.create.isPending || groups.update.isPending}
        onPress={save}
      >
        {group ? <Save className="size-6" /> : <UsersRound className="size-6" />}
      </Button>
    </main>
  );
}

function GroupPeople({
  group,
  token,
  getToken,
  userId,
  removing,
  onRemove,
}: {
  group: GroupResponse;
  token: string | null;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  removing: boolean;
  onRemove: (id: string) => void;
}) {
  const { t } = useLingui();
  const contacts = useContacts(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    userId,
    useMutationFeedback(),
  );
  const socialLists = {
    following: contacts.following.data,
    followers: contacts.followers.data,
    friends: contacts.friends.data,
    pending: contacts.pending.data,
    sent: contacts.sent.data,
    blocked: contacts.blocked.data,
  };
  const socialQueries = [
    contacts.following,
    contacts.followers,
    contacts.friends,
    contacts.pending,
    contacts.sent,
    contacts.blocked,
  ];
  const socialBusy =
    !socialQueries.every((query) => query.isSuccess) ||
    [
      contacts.follow,
      contacts.unfollow,
      contacts.unfriend,
      contacts.friendRequest,
      contacts.cancelFriendRequest,
      contacts.acceptFriendRequest,
      contacts.rejectFriendRequest,
      contacts.block,
      contacts.unblock,
    ].some((mutation) => mutation.isPending);
  const socialAction = (
    person: { id: string; name: string; email: string | null; avatarUrl: string | null },
    key: UserActionKey,
  ) => {
    if (key === "profile") return;
    const targetUser = matchContactState(person, socialLists).user;
    const mutation = {
      follow: contacts.follow,
      unfollow: contacts.unfollow,
      unfriend: contacts.unfriend,
      friend_request: contacts.friendRequest,
      cancel_friend_request: contacts.cancelFriendRequest,
      accept_friend_request: contacts.acceptFriendRequest,
      reject_friend_request: contacts.rejectFriendRequest,
      block: contacts.block,
      unblock: contacts.unblock,
    }[key];
    mutation?.mutate({ targetUserId: person.id, targetUser });
  };
  const people = [
    ...group.memberProfiles.map((person) => ({
      ...person,
      status: "ACCEPTED" as const,
      invitation: group.invitations.find((item) => item.inviteeUserId === person.id),
    })),
    ...group.invitations
      .filter((item) => item.status !== "ACCEPTED")
      .map((item) => {
        const friend = contacts.friends.data?.find(
          (row) => row.profile?.id === item.inviteeUserId,
        )?.profile;
        return {
          id: item.inviteeUserId,
          name: friend?.name ?? item.inviteeUserId,
          email: friend?.email ?? null,
          avatarUrl: friend?.avatarUrl ?? null,
          status: item.status,
          invitation: item,
        };
      }),
  ];
  return (
    <>
      <GroupedList>
        {people.map((person) => {
          const state = matchContactState(person, socialLists);
          return (
            <GroupedRow key={person.id}>
              <span className="relative shrink-0">
                <Avatar size="md" color="accent">
                  <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
                  <Avatar.Fallback>{person.name.charAt(0) || "?"}</Avatar.Fallback>
                </Avatar>
                <span
                  className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5"
                  role="img"
                  aria-label={
                    person.status === "PENDING"
                      ? t`Pending`
                      : person.status === "DECLINED"
                        ? t`Declined`
                        : t`Accepted`
                  }
                >
                  {person.status === "PENDING" ? (
                    <Clock3 className="size-4 text-warning" />
                  ) : person.status === "DECLINED" ? (
                    <CircleX className="size-4 text-danger" />
                  ) : (
                    <CircleCheck className="size-4 text-success" />
                  )}
                </span>
                {person.id === group.adminUserId ? (
                  <span
                    className="absolute top-0 left-0 rounded-br-lg bg-surface p-0.5"
                    role="img"
                    aria-label={t`Group admin`}
                  >
                    <Crown className="size-4 text-warning" />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{person.name}</span>
                {person.email ? (
                  <span className="block truncate text-sm text-default-500">{person.email}</span>
                ) : null}
              </span>
              {group.adminUserId === userId && person.invitation ? (
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  isDisabled={removing}
                  aria-label={`${t`Remove from group`}: ${person.name}`}
                  onPress={() => onRemove(person.invitation?.id ?? "")}
                >
                  <UserRoundX className="size-4" />
                </Button>
              ) : null}
              {person.id !== userId ? (
                <UserMenu
                  user={state.user}
                  busy={socialBusy}
                  matchContext
                  canSendFriendRequest={state.canSendFriendRequest}
                  friendRequest={state.friendRequest}
                  onAction={(key) => socialAction(person, key)}
                />
              ) : null}
            </GroupedRow>
          );
        })}
      </GroupedList>
      {socialQueries.some((query) => query.isError) ? (
        <Button variant="ghost" onPress={() => void contacts.refreshContacts()}>
          {t`Could not load social actions. Retry`}
        </Button>
      ) : null}
    </>
  );
}

export function Groups({
  mode = "list",
  groupId,
}: {
  mode?: "list" | "new" | "detail" | "edit";
  groupId?: string;
}) {
  const { getToken, userId } = useAuth();
  const { t, i18n } = useLingui();
  const router = useRouter();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    action: "delete" | "leave" | "remove";
  } | null>(null);
  useEffect(() => {
    getToken()
      .then(setToken)
      .catch(() => setToken(null));
  }, [getToken]);
  const groups = useGroups({ apiUrl, token, getToken, userId, protectionBypass, feedback });
  const group = groups.list.data?.find((item) => item.id === groupId);
  const destroy = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === "remove") {
        await groups.removeInvitation.mutateAsync(confirm.id);
        setConfirm(null);
        return;
      }
      if (confirm.action === "delete") await groups.archive.mutateAsync(confirm.id);
      else await groups.leave.mutateAsync(confirm.id);
      setConfirm(null);
      router.push("/groups");
    } catch {
      // Keep confirmation open for retry.
    }
  };

  if ((mode === "edit" || mode === "detail") && !group)
    return (
      <main className="mx-auto max-w-3xl">
        {groups.list.isPending ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <p role="alert" className="text-danger">{t`Could not load group details`}</p>
        )}
      </main>
    );
  if (mode === "new" || mode === "edit")
    return (
      <GroupEditor
        key={groupId ?? "new"}
        group={group}
        groups={groups}
        token={token}
        getToken={getToken}
      />
    );
  if (mode === "detail" && group) {
    const admin = group.adminUserId === userId;
    const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-24">
        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            variant="ghost"
            aria-label={t`Back`}
            onPress={() => router.push("/groups")}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{group.name}</h1>
          {admin ? (
            <Popover>
              <Popover.Trigger
                aria-label={t`More group actions`}
                className="button button--icon-only button--sm button--outline"
              >
                <Ellipsis className="size-4" />
              </Popover.Trigger>
              <Popover.Content placement="bottom end" className="w-56">
                <Popover.Dialog className="flex items-center gap-2 p-2">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    aria-label={t`Delete group`}
                    onPress={() => setConfirm({ id: group.id, action: "delete" })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <span className="text-sm text-danger">{t`Delete group`}</span>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          ) : null}
        </div>
        <p className="flex items-center gap-2 text-sm text-default-500">
          {group.isPublic ? (
            <LockKeyholeOpen className="size-4" />
          ) : (
            <LockKeyhole className="size-4" />
          )}
          {group.isPublic ? t`Public` : t`Private`} · {group.memberCount}{" "}
          {group.memberCount === 1 ? t`member` : t`members`}
        </p>

        {invitation?.status === "PENDING" ? (
          <p className="text-sm text-default-500">{t`Members are visible after accepting the invitation`}</p>
        ) : null}
        <GroupPeople
          group={group}
          token={token}
          getToken={getToken}
          userId={userId}
          removing={groups.removeInvitation.isPending}
          onRemove={(id) => setConfirm({ id, action: "remove" })}
        />
        {invitation?.status === "PENDING" ? (
          <div className="flex gap-2">
            <Button
              variant="primary"
              isDisabled={groups.respond.isPending}
              onPress={() =>
                groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
              }
            >
              <Check className="size-4" />
              {t`Accept invitation`}
            </Button>
            <Button
              variant="danger-soft"
              isDisabled={groups.respond.isPending}
              onPress={() =>
                groups.respond.mutate(
                  { invitationId: invitation.id, decision: "decline" },
                  { onSuccess: () => router.push("/groups") },
                )
              }
            >
              <X className="size-4" />
              {t`Decline invitation`}
            </Button>
          </div>
        ) : null}
        {admin ? (
          <Button
            isIconOnly
            variant="primary"
            aria-label={t`Edit group`}
            className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg sm:right-6 sm:bottom-6 sm:h-14 sm:w-14"
            onPress={() => router.push(`/groups/${group.id}/edit`)}
          >
            <Pencil className="size-6" />
          </Button>
        ) : invitation?.status === "ACCEPTED" ? (
          <Button
            variant="danger-soft"
            onPress={() => setConfirm({ id: group.id, action: "leave" })}
          >
            <LogOut className="size-4" />
            {t`Leave group`}
          </Button>
        ) : null}
        {confirm ? (
          <ContactConfirmDialog
            title={
              confirm.action === "delete"
                ? t`Delete group?`
                : confirm.action === "remove"
                  ? t`Remove from group?`
                  : t`Leave group?`
            }
            description={
              confirm.action === "delete"
                ? t`Group will be archived. Existing confirmed match results and ratings remain.`
                : confirm.action === "remove"
                  ? t`This removes the invitation or member from the group. You can invite them again.`
                  : t`You will need a new invitation to rejoin.`
            }
            busy={
              groups.archive.isPending ||
              groups.leave.isPending ||
              groups.removeInvitation.isPending
            }
            onCancel={() => setConfirm(null)}
            actions={[
              {
                label:
                  confirm.action === "delete"
                    ? t`Delete group`
                    : confirm.action === "remove"
                      ? t`Remove from group`
                      : t`Leave group`,
                variant: "danger",
                onPress: destroy,
              },
            ]}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl pb-24">
      {groups.list.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2, 3].map((id) => (
            <Skeleton key={id} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : null}
      {groups.list.isError ? (
        <p role="alert" className="text-danger">{t`Could not load groups`}</p>
      ) : null}
      {groups.list.data?.length === 0 ? (
        <p className="text-default-500">{t`No groups yet`}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.list.data?.map((item) => {
          const admin = item.adminUserId === userId;
          const invitation = item.invitations.find(
            (candidate) => candidate.inviteeUserId === userId,
          );
          return (
            <Card key={item.id} className="relative flex min-w-0 flex-row items-center gap-3 p-4">
              <Link
                href={`/groups/${item.id}`}
                aria-label={`${t`Open group`}: ${item.name}`}
                className="absolute inset-0 z-10 rounded-xl"
              />
              <GroupArtwork name={item.name} adminLabel={admin ? t`Group admin` : undefined} />
              <div className="relative min-w-0 flex-1 pointer-events-none">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{item.name}</p>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-default-500">
                    {item.isPublic ? <LockKeyholeOpen size={14} /> : <LockKeyhole size={14} />}
                    {item.isPublic ? t`Public` : t`Private`}
                  </span>
                </div>
                <time dateTime={item.createdAt} className="text-sm text-default-500">
                  {new Date(item.createdAt).toLocaleDateString(i18n.locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                <p className="flex items-center gap-1 text-sm text-default-500">
                  <UsersRound className="size-4" aria-hidden="true" />
                  {item.memberCount} {item.memberCount === 1 ? t`member` : t`members`}
                </p>
                {item.invitations.some((candidate) => candidate.status === "PENDING") && admin ? (
                  <p className="flex items-center gap-1 text-xs text-default-500">
                    <Mail className="size-4" aria-hidden="true" />
                    {item.invitations.filter((candidate) => candidate.status === "PENDING").length}{" "}
                    {t`Invited`}
                  </p>
                ) : null}
              </div>
              {invitation?.status === "PENDING" ? (
                <div className="relative z-20 flex gap-1">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="outline"
                    aria-label={t`Accept group invitation`}
                    isDisabled={groups.respond.isPending}
                    onPress={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                    }
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="outline"
                    aria-label={t`Decline group invitation`}
                    isDisabled={groups.respond.isPending}
                    onPress={() =>
                      groups.respond.mutate({ invitationId: invitation.id, decision: "decline" })
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
      <Button
        isIconOnly
        variant="primary"
        aria-label={t`Create group`}
        className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg sm:right-6 sm:bottom-6 sm:h-14 sm:w-14"
        onPress={() => router.push("/groups/new")}
      >
        <Plus className="size-6" />
      </Button>
    </main>
  );
}
