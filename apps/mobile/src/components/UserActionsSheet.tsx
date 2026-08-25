import type { ContactUser } from "@board-game-organizer/shared";
import { Ban, Eye, UserMinus, UserPlus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/i18n";

export interface UserActionItem {
  key: "block" | "unblock" | "follow" | "unfollow" | "profile";
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Bottom-sheet-style action menu for a contact row: block/unblock,
 * follow/unfollow, view profile (disabled for now). Triggered by the ⋯
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
  onClose,
  onAction,
}: {
  visible: boolean;
  user: ContactUser | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onAction: (key: UserActionItem["key"]) => void;
}) {
  const t = useT();
  const [confirmBlock, setConfirmBlock] = useState(false);

  // Reset the confirmation state whenever the sheet closes (Cancel button,
  // backdrop tap, or after an action), so opening it on ANOTHER contact never
  // shows the previous block-confirmation.
  useEffect(() => {
    if (!visible) setConfirmBlock(false);
  }, [visible]);

  if (!user) return null;

  const items: UserActionItem[] = user.blockedByMe
    ? [
        { key: "unblock", label: t("Unblock") },
        { key: "profile", label: t("View profile"), disabled: true },
      ]
    : user.blockedMe
      ? [
          { key: "unfollow", label: t("Unfollow") },
          { key: "profile", label: t("View profile"), disabled: true },
        ]
      : user.isFollowing
        ? [
            { key: "unfollow", label: t("Unfollow") },
            { key: "block", label: t("Block"), destructive: true },
            { key: "profile", label: t("View profile"), disabled: true },
          ]
        : [
            { key: "follow", label: t("Follow") },
            { key: "block", label: t("Block"), destructive: true },
            { key: "profile", label: t("View profile"), disabled: true },
          ];

  const icons: Record<UserActionItem["key"], React.ReactNode> = {
    follow: <UserPlus size={18} color="#111" />,
    unfollow: <UserMinus size={18} color="#111" />,
    block: <Ban size={18} color="#dc2626" />,
    unblock: <Ban size={18} color="#111" />,
    profile: <Eye size={18} color="#9ca3af" />,
  };

  const handleItem = (item: UserActionItem) => {
    if (item.disabled || busy) return;
    if (item.key === "block") {
      setConfirmBlock(true);
      return;
    }
    onAction(item.key);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{user.name}</Text>

          {confirmBlock ? (
            <View>
              <Text style={styles.confirmText}>
                {t("Block")} {user.name}?{" "}
                {t(
                  "You will no longer see each other or find each other. Follow and friendships will be removed.",
                )}
              </Text>
              <View style={styles.confirmRow}>
                <Pressable
                  style={[styles.item, styles.itemDanger, busy && styles.itemBusy]}
                  disabled={busy}
                  testID="confirm-block-btn"
                  onPress={() => {
                    setConfirmBlock(false);
                    onAction("block");
                    onClose();
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ban size={18} color="#fff" />
                  )}
                  <Text style={styles.itemTextWhite}>{t("Block")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.item, styles.confirmCancel, busy && styles.itemBusy]}
                  disabled={busy}
                  onPress={() => {
                    setConfirmBlock(false);
                    onClose();
                  }}
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
  confirmText: { fontSize: 14, color: "#374151", marginBottom: 12 },
  confirmRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
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
  itemBusy: { opacity: 0.6 },
  itemText: { fontSize: 15, color: "#111" },
  itemTextWhite: { fontSize: 15, color: "#fff", fontWeight: "600" },
  itemTextDanger: { fontSize: 15, color: "#dc2626", fontWeight: "600" },
  itemTextDisabled: { color: "#9ca3af" },
  error: { marginTop: 10, fontSize: 13, color: "#dc2626", textAlign: "center" },
  cancel: { marginTop: 12, alignItems: "center", paddingVertical: 12 },
  cancelText: { fontSize: 15, color: "#006fee", fontWeight: "600" },
});
