import type { ContactUser } from "@board-game-organizer/shared";
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
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/i18n";
import { type FriendRequestContext, type UserActionKey, userActionKeys } from "@/lib/user-actions";

export type UserActionConfirmation =
  | "block"
  | "unfriend"
  | "friend_request"
  | "accept_friend_request"
  | "reject_friend_request"
  | "cancel_friend_request"
  | "respond_friend_request";

export interface UserActionItem {
  key: UserActionKey;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Bottom-sheet-style action menu for a contact row: relationship,
 * block/unblock, view profile (disabled for now). Triggered by the ⋯
 * kebab button next to the follow button.
 *
 * `busy` disables the rows while a mutation is in flight (the list cards
 * already grey out via isBusy, but this sheet is rendered separately) and
 * `error` surfaces a failed mutation instead of failing silently.
 */
export function UserActionsSheet({
  visible,
  user,
  busy,
  error,
  canSendFriendRequest = false,
  friendRequest,
  initialConfirmAction,
  onClose,
  onAction,
}: {
  visible: boolean;
  user: ContactUser | null;
  busy?: boolean;
  error?: string | null;
  canSendFriendRequest?: boolean;
  friendRequest?: FriendRequestContext;
  initialConfirmAction?: UserActionConfirmation;
  onClose: () => void;
  onAction: (key: UserActionItem["key"]) => Promise<void>;
}) {
  const t = useT();
  const [confirmAction, setConfirmAction] = useState<UserActionConfirmation | null>(null);

  // Reset the confirmation state whenever the sheet closes (Cancel button,
  // backdrop tap, or after an action), so opening it on ANOTHER contact never
  // shows the previous block-confirmation.
  useEffect(() => {
    if (!visible) setConfirmAction(null);
    else if (initialConfirmAction) setConfirmAction(initialConfirmAction);
  }, [visible, initialConfirmAction]);

  if (!user) return null;

  const labels: Record<UserActionKey, string> = {
    follow: t("Follow"),
    unfollow: t("Unfollow"),
    unfriend: t("Remove friend"),
    friend_request: t("Send friend request"),
    accept_friend_request: t("Accept friend request"),
    reject_friend_request: t("Decline friend request"),
    cancel_friend_request: t("Cancel friend request"),
    block: t("Block"),
    unblock: t("Unblock"),
    profile: t("View profile"),
  };
  const items: UserActionItem[] = userActionKeys(user, canSendFriendRequest, friendRequest).map(
    (key) => ({
      key,
      label: labels[key],
      destructive:
        key === "block" ||
        key === "unfriend" ||
        key === "reject_friend_request" ||
        key === "cancel_friend_request",
      disabled: key === "profile",
    }),
  );

  const icons: Record<UserActionItem["key"], React.ReactNode> = {
    follow: <UserPlus size={18} color="#111" />,
    unfollow: <UserMinus size={18} color="#111" />,
    unfriend: <UserRoundX size={18} color="#dc2626" />,
    block: <Ban size={18} color="#dc2626" />,
    unblock: <Ban size={18} color="#111" />,
    friend_request: <UserRoundPlus size={18} color="#111" />,
    accept_friend_request: <Check size={18} color="#111" />,
    reject_friend_request: <X size={18} color="#dc2626" />,
    cancel_friend_request: <X size={18} color="#dc2626" />,
    profile: <Eye size={18} color="#9ca3af" />,
  };

  const runAction = async (key: UserActionItem["key"]) => {
    try {
      await onAction(key);
      onClose();
    } catch {
      // Mutation error remains visible in the open sheet.
    }
  };

  const handleItem = (item: UserActionItem) => {
    if (item.disabled || busy) return;
    if (
      item.key === "block" ||
      item.key === "unfriend" ||
      item.key === "friend_request" ||
      item.key === "accept_friend_request" ||
      item.key === "reject_friend_request" ||
      item.key === "cancel_friend_request"
    ) {
      setConfirmAction(item.key);
      return;
    }
    void runAction(item.key);
  };

  const confirmation = (() => {
    switch (confirmAction) {
      case "block":
        return {
          title: t("Block contact"),
          text: t(
            "You will no longer see each other or find each other. Follow and friendships will be removed.",
          ),
          label: t("Block"),
          danger: true,
          icon: <Ban size={18} color="#fff" />,
        };
      case "unfriend":
        return {
          title: t("Remove friend?"),
          text: t("The friendship and your follow will be removed."),
          label: t("Remove friend"),
          danger: true,
          icon: <UserRoundX size={18} color="#fff" />,
        };
      case "friend_request":
        return {
          title: t("Send friend request?"),
          text: t("They can accept or decline your request."),
          label: t("Send request"),
          danger: false,
          icon: <UserRoundPlus size={18} color="#fff" />,
        };
      case "accept_friend_request":
        return {
          title: t("Accept friend request?"),
          text: t("You will become friends and follow each other."),
          label: t("Accept"),
          danger: false,
          icon: <Check size={18} color="#fff" />,
        };
      case "reject_friend_request":
        return {
          title: t("Decline friend request?"),
          text: t("The friend request will be declined."),
          label: t("Decline"),
          danger: true,
          icon: <X size={18} color="#fff" />,
        };
      case "cancel_friend_request":
        return {
          title: t("Cancel friend request?"),
          text: t("The sent friend request will be removed."),
          label: t("Cancel request"),
          danger: true,
          icon: <X size={18} color="#fff" />,
        };
      case "respond_friend_request":
        return {
          title: t("Respond to friend request"),
          text: t("Accept or decline this friend request."),
          label: "",
          danger: false,
          icon: null,
        };
      default:
        return null;
    }
  })();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{user.name}</Text>

          {confirmAction && confirmation ? (
            <View>
              <Text style={styles.confirmTitle}>{confirmation.title}</Text>
              <Text style={styles.confirmText}>{confirmation.text}</Text>
              <View style={styles.confirmRow}>
                {confirmAction === "respond_friend_request" ? (
                  <>
                    <Pressable
                      style={[styles.item, styles.itemDanger, busy && styles.itemBusy]}
                      disabled={busy}
                      testID="respond-reject-friend-request-btn"
                      onPress={() => void runAction("reject_friend_request")}
                    >
                      <X size={18} color="#fff" />
                      <Text style={styles.itemTextWhite}>{t("Decline")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.item, styles.itemPrimary, busy && styles.itemBusy]}
                      disabled={busy}
                      testID="respond-accept-friend-request-btn"
                      onPress={() => void runAction("accept_friend_request")}
                    >
                      <Check size={18} color="#fff" />
                      <Text style={styles.itemTextWhite}>{t("Accept")}</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={[
                      styles.item,
                      confirmation.danger ? styles.itemDanger : styles.itemPrimary,
                      busy && styles.itemBusy,
                    ]}
                    disabled={busy}
                    testID={
                      confirmAction === "block"
                        ? "confirm-block-btn"
                        : confirmAction === "friend_request"
                          ? "confirm-friend-request-btn"
                          : `confirm-${confirmAction}-btn`
                    }
                    onPress={() => void runAction(confirmAction)}
                  >
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : confirmation.icon}
                    <Text style={styles.itemTextWhite}>{confirmation.label}</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.item, styles.confirmCancel, busy && styles.itemBusy]}
                  disabled={busy}
                  testID="cancel-confirmation-btn"
                  onPress={() => setConfirmAction(null)}
                >
                  <X size={18} color="#111" />
                  <Text style={styles.itemText}>{t("Cancel")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.item, (item.disabled || busy) && styles.itemBusy]}
                  disabled={item.disabled || busy}
                  onPress={() => handleItem(item)}
                >
                  {icons[item.key]}
                  <Text
                    style={[
                      styles.itemText,
                      item.destructive && styles.itemTextDanger,
                      (item.disabled || busy) && styles.itemTextDisabled,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {busy && <ActivityIndicator size="small" color="#111" />}
                </Pressable>
              ))}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.cancel} disabled={busy} onPress={onClose}>
            <Text style={styles.cancelText}>{t("Cancel")}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  confirmTitle: { fontSize: 16, fontWeight: "600", color: "#111", marginBottom: 6 },
  confirmText: { fontSize: 14, color: "#374151", marginBottom: 12 },
  confirmRow: {
    flexDirection: "column",
    gap: 8,
  },
  confirmCancel: {
    flex: 1,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  itemDanger: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    padding: 12,
    borderBottomWidth: 0,
    flex: 1,
    justifyContent: "center",
  },
  itemPrimary: {
    backgroundColor: "#006fee",
    borderRadius: 8,
    padding: 12,
    borderBottomWidth: 0,
    flex: 1,
    justifyContent: "center",
  },
  itemBusy: { opacity: 0.6 },
  itemText: { fontSize: 15, color: "#111" },
  itemTextWhite: { fontSize: 15, color: "#fff", fontWeight: "600" },
  itemTextDanger: { fontSize: 15, color: "#dc2626", fontWeight: "600" },
  itemTextDisabled: { color: "#9ca3af" },
  error: { marginTop: 10, fontSize: 13, color: "#dc2626", textAlign: "center" },
  cancel: { marginTop: 12, alignItems: "center", paddingVertical: 12 },
  cancelText: { fontSize: 15, color: "#006fee", fontWeight: "600" },
});
