"use client";

import type { ContactUser } from "@board-game-organizer/shared";
import { Button, Dropdown } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Ban,
  Check,
  Eye,
  MoreVertical,
  UserMinus,
  UserPlus,
  UserRoundPlus,
  UserRoundX,
  X,
} from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";

export type UserActionKey =
  | "block"
  | "unblock"
  | "follow"
  | "unfollow"
  | "unfriend"
  | "friend_request"
  | "accept_friend_request"
  | "reject_friend_request"
  | "cancel_friend_request"
  | "profile";

export type FriendRequestContext = "incoming" | "outgoing";

type ConfirmAction = Exclude<UserActionKey, "follow" | "unfollow" | "unblock" | "profile">;

export function UserMenu({
  user,
  busy,
  canSendFriendRequest = false,
  friendRequest,
  onAction,
}: {
  user: ContactUser;
  busy?: boolean;
  canSendFriendRequest?: boolean;
  friendRequest?: FriendRequestContext;
  onAction: (key: UserActionKey) => void;
}) {
  const { t } = useLingui();
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const items: Array<{
    key: UserActionKey;
    label: string;
    icon: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
  }> = user.blockedByMe
    ? [{ key: "unblock", label: t`Unblock`, icon: <Ban className="h-4 w-4" /> }]
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
            ...(friendRequest === "incoming"
              ? [
                  {
                    key: "accept_friend_request" as const,
                    label: t`Accept friend request`,
                    icon: <Check className="h-4 w-4" />,
                  },
                  {
                    key: "reject_friend_request" as const,
                    label: t`Decline friend request`,
                    icon: <X className="h-4 w-4" />,
                    danger: true,
                  },
                ]
              : friendRequest === "outgoing"
                ? [
                    {
                      key: "cancel_friend_request" as const,
                      label: t`Cancel friend request`,
                      icon: <X className="h-4 w-4" />,
                      danger: true,
                    },
                  ]
                : canSendFriendRequest
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
    if (
      key === "block" ||
      key === "unfriend" ||
      key === "friend_request" ||
      key === "accept_friend_request" ||
      key === "reject_friend_request" ||
      key === "cancel_friend_request"
    ) {
      setConfirm(key);
      return;
    }
    onAction(key);
  };

  const confirmation = (() => {
    switch (confirm) {
      case "block":
        return {
          title: t`Block contact`,
          description: t`You will no longer see each other or find each other. Follow and friendships will be removed.`,
          label: t`Block`,
          danger: true,
        };
      case "unfriend":
        return {
          title: t`Remove friend?`,
          description: t`The friendship and your follow will be removed.`,
          label: t`Remove friend`,
          danger: true,
        };
      case "friend_request":
        return {
          title: t`Send friend request?`,
          description: t`They can accept or decline your request.`,
          label: t`Send request`,
          danger: false,
        };
      case "accept_friend_request":
        return {
          title: t`Accept friend request?`,
          description: t`You will become friends and follow each other.`,
          label: t`Accept`,
          danger: false,
        };
      case "reject_friend_request":
        return {
          title: t`Decline friend request?`,
          description: t`The friend request will be declined.`,
          label: t`Decline`,
          danger: true,
        };
      case "cancel_friend_request":
        return {
          title: t`Cancel friend request?`,
          description: t`The sent friend request will be removed.`,
          label: t`Cancel request`,
          danger: true,
        };
      default:
        return null;
    }
  })();

  return (
    <>
      <Dropdown>
        <Dropdown.Trigger>
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

      {confirm && confirmation && (
        <ContactConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          busy={busy}
          onCancel={() => setConfirm(null)}
          actions={[
            {
              label: confirmation.label,
              variant: confirmation.danger ? "danger" : "primary",
              onPress: () => {
                const action = confirm;
                setConfirm(null);
                onAction(action);
              },
            },
          ]}
        />
      )}
    </>
  );
}
