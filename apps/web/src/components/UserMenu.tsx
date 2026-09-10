"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import { Button, Dropdown } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Ban,
  Eye,
  MoreVertical,
  UserMinus,
  UserPlus,
  UserRoundPlus,
  UserRoundX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type UserActionKey =
  | "block"
  | "unblock"
  | "follow"
  | "unfollow"
  | "unfriend"
  | "friend_request"
  | "profile";

/**
 * Kebab (⋯) menu on a contact row: relationship, block/unblock and
 * view-profile (disabled for now). Block and friend requests require confirmation.
 *
 * The confirmation uses a plain portal dialog (NOT the HeroUI v3 Modal,
 * whose composite DialogTrigger/Overlay wiring kept showing a backdrop
 * without the dialog, needing a second click and never closing cleanly).
 * A controlled div overlay is deterministic and works everywhere.
 */
export function UserMenu({
  user,
  busy,
  canSendFriendRequest = false,
  onAction,
}: {
  user: ContactUser;
  busy?: boolean;
  canSendFriendRequest?: boolean;
  onAction: (key: UserActionKey) => void;
}) {
  const { t } = useLingui();
  const [confirm, setConfirm] = useState<"block" | "friend_request" | null>(null);

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
    : user.blockedMe
      ? [
          ...(user.isFollowing
            ? [
                {
                  key: "unfollow" as const,
                  label: t`Unfollow`,
                  icon: <UserMinus className="h-4 w-4" />,
                },
              ]
            : []),
          {
            key: "profile",
            label: t`View profile`,
            icon: <Eye className="h-4 w-4" />,
            disabled: true,
          },
        ]
      : user.isFriend
        ? [
            {
              key: "unfriend",
              label: t`Remove friend`,
              icon: <UserRoundX className="h-4 w-4" />,
              danger: true,
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
            {
              key: user.isFollowing ? "unfollow" : "follow",
              label: user.isFollowing ? t`Unfollow` : t`Follow`,
              icon: user.isFollowing ? (
                <UserMinus className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              ),
            },
            ...(canSendFriendRequest
              ? [
                  {
                    key: "friend_request" as const,
                    label: t`Send friend request`,
                    icon: <UserRoundPlus className="h-4 w-4" />,
                  },
                ]
              : []),
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
    if (key === "block" || key === "friend_request") {
      setConfirm(key);
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
            disabledKeys={items.filter((item) => busy || item.disabled).map((item) => item.key)}
          >
            {items.map((item) => (
              <Dropdown.Item
                key={item.key}
                id={item.key}
                className={item.danger ? "text-danger" : ""}
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

      {confirm && (
        <ConfirmDialog
          action={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm;
            setConfirm(null);
            onAction(action);
          }}
        />
      )}
    </>
  );
}

function ConfirmDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: "block" | "friend_request";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLingui();

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Must render after mount (createPortal needs the client document).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop: click closes, dim never lingers because it unmounts with the dialog. */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-confirm-title"
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl bg-background p-4 shadow-2xl sm:p-5"
      >
        <h2 id="contact-confirm-title" className="text-lg font-semibold text-foreground">
          {action === "block" ? t`Block contact` : t`Send friend request?`}
        </h2>
        <p className="mt-2 text-sm text-default-500">
          {action === "block"
            ? t`You will no longer see each other or find each other. Follow and friendships will be removed.`
            : t`They can accept or decline your request.`}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" variant="ghost" onPress={onCancel}>
            {t`Cancel`}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant={action === "block" ? "danger" : "primary"}
            isDisabled={busy}
            onPress={onConfirm}
          >
            {action === "block" ? t`Block` : t`Send request`}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
