"use client";

import { useInvites } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Copy, UserPlus, UserRoundPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function TableInviteLinkRow({ tableId, disabled }: { tableId: string; disabled: boolean }) {
  const { t } = useLingui();
  const create = useInvites({ ...useCommunityApi(), token: null, tableId });
  const data = create.data;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard unavailable: the complete link remains visible for manual copying.
    }
  };
  return (
    <GroupedRow className="flex-wrap">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default">
        <UserRoundPlus className="size-5 text-muted" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 font-medium">{t`Generate invite`}</span>
      <Button
        isIconOnly
        size="sm"
        variant="primary"
        aria-label={t`Generate invite`}
        isDisabled={disabled || create.isPending}
        onPress={() => {
          setCopied(false);
          create.mutate();
        }}
      >
        <UserPlus className="size-4" aria-hidden />
      </Button>
      {data ? (
        <div className="flex w-full min-w-0 items-center gap-2 pl-12">
          <code className="min-w-0 flex-1 break-all rounded bg-default p-2 text-sm">
            {data.link}
          </code>
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label={copied ? t`Copied!` : t`Copy`}
            onPress={() => void copy(data.link)}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
        </div>
      ) : create.isPending ? (
        <div className="w-full pl-12" role="status" aria-label={t`Creating invite`}>
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      ) : null}
      {create.isError ? (
        <p role="alert" className="w-full pl-12 text-sm text-danger">
          {t`Could not create the invite. Try again.`}
        </p>
      ) : null}
    </GroupedRow>
  );
}
