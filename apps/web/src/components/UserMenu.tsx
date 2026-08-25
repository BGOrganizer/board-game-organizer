"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import { Button, Dropdown } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Ban, Eye, MoreVertical, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type UserActionKey = "block" | "unblock" | "follow" | "unfollow" | "profile";

/**
 * Kebab (⋯) menu on a contact row: block/unblock, follow/unfollow and
 * view-profile (disabled for now). Block requires confirmation.
 *
 * The confirmation uses a plain portal dialog (NOT the HeroUI v3 Modal,
 * whose composite DialogTrigger/Overlay wiring kept showing a backdrop
 * without the dialog, needing a second click and never closing cleanly).
 * A controlled div overlay is deterministic and works everywhere.
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
          <Dropdown.Menu disabledKeys={items.filter((i) => i.disabled).map((i) => i.key)}>
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
        <BlockConfirmDialog
          name={user.name}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            onAction("block");
          }}
        />
      )}
    </>
  );
}

function BlockConfirmDialog({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
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
        className="relative z-10 w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-gray-900">
          {/* Static title (no interpolation): "Block contact". */}
          {t`Block contact`}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {t`You will no longer see each other or find each other. Follow and friendships will be removed.`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onPress={onCancel}>
            {t`Cancel`}
          </Button>
          <Button variant="danger" isDisabled={busy} onPress={onConfirm}>
            {t`Block`}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
