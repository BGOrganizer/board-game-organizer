"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useNotificationAttentionContext } from "../NotificationAttentionProvider";
import { cachedAttention } from "../notificationAttentionCache";

/** Continuous visible viewing acknowledges only the captured source revision, never later arrivals. */
export function useNotificationItemDwell(
  options: CommunityApiOptions,
  itemId: string,
  visible: boolean,
) {
  const client = useQueryClient(),
    attention = useNotificationAttentionContext();
  const target = { kind: "item", id: itemId } as const;
  const row = attention?.get(target);
  const owner = JSON.stringify([options.apiUrl, options.userId]),
    enabled = options.enabled;
  const count = row?.count,
    signal = row?.signal;
  const current = useRef({ attention, options });
  current.current = { attention, options };
  useEffect(() => {
    const { attention, options } = current.current;
    const target = { kind: "item", id: itemId } as const;
    if (!visible || !count || !signal || enabled === false || attention?.owner !== owner) return;
    const captured = cachedAttention(client, options, target)?.snapshot;
    if (!captured) return;
    const timer = setTimeout(() => {
      const latest = current.current.attention;
      if (latest?.owner === owner) latest.read(target, captured);
    }, 5_000);
    return () => clearTimeout(timer);
  }, [visible, count, signal, owner, enabled, client, itemId]);
}
