"use client";

import { Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";

export function InviteCardView({
  link,
  pending,
  failed,
  onCreate,
}: {
  link?: string;
  pending?: boolean;
  failed?: boolean;
  onCreate?: () => void;
}) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. http dev): the link is still visible.
    }
  };

  return (
    <Card className="p-4">
      {pending ? (
        <div
          role="status"
          aria-label={t`Creating invite`}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <Skeleton animationType="pulse" className="h-9 w-32 rounded-lg" />
          <Skeleton animationType="pulse" className="h-4 flex-1 rounded" />
        </div>
      ) : failed ? (
        <p role="alert" className="text-sm text-danger">
          {t`Could not create the invite. Try again.`}
        </p>
      ) : link ? (
        <div className="flex flex-col gap-2">
          <code className="min-w-0 break-all rounded bg-default p-2 text-sm">{link}</code>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="outline" className="flex-1" onPress={onCopy}>
              <Copy className="h-4 w-4" />
              {copied ? t`Copied!` : t`Copy`}
            </Button>
            {onCreate ? (
              <Button size="sm" variant="primary" className="flex-1" onPress={onCreate}>
                <UserPlus className="h-4 w-4" />
                {t`New invite`}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t`Invite a friend`}</p>
            <p className="text-xs text-muted">{t`Generate a link to connect with someone.`}</p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" variant="primary" onPress={onCreate}>
            <UserPlus className="h-4 w-4" />
            {t`Create invite`}
          </Button>
        </div>
      )}
    </Card>
  );
}
