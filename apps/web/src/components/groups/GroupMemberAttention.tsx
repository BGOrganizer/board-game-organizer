"use client";
import { notificationItemId } from "@board-game-organizer/schemas";
import {
  useNotificationAttentionContext,
  useNotificationItemDwell,
} from "@board-game-organizer/shared";
import { useEffect, useRef, useState } from "react";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GroupMemberAttention({
  groupId,
  userId,
  enabled = true,
}: {
  groupId: string;
  userId: string;
  enabled?: boolean;
}) {
  const options = useCommunityApi(),
    element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const itemId = notificationItemId(groupId, "member", userId);
  const active = Boolean(
    useNotificationAttentionContext()?.get({ kind: "item", id: itemId })?.count,
  );
  useNotificationItemDwell(options, itemId, visible && enabled);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const node = element.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let intersecting = false;
    const update = () =>
      setVisible(
        intersecting &&
          document.visibilityState === "visible" &&
          document.hasFocus() &&
          !document.querySelector('dialog[aria-modal="true"][open]') &&
          !node.closest('[aria-hidden="true"],[inert]'),
      );
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting && entry.intersectionRatio >= 1;
        update();
      },
      { threshold: 1 },
    );
    observer.observe(node);
    const hidden = new MutationObserver(update);
    hidden.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-hidden", "inert", "open"],
    });
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      observer.disconnect();
      hidden.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, [active]);
  return (
    <span ref={element} className="inline-flex shrink-0">
      <NotificationItem itemId={itemId} />
    </span>
  );
}
