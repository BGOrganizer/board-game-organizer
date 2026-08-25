"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import { Button, Dropdown, Modal } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Ban, Eye, MoreVertical, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";

export type UserActionKey = "block" | "unblock" | "follow" | "unfollow" | "profile";

/**
 * Kebab (⋯) menu on a contact row: block/unblock, follow/unfollow and
 * view-profile (disabled for now). Block requires confirmation.
 *
 * HeroUI v3 Dropdown is composite (react-aria-components based): the Menu
 * must live inside a Dropdown.Popover, otherwise it renders inline and
 * appears permanently open. Closing on outside-click / action is handled by
 * the MenuTrigger automatically.
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
  }> = user.blockedByMe
    ? [
        {
          key: "unblock",
          label: t`Unblock`,
          icon: <Ban className="h-4 w-4" />,
        },
        {
          key: "profile",
          label: t`View profile`,
          icon: <Eye className="h-4 w-4" />,
          disabled: true,
        },
      ]
    : user.isFollowing
      ? [
          {
            key: "unfollow",
            label: t`Unfollow`,
            icon: <UserMinus className="h-4 w-4" />,
          },
          {
            key: "block",
            label: t`Block`,
            icon: <Ban className="h-4 w-4" />,
            danger: true,
          },
          {
            key: "profile",
            label: t`View profile`,
            icon: <Eye className="h-4 w-4" />,
            disabled: true,
          },
        ]
      : [
          { key: "follow", label: t`Follow`, icon: <UserPlus className="h-4 w-4" /> },
          {
            key: "block",
            label: t`Block`,
            icon: <Ban className="h-4 w-4" />,
            danger: true,
          },
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
        <Dropdown.Trigger>
          {/* Dropdown.Trigger IS a react-aria Button: it needs an interactive
              child (a Button), an icon alone is not clickable. */}
          <Button isIconOnly size="sm" variant="ghost" aria-label={t`Actions`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            disabledKeys={items.filter((i) => i.disabled).map((i) => i.key)}
            onAction={(k) => handle(k as UserActionKey)}
          >
            {items.map((item) => (
              <Dropdown.Item
                key={item.key}
                id={item.key}
                className={item.danger ? "text-danger" : ""}
                // MenuItem.onAction is () => void (no arg) in react-aria, and
                // Menu.onAction receives the item's ID. HeroUI's Dropdown.Item
                // passes an id-less onAction, so the menu-level handler would
                // never fire. Call the handler directly on each item instead.
                onAction={() => handle(item.key)}
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  {item.label}
                </span>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
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
