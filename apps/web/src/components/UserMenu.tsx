"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
} from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Ban, Eye, MoreVertical, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";

export type UserActionKey = "block" | "unblock" | "follow" | "unfollow" | "profile";

/**
 * Kebab (⋯) menu on a contact row: block/unblock, follow/unfollow and
 * view-profile (disabled for now). Block requires confirmation.
 */
export function UserMenu({
  user,
  busy,
  onAction,
}: {
  user: ContactUser;
  busy?: boolean;
  onAction: (key: UserActionKey) => void;
}) {
  const { t } = useLingui();
  const [confirm, setConfirm] = useState(false);

  const items: Array<{
    key: UserActionKey;
    label: string;
    icon: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
  }> = user.isFollowing
    ? [
        { key: "unfollow", label: t`Unfollow`, icon: <UserMinus className="h-4 w-4" /> },
        { key: "block", label: t`Block`, icon: <Ban className="h-4 w-4" />, danger: true },
        {
          key: "profile",
          label: t`View profile`,
          icon: <Eye className="h-4 w-4" />,
          disabled: true,
        },
      ]
    : [
        { key: "follow", label: t`Follow`, icon: <UserPlus className="h-4 w-4" /> },
        { key: "block", label: t`Block`, icon: <Ban className="h-4 w-4" />, danger: true },
        {
          key: "profile",
          label: t`View profile`,
          icon: <Eye className="h-4 w-4" />,
          disabled: true,
        },
      ];

  const handle = (key: UserActionKey) => {
    if (key === "block") {
      setConfirm(true);
      return;
    }
    onAction(key);
  };

  return (
    <>
      <Dropdown>
        <DropdownTrigger>
          <Button isIconOnly size="sm" variant="ghost" aria-label={t`Actions`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          disabledKeys={items.filter((i) => i.disabled).map((i) => i.key)}
          onAction={(k) => handle(k as UserActionKey)}
        >
          {items.map((item) => (
            <DropdownItem key={item.key} className={item.danger ? "text-danger" : ""}>
              <span className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>

      <Modal isOpen={confirm} onOpenChange={setConfirm}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>{t`Block ${user.name}?`}</Modal.Header>
            <Modal.Body>
              <p className="text-sm text-default-500">
                {t`You will no longer see each other or find each other. Follow and friendships will be removed.`}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => setConfirm(false)}>
                {t`Cancel`}
              </Button>
              <Button
                variant="danger"
                isDisabled={busy}
                onPress={() => {
                  setConfirm(false);
                  onAction("block");
                }}
              >
                {t`Block`}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </>
  );
}
