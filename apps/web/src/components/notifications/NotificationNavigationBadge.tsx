"use client";
import { useNotificationSummary } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function NotificationNavigationBadge({
  section,
}: {
  section: "tables" | "events" | "groups" | "contacts";
}) {
  const options = useCommunityApi(),
    { i18n } = useLingui();
  const summary = useNotificationSummary({
    ...options,
    enabled: options.enabled !== false,
    locale: i18n.locale.startsWith("it") ? "it" : "en",
  });
  return <NotificationCountBadge count={summary?.[section]} />;
}
