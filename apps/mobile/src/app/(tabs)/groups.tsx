import type { GroupResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useContacts, useGroups } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
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
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

export default function GroupsScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState<GroupResponse | "new" | null>(null);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
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
  const groups = useGroups({ apiUrl, token, getToken, userId, feedback });
  const contacts = useContacts(apiUrl, token, getToken, undefined, userId);
  const startEdit = (group?: GroupResponse) => {
    setEditing(group ?? "new");
    setName(group?.name ?? "");
    setIsPublic(group?.isPublic ?? false);
    setSelected(
      group?.invitations
        .filter((item) => item.status !== "DECLINED")
        .map((item) => item.inviteeUserId) ?? [],
    );
  };
  const save = async () => {
    const input = { name: name.trim(), isPublic, invitedUserIds: selected };
    try {
      if (editing === "new") await groups.create.mutateAsync(input);
      else if (editing) await groups.update.mutateAsync({ id: editing.id, input });
      setEditing(null);
    } catch {
      /* Shared mutation shows failure and restores cached state. */
    }
  };
  const confirm = (group: GroupResponse, action: "delete" | "leave") => {
    Alert.alert(
      action === "delete" ? t("Delete group?") : t("Leave group?"),
      action === "delete"
        ? t("Group will be archived. Existing confirmed match results and ratings remain.")
        : t("You will need a new invitation to rejoin."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: action === "delete" ? t("Delete group") : t("Leave group"),
          style: "destructive",
          onPress: () => {
            if (groups.archive.isPending || groups.leave.isPending) return;
            if (action === "delete") groups.archive.mutate(group.id);
            else groups.leave.mutate(group.id);
          },
        },
      ],
    );
  };

  if (editing)
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 90, gap: 16 }}>
          <Typography style={{ fontSize: 20, fontWeight: "600" }}>
            {editing === "new" ? t("Create group") : t("Edit group")}
          </Typography>
          <Typography>{t("Group name")}</Typography>
          <Input
            value={name}
            onChangeText={setName}
            maxLength={120}
            accessibilityLabel={t("Group name")}
          />
          {name.length > 0 && name.trim().length < 5 ? (
            <Typography className="text-danger">{t("At least 5 characters")}</Typography>
          ) : null}
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t("Public group")}
            accessibilityState={{ checked: isPublic }}
            onPress={() => setIsPublic((value) => !value)}
            className="flex-row items-center justify-between rounded-xl border border-default-200 p-4"
          >
            <Typography>{t("Public group")}</Typography>
            <View
              className={
                isPublic
                  ? "rounded-full bg-accent px-3 py-1"
                  : "rounded-full bg-default-200 px-3 py-1"
              }
            >
              <Typography className={isPublic ? "text-white" : "text-foreground"}>
                {isPublic ? t("Public") : t("Private")}
              </Typography>
            </View>
          </Pressable>
          <Typography className="text-muted">
            {t(
              "Public group search and join requests will be available later. Only the admin can invite friends now.",
            )}
          </Typography>
          <Typography style={{ fontWeight: "600" }}>{t("Invite friends")}</Typography>
          {contacts.friends.isPending ? (
            <Skeleton style={{ width: "100%", height: 56, borderRadius: 12 }} />
          ) : null}
          {contacts.friends.isError ? (
            <Typography className="text-danger">{t("Could not load friends")}</Typography>
          ) : null}
          {contacts.friends.data?.length === 0 ? (
            <Typography className="text-muted">{t("No friends to invite yet")}</Typography>
          ) : null}
          {contacts.friends.data?.map((row) => {
            const profile = row.profile;
            return profile ? (
              <Pressable
                key={profile.id}
                accessibilityRole="checkbox"
                accessibilityLabel={profile.name}
                accessibilityState={{ checked: selected.includes(profile.id) }}
                onPress={() =>
                  setSelected((ids) =>
                    ids.includes(profile.id)
                      ? ids.filter((id) => id !== profile.id)
                      : [...ids, profile.id],
                  )
                }
                className="flex-row items-center justify-between rounded-xl border border-default-200 p-4"
              >
                <Typography>{profile.name}</Typography>
                {selected.includes(profile.id) ? (
                  <Check size={20} color="#006fee" />
                ) : (
                  <View style={{ width: 20 }} />
                )}
              </Pressable>
            ) : null;
          })}
          {selected
            .filter((id) => !contacts.friends.data?.some((row) => row.profile?.id === id))
            .map((id) => (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={id}
                accessibilityState={{ checked: true }}
                onPress={() => setSelected((ids) => ids.filter((item) => item !== id))}
                className="flex-row items-center justify-between rounded-xl border border-default-200 p-4"
              >
                <Typography>
                  {editing !== "new"
                    ? (editing.memberProfiles.find((user) => user.id === id)?.name ?? id)
                    : id}
                </Typography>
                <Check size={20} color="#006fee" />
              </Pressable>
            ))}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="ghost" onPress={() => setEditing(null)}>
              {t("Cancel")}
            </Button>
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
              {editing === "new" ? t("Create group") : t("Save")}
            </Button>
          </View>
        </ScrollView>
      </View>
    );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 12 }}>
        {groups.list.isPending
          ? [1, 2, 3].map((id) => (
              <Skeleton key={id} style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ))
          : null}
        {groups.list.isError ? (
          <Typography className="text-danger">{t("Could not load groups")}</Typography>
        ) : null}
        {groups.list.data?.length === 0 ? (
          <Typography className="text-muted">{t("No groups yet")}</Typography>
        ) : null}
        {groups.list.data?.map((group) => {
          const admin = group.adminUserId === userId;
          const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
          return (
            <Card
              key={group.id}
              className="w-full p-3"
              style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%" }}
            >
              <View
                className="bg-accent/10"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UsersRound size={26} color="#006fee" />
                {admin ? (
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t("Group admin")}
                    style={{ position: "absolute", top: 0, left: 0 }}
                  >
                    <Crown size={16} color="#f59e0b" />
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Typography numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>
                    {group.name}
                  </Typography>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    {group.isPublic ? (
                      <LockKeyholeOpen size={14} color="#6b7280" />
                    ) : (
                      <LockKeyhole size={14} color="#6b7280" />
                    )}
                    <Typography className="text-muted" style={{ fontSize: 12 }}>
                      {group.isPublic ? t("Public") : t("Private")}
                    </Typography>
                  </View>
                </View>
                <Typography className="text-muted" style={{ fontSize: 13 }}>
                  {group.memberCount} {group.memberCount === 1 ? t("member") : t("members")}
                </Typography>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 4 }}>
                  {invitation?.status === "PENDING" ? (
                    <>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={t("Accept group invitation")}
                        isDisabled={groups.respond.isPending}
                        onPress={() =>
                          groups.respond.mutate({ invitationId: invitation.id, decision: "accept" })
                        }
                      >
                        <Check size={18} color="#17c964" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={t("Decline group invitation")}
                        isDisabled={groups.respond.isPending}
                        onPress={() =>
                          groups.respond.mutate({
                            invitationId: invitation.id,
                            decision: "decline",
                          })
                        }
                      >
                        <X size={18} color="#f31260" />
                      </Button>
                    </>
                  ) : null}
                  {admin ? (
                    <>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={t("Edit group")}
                        onPress={() => startEdit(group)}
                      >
                        <Pencil size={18} color="#6b7280" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="danger-soft"
                        accessibilityLabel={t("Delete group")}
                        onPress={() => confirm(group, "delete")}
                      >
                        <Trash2 size={18} color="#dc2626" />
                      </Button>
                    </>
                  ) : invitation?.status === "ACCEPTED" ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      accessibilityLabel={t("Leave group")}
                      onPress={() => confirm(group, "leave")}
                    >
                      <X size={18} color="#dc2626" />
                    </Button>
                  ) : null}
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Create group")}
        testID="create-group-fab"
        onPress={() => startEdit()}
        style={{
          position: "absolute",
          right: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#006fee",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plus color="#fff" size={26} />
      </Pressable>
    </View>
  );
}
