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
import { useAppStore } from "@board-game-organizer/store";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Save, Send, Trash2, UsersRound, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { LocationListRow } from "@/components/locations/LocationListRow";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { GroupLogoPicker } from "./GroupLogoPicker";

type Friend = { id: string; name: string; email: string | null; avatarUrl: string | null };
export function GroupWizard({ groupId, draftId }: { groupId?: string; draftId?: string }) {
  const t = useT(),
    options = useCommunityApi();
  const detail = useGroupRecord(
    { ...options, enabled: Boolean(groupId) && options.enabled !== false },
    groupId ?? "",
  );
  if (groupId && (communityAccessDenied(detail.error) || !detail.data || !detail.data.canEdit))
    return (
      <View style={{ padding: 20 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <View style={{ gap: 8 }}>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load group details")}
            </Typography>
            <Button variant="outline" onPress={() => void detail.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </View>
        )}
      </View>
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
    t = useT(),
    recovery = useGroupCreationDraft(options, draftId);
  if (!recovery || creationState(recovery).phase !== "failed")
    return (
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Could not recover draft")}
      </Typography>
    );
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
  const t = useT(),
    options = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    layout = useFloatingActionLayout(),
    actions = useGroupRecordActions(options, group?.id),
    edit = useClientMutationDraft<EditGroupVariables>(
      groupRecordKeys.mutation(options, group?.id ?? "", "update"),
      group?.version,
    ),
    editDraft = group ? edit?.variables : undefined,
    checking = edit?.phase === "saving" || edit?.phase === "verifying";
  const [accentForeground, danger] = useThemeColor(["accent-foreground", "danger"]);
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
    [picking, setPicking] = useState(false),
    [uploading, setUploading] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const conflict = Boolean(group && group.version !== baseVersion);
  const [pickerSlot] = useState(() => `group-draft-${Math.random().toString(36).slice(2)}`);
  const pendingUser = useAppStore((state) => state.pendingUser),
    clearPending = useAppStore((state) => state.clearPending);
  useEffect(() => {
    if (pendingUser?.slotId !== pickerSlot) return;
    setFriends((current) =>
      current.some((user) => user.id === pendingUser.user.id)
        ? current
        : [...current, pendingUser.user],
    );
    clearPending();
  }, [pendingUser, pickerSlot, clearPending]);
  const favorites = useFavoriteLocations(options, location ? [location] : []);
  const valid = createGroupRecordSchema.safeParse({
    type,
    name,
    ...(logo ? { logoAssetId: logo.id } : {}),
    ...(location ? { location } : {}),
    invitedUserIds: type === "PRIVATE" && !group ? friends.map((user) => user.id) : [],
  });
  const save = () => {
    if (
      !valid.success ||
      submitted.current ||
      conflict ||
      (group && (actions.busy || checking)) ||
      uploading
    )
      return;
    const {
      type: _type,
      invitedUserIds: _invited,
      clientRequestId: _request,
      ...revision
    } = valid.data;
    submitted.current = true;
    setSubmitting(true);
    const clientDraft = { name, logoPreview: logo?.preview, friends };
    if (group)
      actions.update.mutate({
        id: group.id,
        input: { ...revision, version: baseVersion },
        clientDraft,
      });
    else
      actions.create.mutate({
        ...valid.data,
        clientRequestId: recovery?.clientRequestId,
        clientDraft,
      });
    router.dismissTo(group ? `/group/${group.id}` : "/(tabs)/groups");
  };
  if (picking)
    return (
      <LocationPicker
        initial={location}
        onSelect={(value) => {
          setLocation(value);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    );
  const chooseFriend = () =>
    router.push({
      pathname: "/group/search-user",
      params: {
        slotId: pickerSlot,
        source: "group",
        exclude: friends.map((user) => user.id).join(","),
      },
    });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + 56}
    >
      <Stack.Screen
        options={{
          title: group ? t("Edit group") : t("New group"),
          headerTitle: ({ children }) => <HeaderTitle title={children} icon={UsersRound} />,
          headerLeft: undefined,
          headerBackVisible: true,
        }}
      />
      <FlatList
        style={{ flex: 1 }}
        data={!group && type === "PRIVATE" ? friends : []}
        keyExtractor={(user) => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: layout.paddingBottom }}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            {!group ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <Typography className="text-foreground">{t("Public group")}</Typography>
                <Switch
                  isDisabled={submitting}
                  testID="group-public-switch"
                  accessibilityLabel={t("Public group")}
                  isSelected={type === "PUBLIC"}
                  onSelectedChange={(selected) => setType(selected ? "PUBLIC" : "PRIVATE")}
                />
              </View>
            ) : (
              <Typography className="text-muted">
                {group.type === "PUBLIC" ? t("Public group") : t("Private group")}
              </Typography>
            )}
            <Typography className="text-muted">
              {type === "PUBLIC"
                ? t(
                    "Public groups require a logo, verified venue and approval. Group type cannot be changed.",
                  )
                : t(
                    "Private groups are invitation-only. Logo and verified venue are optional. Group type cannot be changed.",
                  )}
            </Typography>
            <SearchHelpLabel
              label={t("Group name")}
              helpTitle={t("Field help")}
              help={t("Choose a name, from 5 to 120 characters.")}
            />
            {conflict ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("This group changed. Go back and reopen the editor before saving.")}
              </Typography>
            ) : null}
            {checking ? (
              <Typography accessibilityLiveRegion="polite" className="text-foreground">
                {t("Checking saved changes")}
              </Typography>
            ) : null}
            <Input
              editable={!submitting}
              accessibilityLabel={t("Group name")}
              value={name}
              onChangeText={setName}
              maxLength={120}
            />
            <GroupLogoPicker
              value={logo}
              required={type === "PUBLIC"}
              disabled={submitting}
              onChange={setLogo}
              onBusyChange={setUploading}
            />
            <GroupedList>
              <LocationListRow
                name={location?.name ?? t("Choose a verified address")}
                accessibilityLabel={t("Choose a verified address")}
                address={location?.address}
                onPress={submitting || uploading ? undefined : () => setPicking(true)}
                leading={
                  location ? (
                    <LocationFavoriteButton location={location} favorites={favorites} />
                  ) : undefined
                }
                actions={
                  location && type === "PRIVATE" ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      accessibilityLabel={t("Remove location")}
                      isDisabled={submitting}
                      onPress={() => setLocation(undefined)}
                    >
                      <X size={18} color={danger} />
                    </Button>
                  ) : undefined
                }
              />
            </GroupedList>
            {favorites.status.isError ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load favorite locations")}
              </Typography>
            ) : null}
            {!group && type === "PRIVATE" ? (
              <Typography className="font-semibold text-foreground">
                {t("Invite friends")}
              </Typography>
            ) : null}
          </View>
        }
        renderItem={({ item: user }) => (
          <GroupedList>
            <UserListRow
              name={user.name}
              avatarUrl={user.avatarUrl}
              secondary={user.email}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  accessibilityLabel={`${t("Remove invite")}: ${user.name}`}
                  isDisabled={submitting}
                  onPress={() =>
                    setFriends((current) => current.filter((item) => item.id !== user.id))
                  }
                >
                  <Trash2 size={18} color={danger} />
                </Button>
              }
            />
          </GroupedList>
        )}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {!group && type === "PRIVATE" ? (
              <AddUserRow label={t("Add friend")} onPress={chooseFriend} isDisabled={submitting} />
            ) : null}
          </View>
        }
      />
      <FloatingActions
        label={
          type === "PUBLIC" ? t("Submit for review") : group ? t("Save changes") : t("Create group")
        }
        testID="save-group-fab"
        variant="primary"
        onPress={() => void save()}
        isDisabled={
          !valid.success ||
          submitting ||
          conflict ||
          Boolean(group && (actions.busy || checking)) ||
          uploading
        }
      >
        {type === "PUBLIC" ? (
          <Send size={26} color={accentForeground} />
        ) : (
          <Save size={26} color={accentForeground} />
        )}
      </FloatingActions>
    </KeyboardAvoidingView>
  );
}
