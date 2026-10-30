"use client";
import {
  createGroupRecordSchema,
  type GroupRecordResponse,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useFavoriteLocations,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Avatar, Button, Input, Skeleton, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Plus, Save, Send, Trash2, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
export function GroupWizard({ groupId }: { groupId?: string }) {
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
  return (
    <Editor
      key={`${options.userId}/${groupId ?? "new"}`}
      group={groupId ? detail.data : undefined}
    />
  );
}
function Editor({ group }: { group?: GroupRecordResponse }) {
  const { t } = useLingui(),
    options = useCommunityApi(),
    router = useRouter(),
    actions = useGroupRecordActions(options, group?.id);
  const [name, setName] = useState(group?.name ?? ""),
    [type, setType] = useState<"PRIVATE" | "PUBLIC">(group?.type ?? "PRIVATE"),
    [baseVersion] = useState(group?.version ?? 0);
  const [location, setLocation] = useState<MatchLocation | undefined>(group?.location),
    [logo, setLogo] = useState<{ id: string; preview: string } | null>(
      group?.logoAssetId ? { id: group.logoAssetId, preview: group.logo ?? "" } : null,
    );
  const [friends, setFriends] = useState<Friend[]>([]),
    [picking, setPicking] = useState<"location" | "friend" | null>(null),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
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
  const save = async () => {
    if (actions.busy || uploading || !valid.success) return;
    const { type: _type, invitedUserIds: _invites, ...fields } = valid.data;
    setError("");
    try {
      const row = group
        ? await actions.update.mutateAsync({
            id: group.id,
            input: { ...fields, version: baseVersion },
          })
        : await actions.create.mutateAsync(valid.data);
      router.replace(group ? `/groups/${row.id}` : "/groups");
    } catch {
      setError(t`Could not save group`);
    }
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
          isDisabled={actions.busy}
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
      <TextField value={name} onChange={setName} isRequired isDisabled={actions.busy}>
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
        disabled={actions.busy}
        onChange={setLogo}
        onBusyChange={setUploading}
      />
      <GroupedList>
        <LocationListRow
          name={location?.name ?? t`Choose a verified address`}
          address={location?.address}
          label={t`Choose a verified address`}
          onPress={actions.busy || uploading ? undefined : () => setPicking("location")}
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
                isDisabled={actions.busy || uploading}
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
                  isDisabled={actions.busy || uploading}
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
            isDisabled={uploading || actions.busy}
            onPress={() => setPicking("friend")}
          >
            <UsersRound className="size-4" aria-hidden />
            <Plus className="size-4" aria-hidden />
            {t`Add friend`}
          </Button>
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Button
          className="mx-auto flex w-full max-w-3xl"
          variant="primary"
          isDisabled={actions.busy || uploading || !valid.success}
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
