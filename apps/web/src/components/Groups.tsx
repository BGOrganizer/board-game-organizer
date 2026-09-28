"use client";

import type { GroupResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useContacts, useGroups } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Check,
  Crown,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;

export function Groups() {
  const { getToken, userId } = useAuth();
  const { t } = useLingui();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState<GroupResponse | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: "delete" | "leave" } | null>(null);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    getToken()
      .then(setToken)
      .catch(() => setToken(null));
  }, [getToken]);
  const groups = useGroups({ apiUrl, token, getToken, userId, protectionBypass, feedback });
  const contacts = useContacts(apiUrl, token, getToken, protectionBypass, userId);

  const startEdit = (group?: GroupResponse) => {
    setName(group?.name ?? "");
    setIsPublic(group?.isPublic ?? false);
    setSelected(
      group?.invitations.filter((i) => i.status !== "DECLINED").map((i) => i.inviteeUserId) ?? [],
    );
    setEditing(group ?? "new");
  };
  const save = async () => {
    const input = { name: name.trim(), isPublic, invitedUserIds: selected };
    try {
      if (editing === "new") await groups.create.mutateAsync(input);
      else if (editing) await groups.update.mutateAsync({ id: editing.id, input });
      setEditing(null);
    } catch {
      /* Action-specific toast and rollback come from shared mutation. */
    }
  };
  const destroy = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === "delete") await groups.archive.mutateAsync(confirm.id);
      else await groups.leave.mutateAsync(confirm.id);
      setConfirm(null);
    } catch {
      /* Keep confirmation open for retry. */
    }
  };

  if (editing)
    return (
      <main className="mx-auto w-full max-w-2xl space-y-5 pb-24">
        <h2 className="text-xl font-semibold">
          {editing === "new" ? t`Create group` : t`Edit group`}
        </h2>
        <label className="block space-y-1 text-sm font-medium">
          <span>{t`Group name`}</span>
          <input
            className="w-full rounded-lg border border-default-300 bg-background p-3 text-foreground"
            value={name}
            minLength={5}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-default-200 p-3">
          <span>{t`Public group`}</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={isPublic}
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            aria-label={t`Public group`}
          />
        </label>
        <p className="text-sm text-default-500">{t`Public group search and join requests will be available later. Only the admin can invite friends now.`}</p>
        <h3 className="font-semibold">{t`Invite friends`}</h3>
        {contacts.friends.isPending ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
        {contacts.friends.isError ? (
          <p role="alert" className="text-danger">{t`Could not load friends`}</p>
        ) : null}
        {contacts.friends.data?.length === 0 ? (
          <p className="text-sm text-default-500">{t`No friends to invite yet`}</p>
        ) : null}
        <div className="space-y-2">
          {contacts.friends.data?.map((row) => {
            const profile = row.profile;
            return profile ? (
              <label
                key={profile.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-default-200 p-3"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(profile.id)}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked
                        ? [...ids, profile.id]
                        : ids.filter((id) => id !== profile.id),
                    )
                  }
                />
                <span className="truncate">{profile.name}</span>
              </label>
            ) : null;
          })}
          {selected
            .filter((id) => !contacts.friends.data?.some((row) => row.profile?.id === id))
            .map((id) => (
              <label
                key={id}
                className="flex items-center gap-3 rounded-xl border border-default-200 p-3"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => setSelected((ids) => ids.filter((item) => item !== id))}
                />
                <span className="truncate">
                  {editing !== "new"
                    ? (editing.memberProfiles.find((user) => user.id === id)?.name ?? id)
                    : id}
                </span>
              </label>
            ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setEditing(null)}>{t`Cancel`}</Button>
          <Button
            variant="primary"
            isDisabled={
              name.trim().length < 5 ||
              contacts.friends.isPending ||
              contacts.friends.isError ||
              groups.create.isPending ||
              groups.update.isPending
            }
            onPress={save}
          >
            {editing === "new" ? t`Create group` : t`Save`}
          </Button>
        </div>
      </main>
    );

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
        {groups.list.data?.map((group) => {
          const admin = group.adminUserId === userId;
          const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
          const pending = invitation?.status === "PENDING";
          return (
            <Card key={group.id} className="flex min-w-0 flex-row items-center gap-3 p-4">
              <span className="relative flex size-16 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <UsersRound aria-hidden="true" />
                {admin ? (
                  <span
                    className="absolute top-0 left-0 rounded-br-lg bg-surface p-1"
                    role="img"
                    aria-label={t`Group admin`}
                  >
                    <Crown className="size-4 text-warning" aria-hidden="true" />
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{group.name}</p>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-default-500">
                    {group.isPublic ? (
                      <LockKeyholeOpen size={14} aria-hidden="true" />
                    ) : (
                      <LockKeyhole size={14} aria-hidden="true" />
                    )}
                    {group.isPublic ? t`Public` : t`Private`}
                  </span>
                </div>
                <p className="text-sm text-default-500">
                  {group.memberCount} {group.memberCount === 1 ? t`member` : t`members`}
                </p>
                <div className="mt-2 flex justify-end gap-1">
                  {pending ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t`Accept group invitation`}
                        isDisabled={groups.respond.isPending}
                        onPress={() =>
                          groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                        }
                      >
                        <Check size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t`Decline group invitation`}
                        isDisabled={groups.respond.isPending}
                        onPress={() =>
                          groups.respond.mutate({
                            invitationId: invitation.id,
                            decision: "decline",
                          })
                        }
                      >
                        <X size={16} />
                      </Button>
                    </>
                  ) : null}
                  {admin ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t`Edit group`}
                        onPress={() => startEdit(group)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t`Delete group`}
                        onPress={() => setConfirm({ id: group.id, action: "delete" })}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </>
                  ) : invitation?.status === "ACCEPTED" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => setConfirm({ id: group.id, action: "leave" })}
                    >{t`Leave group`}</Button>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <Button
        className="fixed right-6 bottom-6 z-10 shadow-lg"
        variant="primary"
        aria-label={t`Create group`}
        onPress={() => startEdit()}
      >
        <Plus size={20} aria-hidden="true" /> {t`Create group`}
      </Button>
      {confirm ? (
        <ContactConfirmDialog
          title={confirm.action === "delete" ? t`Delete group?` : t`Leave group?`}
          description={
            confirm.action === "delete"
              ? t`Group will be archived. Existing confirmed match results and ratings remain.`
              : t`You will need a new invitation to rejoin.`
          }
          busy={groups.archive.isPending || groups.leave.isPending}
          onCancel={() => setConfirm(null)}
          actions={[
            {
              label: confirm.action === "delete" ? t`Delete group` : t`Leave group`,
              variant: "danger",
              onPress: destroy,
            },
          ]}
        />
      ) : null}
    </main>
  );
}
