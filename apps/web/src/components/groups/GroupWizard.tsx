"use client";
import {
  createGroupRecordSchema,
  type GroupRecordResponse,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import type { CreateGroupVariables, EditGroupVariables } from "@board-game-organizer/shared";
import {
  communityAccessDenied,
  creationState,
  groupRecordKeys,
  useClientMutationDraft,
  useFavoriteLocations,
  useGroupCreationDraft,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Avatar, Button, Input, Skeleton, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Plus, Save, Send, Trash2, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupLogoPicker } from "./GroupLogoPicker";

type Friend = { id: string; name: string; email: string | null; avatarUrl: string | null };
export function GroupWizard({ groupId, draftId }: { groupId?: string; draftId?: string }) {
  const options = useCommunityApi(),
    { t } = useLingui();
  const detail = useGroupRecord(
    { ...options, enabled: Boolean(groupId) && options.enabled !== false },
    groupId ?? "",
  );
  if (groupId && (communityAccessDenied(detail.error) || !detail.data || !detail.data.canEdit))
    return detail.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load group details`}</p>
        <Button variant="outline" onPress={() => void detail.refetch()}>{t`Try again`}</Button>
      </div>
    );
  if (draftId) return <RecoveredEditor draftId={draftId} />;
  return (
    <Editor
      key={`${options.apiUrl}/${options.userId}/${groupId ?? "new"}`}
      group={groupId ? detail.data : undefined}
    />
  );
}
function RecoveredEditor({ draftId }: { draftId: string }) {
  const options = useCommunityApi(),
    { t } = useLingui(),
    recovery = useGroupCreationDraft(options, draftId);
  if (!recovery || creationState(recovery).phase !== "failed")
    return <p role="alert" className="text-danger">{t`Could not recover draft`}</p>;
  return (
    <Editor key={`${options.apiUrl}/${options.userId}/${draftId}`} recovery={recovery.variables} />
  );
}
function Editor({
  group,
  recovery,
}: {
  group?: GroupRecordResponse;
  recovery?: CreateGroupVariables;
}) {
  const { t } = useLingui(),
    options = useCommunityApi(),
    router = useRouter(),
    actions = useGroupRecordActions(options, group?.id),
    edit = useClientMutationDraft<EditGroupVariables>(
      groupRecordKeys.mutation(options, group?.id ?? "", "update"),
      group?.version,
    ),
    editDraft = group ? edit?.variables : undefined,
    checking = edit?.phase === "saving" || edit?.phase === "verifying";
  const [name, setName] = useState(
      editDraft?.clientDraft?.name ??
        editDraft?.input.name ??
        group?.name ??
        recovery?.clientDraft?.name ??
        recovery?.name ??
        "",
    ),
    [type, setType] = useState<"PRIVATE" | "PUBLIC">(group?.type ?? recovery?.type ?? "PRIVATE"),
    [baseVersion] = useState(group?.version ?? 0);
  const [location, setLocation] = useState<MatchLocation | undefined>(
      editDraft ? editDraft.input.location : (group?.location ?? recovery?.location),
    ),
    [logo, setLogo] = useState<{ id: string; preview: string } | null>(
      editDraft
        ? editDraft.input.logoAssetId
          ? { id: editDraft.input.logoAssetId, preview: editDraft.clientDraft?.logoPreview ?? "" }
          : null
        : group?.logoAssetId
          ? { id: group.logoAssetId, preview: group.logo ?? "" }
          : recovery?.logoAssetId
            ? { id: recovery.logoAssetId, preview: recovery.clientDraft?.logoPreview ?? "" }
            : null,
    );
  const [friends, setFriends] = useState<Friend[]>(recovery?.clientDraft?.friends ?? []),
    [picking, setPicking] = useState<"location" | "friend" | null>(null),
    [uploading, setUploading] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const conflict = Boolean(group && group.version !== baseVersion);
  const favorites = useFavoriteLocations(options, location ? [location] : []);
  const revision = {
    name,
    ...(location ? { location } : {}),
    ...(logo ? { logoAssetId: logo.id } : {}),
  };
  const valid = createGroupRecordSchema.safeParse({
    type,
    ...revision,
    invitedUserIds: type === "PRIVATE" && !group ? friends.map((user) => user.id) : [],
  });
  const save = () => {
    if (
      submitted.current ||
      conflict ||
      (group && (actions.busy || checking)) ||
      uploading ||
      !valid.success
    )
      return;
    const {
      type: _type,
      invitedUserIds: _invites,
      clientRequestId: _request,
      ...fields
    } = valid.data;
    submitted.current = true;
    setSubmitting(true);
    const clientDraft = { name, logoPreview: logo?.preview, friends };
    if (group)
      actions.update.mutate({
        id: group.id,
        input: { ...fields, version: baseVersion },
        clientDraft,
      });
    else
      actions.create.mutate({
        ...valid.data,
        clientRequestId: recovery?.clientRequestId,
        clientDraft,
      });
    router.replace(group ? `/groups/${group.id}` : "/groups");
  };
  if (picking === "location")
    return (
      <SearchLocationPage
        {...options}
        protectionBypass={options.protectionBypass ?? undefined}
        favorites={favorites}
        initial={location}
        onSelect={(value) => {
          setLocation(value);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    );
  if (picking === "friend")
    return (
      <PeoplePicker
        friendsOnly
        excludeIds={friends.map((user) => user.id)}
        onSelect={(user) => {
          setFriends((current) =>
            current.some((item) => item.id === user.id) ? current : [...current, user],
          );
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    );
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
      <div className="flex items-center gap-2">
        <Button isIconOnly variant="ghost" aria-label={t`Back`} onPress={() => router.back()}>
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold">{group ? t`Edit group` : t`New group`}</h1>
      </div>
      {!group ? (
        <Switch
          isDisabled={submitting}
          isSelected={type === "PUBLIC"}
          onChange={(selected) => setType(selected ? "PUBLIC" : "PRIVATE")}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            {t`Public group`}
          </Switch.Content>
        </Switch>
      ) : (
        <p className="text-sm text-default-500">
          {group.type === "PUBLIC" ? t`Public group` : t`Private group`}
        </p>
      )}
      <p className="text-sm text-default-500">
        {type === "PUBLIC"
          ? t`Public groups require a logo, verified venue and approval. Group type cannot be changed.`
          : t`Private groups are invitation-only. Logo and verified venue are optional. Group type cannot be changed.`}
      </p>
      {conflict ? (
        <p
          role="alert"
          className="text-danger"
        >{t`This group changed. Go back and reopen the editor before saving.`}</p>
      ) : null}
      {checking ? <p role="status">{t`Checking saved changes`}</p> : null}
      <TextField value={name} onChange={setName} isRequired isDisabled={submitting}>
        <SearchHelpLabel
          label={t`Group name`}
          helpTitle={t`Field help`}
          help={t`Choose a name, from 5 to 120 characters.`}
        />
        <Input name="group-name" autoComplete="off" minLength={5} maxLength={120} />
      </TextField>
      <GroupLogoPicker
        value={logo}
        required={type === "PUBLIC"}
        disabled={submitting}
        onChange={setLogo}
        onBusyChange={setUploading}
      />
      <GroupedList>
        <LocationListRow
          name={location?.name ?? t`Choose a verified address`}
          address={location?.address}
          label={t`Choose a verified address`}
          onPress={submitting || uploading ? undefined : () => setPicking("location")}
          leading={
            location ? (
              <LocationFavoriteButton location={location} favorites={favorites} />
            ) : undefined
          }
          actions={
            location && type === "PRIVATE" ? (
              <Button
                isIconOnly
                variant="danger-soft"
                size="sm"
                aria-label={t`Remove location`}
                isDisabled={submitting}
                onPress={() => setLocation(undefined)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : undefined
          }
        />
      </GroupedList>
      {favorites.status.isError ? (
        <p role="alert" className="text-danger">{t`Could not load favorite locations`}</p>
      ) : null}
      {!group && type === "PRIVATE" ? (
        <section className="space-y-2" aria-label={t`Invite friends`}>
          <h2 className="text-sm font-semibold">{t`Invite friends`}</h2>
          <GroupedList>
            {friends.map((user) => (
              <GroupedRow key={user.id}>
                <Avatar size="md">
                  <Avatar.Image src={user.avatarUrl ?? undefined} alt="" />
                  <Avatar.Fallback>{user.name.charAt(0)}</Avatar.Fallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{user.name}</span>
                  <span className="block truncate text-xs text-default-500">{user.email}</span>
                </span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  aria-label={`${t`Remove invite`}: ${user.name}`}
                  isDisabled={submitting}
                  onPress={() =>
                    setFriends((current) => current.filter((item) => item.id !== user.id))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </GroupedRow>
            ))}
          </GroupedList>
          <Button
            variant="outline"
            isDisabled={submitting || uploading}
            onPress={() => setPicking("friend")}
          >
            <UsersRound className="size-4" aria-hidden />
            <Plus className="size-4" aria-hidden />
            {t`Add friend`}
          </Button>
        </section>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Button
          className="mx-auto flex w-full max-w-3xl"
          variant="primary"
          isDisabled={
            submitting ||
            conflict ||
            Boolean(group && (actions.busy || checking)) ||
            uploading ||
            !valid.success
          }
          onPress={() => void save()}
        >
          {type === "PUBLIC" ? (
            <Send className="size-4" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {type === "PUBLIC" ? t`Submit for review` : group ? t`Save changes` : t`Create group`}
        </Button>
      </div>
    </section>
  );
}
