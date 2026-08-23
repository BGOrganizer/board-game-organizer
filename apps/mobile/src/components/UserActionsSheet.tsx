import type { ContactUser } from "@board-game-organizer/shared";
import { Ban, Eye, UserMinus, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
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
 */
export function UserActionsSheet({
  visible,
  user,
  onClose,
  onAction,
}: {
  visible: boolean;
  user: ContactUser | null;
  onClose: () => void;
  onAction: (key: UserActionItem["key"]) => void;
}) {
  const t = useT();
  const [confirmBlock, setConfirmBlock] = useState(false);

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
    if (item.disabled) return;
    if (item.key === "block") {
      setConfirmBlock(true);
      return;
    }
    onAction(item.key);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
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
                  style={[styles.item, styles.itemDanger]}
                  onPress={() => {
                    setConfirmBlock(false);
                    onAction("block");
                    onClose();
                  }}
                >
                  <Ban size={18} color="#fff" />
                  <Text style={styles.itemTextDanger}>{t("Block")}</Text>
                </Pressable>
                <Pressable
                  style={styles.item}
                  onPress={() => {
                    setConfirmBlock(false);
                    onClose();
                  }}
                >
                  <Text style={styles.itemText}>{t("Cancel")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.item, item.disabled && styles.itemDisabled]}
                  onPress={() => handleItem(item)}
                >
                  {icons[item.key]}
                  <Text
                    style={[
                      styles.itemText,
                      item.destructive && styles.itemTextDanger,
                      item.disabled && styles.itemTextDisabled,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.cancel} onPress={onClose}>
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
  confirmRow: { gap: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  itemDanger: { backgroundColor: "#dc2626", borderRadius: 8, padding: 12, borderBottomWidth: 0 },
  itemDisabled: { opacity: 0.5 },
  itemText: { fontSize: 15, color: "#111" },
  itemTextDanger: { fontSize: 15, color: "#dc2626", fontWeight: "600" },
  itemTextDisabled: { color: "#9ca3af" },
  cancel: { marginTop: 12, alignItems: "center", paddingVertical: 12 },
  cancelText: { fontSize: 15, color: "#006fee", fontWeight: "600" },
});
