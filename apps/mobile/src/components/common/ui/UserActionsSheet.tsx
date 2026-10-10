import type { ContactUser } from "@board-game-organizer/shared";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  Ban,
  Check,
  Eye,
  UserMinus,
  UserPlus,
  UserRoundPlus,
  UserRoundX,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type FriendRequestContext,
  type UserActionKey,
  userActionKeys,
} from "@/lib/contacts/user-actions";
import { useT } from "@/lib/i18n";

export type UserActionConfirmation =
  | Exclude<UserActionKey, "follow" | "unfollow" | "profile">
  | "respond_friend_request";
export interface UserActionItem {
  key: UserActionKey;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}

export function UserActionsSheet({
  visible,
  user,
  busy,
  canSendFriendRequest = false,
  friendRequest,
  matchContext = false,
  blockLabel,
  initialConfirmAction,
  onClose,
  onAction,
}: {
  visible: boolean;
  user: ContactUser | null;
  busy?: boolean;
  canSendFriendRequest?: boolean;
  friendRequest?: FriendRequestContext;
  matchContext?: boolean;
  blockLabel?: string;
  initialConfirmAction?: UserActionConfirmation;
  onClose: () => void;
  onAction: (key: UserActionKey) => Promise<void>;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [foreground, danger, accentForeground, muted] = useThemeColor([
    "foreground",
    "danger",
    "accent-foreground",
    "muted",
  ]);
  const [confirmAction, setConfirmAction] = useState<UserActionConfirmation | null>(null);
  useEffect(() => {
    setConfirmAction(visible && user?.id ? (initialConfirmAction ?? null) : null);
  }, [visible, initialConfirmAction, user?.id]);
  const labels: Record<UserActionKey, string> = {
    follow: t("Follow"),
    unfollow: t("Unfollow"),
    unfriend: t("Remove friend"),
    friend_request: t("Send friend request"),
    accept_friend_request: t("Accept friend request"),
    reject_friend_request: t("Decline friend request"),
    cancel_friend_request: t("Cancel friend request"),
    block: blockLabel ?? t("Block"),
    unblock: t("Unblock"),
    profile: t("View profile"),
  };
  const icons = {
    follow: UserPlus,
    unfollow: UserMinus,
    unfriend: UserRoundX,
    block: Ban,
    unblock: Ban,
    friend_request: UserRoundPlus,
    accept_friend_request: Check,
    reject_friend_request: X,
    cancel_friend_request: X,
    profile: Eye,
  };
  const destructive = (key: UserActionKey) =>
    key === "block" ||
    key === "unfriend" ||
    key === "reject_friend_request" ||
    key === "cancel_friend_request";
  const run = (key: UserActionKey) => {
    if (busy) return;
    const result = onAction(key);
    onClose();
    // Query mutation owns rollback and localized feedback.
    void result.catch(() => {});
  };
  const confirmation = (() => {
    switch (confirmAction) {
      case "block":
        return {
          title: t("Block contact"),
          text: t(
            "You will no longer see each other or find each other. Follow and friendships will be removed.",
          ),
          label: blockLabel ?? t("Block"),
        };
      case "unblock":
        return {
          title: t("Unblock contact?"),
          text: t("This contact will no longer be blocked."),
          label: t("Unblock"),
        };
      case "unfriend":
        return {
          title: t("Remove friend?"),
          text: t("The friendship and your follow will be removed."),
          label: t("Remove friend"),
        };
      case "friend_request":
        return {
          title: t("Send friend request?"),
          text: t("They can accept or decline your request."),
          label: t("Send request"),
        };
      case "accept_friend_request":
        return {
          title: t("Accept friend request?"),
          text: t("You will become friends and follow each other."),
          label: t("Accept"),
        };
      case "reject_friend_request":
        return {
          title: t("Decline friend request?"),
          text: t("The friend request will be declined."),
          label: t("Decline"),
        };
      case "cancel_friend_request":
        return {
          title: t("Cancel friend request?"),
          text: t("The sent friend request will be removed."),
          label: t("Cancel request"),
        };
      case "respond_friend_request":
        return {
          title: t("Respond to friend request"),
          text: t("Accept or decline this friend request."),
          label: "",
        };
      default:
        return null;
    }
  })();
  const confirmKeys: UserActionKey[] =
    confirmAction === "respond_friend_request"
      ? ["accept_friend_request", "reject_friend_request"]
      : confirmAction
        ? [confirmAction]
        : [];
  return (
    <BottomSheet
      isOpen={visible && Boolean(user)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content enablePanDownToClose={!busy}>
          <View style={{ gap: 12, paddingBottom: Math.max(insets.bottom, 16) }}>
            <BottomSheet.Title>{user?.name}</BottomSheet.Title>
            {confirmation ? (
              <>
                <Typography className="font-semibold text-foreground">
                  {confirmation.title}
                </Typography>
                <BottomSheet.Description>
                  {confirmation.text}
                  {confirmAction === "block" && matchContext
                    ? ` ${t("Players remain in this match until they leave or are removed.")}`
                    : ""}
                </BottomSheet.Description>
                {confirmKeys.map((key) => {
                  const Icon = icons[key];
                  return (
                    <Button
                      key={key}
                      isDisabled={busy}
                      variant={destructive(key) ? "danger" : "primary"}
                      testID={
                        confirmAction === "respond_friend_request"
                          ? key === "accept_friend_request"
                            ? "respond-accept-friend-request-btn"
                            : "respond-reject-friend-request-btn"
                          : key === "block"
                            ? "confirm-block-btn"
                            : key === "friend_request"
                              ? "confirm-friend-request-btn"
                              : `confirm-${key}-btn`
                      }
                      onPress={() => run(key)}
                    >
                      <Icon size={18} color={accentForeground} />
                      <Button.Label>
                        {confirmAction === "respond_friend_request"
                          ? key === "accept_friend_request"
                            ? t("Accept")
                            : t("Decline")
                          : confirmation.label}
                      </Button.Label>
                    </Button>
                  );
                })}
                <Button
                  variant="ghost"
                  isDisabled={busy}
                  testID="cancel-confirmation-btn"
                  onPress={() => setConfirmAction(null)}
                >
                  <X size={18} color={foreground} />
                  <Button.Label>{t("Cancel")}</Button.Label>
                </Button>
              </>
            ) : (
              (user ? userActionKeys(user, canSendFriendRequest, friendRequest) : []).map((key) => {
                const Icon = icons[key];
                return (
                  <Button
                    key={key}
                    variant="ghost"
                    isDisabled={busy || key === "profile"}
                    style={{ justifyContent: "flex-start", minHeight: 44 }}
                    onPress={() => {
                      if (key === "profile" || busy) return;
                      if (key === "follow" || key === "unfollow") run(key);
                      else setConfirmAction(key);
                    }}
                  >
                    <Icon
                      size={18}
                      color={key === "profile" ? muted : destructive(key) ? danger : foreground}
                    />
                    <Button.Label>{labels[key]}</Button.Label>
                  </Button>
                );
              })
            )}
            {!confirmation ? (
              <Button variant="ghost" isDisabled={busy} onPress={onClose}>
                {t("Cancel")}
              </Button>
            ) : null}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
