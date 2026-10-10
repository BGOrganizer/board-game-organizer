import type { GroupResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useContacts, useGroups } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Save, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { useSessionAuth } from "@/lib/useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
type InvitedUser = { id: string; name: string; email: string | null; avatarUrl: string | null };
type Slot = { id: string; user: InvitedUser | null };
const newSlot = (): Slot => ({ id: `group-${Math.random().toString(36).slice(2)}`, user: null });

function Editor({
  group,
  groups,
  token,
  getToken,
  userId,
}: {
  group?: GroupResponse;
  groups: ReturnType<typeof useGroups>;
  token: string | null;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
}) {
  const t = useT();
  const router = useRouter();
  const feedback = useMutationFeedback();
  const contacts = useContacts(apiUrl, token, getToken, undefined, userId, feedback);
  const pendingUser = useAppStore((s) => s.pendingUser);
  const clearPending = useAppStore((s) => s.clearPending);
  const [name, setName] = useState(group?.name ?? "");
  const [isPublic, setIsPublic] = useState(group?.isPublic ?? false);
  const [slots, setSlots] = useState<Slot[]>(() => {
    const invited =
      group?.invitations
        .filter((item) => item.status !== "DECLINED")
        .map((item) => ({
          id: newSlot().id,
          user: group.memberProfiles.find((member) => member.id === item.inviteeUserId) ?? {
            id: item.inviteeUserId,
            name: item.inviteeUserId,
            email: null,
            avatarUrl: null,
          },
        })) ?? [];
    return [...invited, newSlot()];
  });
  useEffect(() => {
    if (!pendingUser || !slots.some((slot) => slot.id === pendingUser.slotId)) return;
    setSlots((current) =>
      current.some(
        (slot) => slot.id !== pendingUser.slotId && slot.user?.id === pendingUser.user.id,
      )
        ? current
        : current.map((slot) =>
            slot.id === pendingUser.slotId ? { ...slot, user: pendingUser.user } : slot,
          ),
    );
    clearPending();
  }, [pendingUser, slots, clearPending]);

  const save = async () => {
    const input = {
      name: name.trim(),
      isPublic,
      invitedUserIds: slots.flatMap((slot) => (slot.user ? [slot.user.id] : [])),
    };
    try {
      if (group) await groups.update.mutateAsync({ id: group.id, input });
      else await groups.create.mutateAsync(input);
      router.back();
    } catch {
      // Shared mutation feedback handles rollback and failure toast.
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenScrollView>
        <Input
          accessibilityLabel={t("Group name")}
          value={name}
          onChangeText={setName}
          placeholder={t("Group name")}
          maxLength={120}
        />
        {name.length > 0 && name.trim().length < 5 ? (
          <Typography className="text-danger">{t("At least 5 characters")}</Typography>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Typography>{t("Public group")}</Typography>
          <Switch
            accessibilityLabel={t("Public group")}
            testID="group-public-switch"
            isSelected={isPublic}
            onSelectedChange={setIsPublic}
          />
        </View>
        <Typography className="text-muted" style={{ fontSize: 13 }}>
          {t(
            "Public group search and join requests will be available later. Only the admin can invite friends now.",
          )}
        </Typography>
        <Typography style={{ fontWeight: "600" }}>{t("Invite friends")}</Typography>
        {contacts.friends.isPending ? (
          <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
        ) : null}
        {contacts.friends.isError ? (
          <Typography className="text-danger">{t("Could not load friends")}</Typography>
        ) : null}
        <View style={{ gap: 8 }}>
          {slots.map((slot) => {
            const friend = contacts.friends.data?.find(
              (row) => row.profile?.id === slot.user?.id,
            )?.profile;
            const user = friend ?? slot.user;
            const select = () =>
              router.push({
                pathname: "/match/search-user",
                params: {
                  slotId: slot.id,
                  source: "group",
                  exclude: slots
                    .flatMap((item) => (item.id !== slot.id && item.user ? [item.user.id] : []))
                    .join(","),
                },
              });
            const remove = (
              <Button
                key={slot.id}
                isIconOnly
                size="sm"
                variant="danger-soft"
                accessibilityLabel={t("Remove invite")}
                style={{ minWidth: 44, minHeight: 44 }}
                onPress={() =>
                  setSlots((current) =>
                    current.length > 1
                      ? current.filter((item) => item.id !== slot.id)
                      : current.map((item) =>
                          item.id === slot.id ? { ...item, user: null } : item,
                        ),
                  )
                }
              >
                <Trash2 color="#dc2626" size={16} />
              </Button>
            );
            return user ? (
              <GroupedList key={slot.id}>
                <UserListRow
                  name={user.name}
                  avatarUrl={user.avatarUrl}
                  secondary={user.email}
                  accessibilityLabel={`${t("Select a friend")}: ${user.name}`}
                  onPress={select}
                  actions={remove}
                />
              </GroupedList>
            ) : (
              <AddUserRow
                key={slot.id}
                label={t("Select a friend")}
                onPress={select}
                actions={remove}
              />
            );
          })}
        </View>
        <AddUserRow
          label={t("Add friend")}
          onPress={() => setSlots((current) => [...current, newSlot()])}
        />
      </ScreenScrollView>

      <FloatingActions
        label={group ? "Save changes" : "Create group"}
        testID="save-group-fab"
        onPress={save}
        isDisabled={name.trim().length < 5 || groups.create.isPending || groups.update.isPending}
        variant="primary"
      >
        <Save color="#fff" size={26} />
      </FloatingActions>
    </View>
  );
}

export function GroupWizard({ groupId }: { groupId?: string }) {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((value) => {
        if (active) setToken(value ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);
  const groups = useGroups({ apiUrl, token, getToken, userId, feedback, groupId });
  const group = groups.detail.data?.group;
  if (groupId && (!group || group.adminUserId !== userId))
    return (
      <View style={{ padding: 20 }}>
        {groups.detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <Typography className="text-danger">{t("Could not load group details")}</Typography>
        )}
      </View>
    );
  return (
    <Editor
      key={groupId ?? "new"}
      group={group}
      groups={groups}
      token={token}
      getToken={getToken}
      userId={userId}
    />
  );
}
