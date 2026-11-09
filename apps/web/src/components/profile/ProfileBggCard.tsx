"use client";
import { bggUsernameSchema } from "@board-game-organizer/schemas";
import { communityAccessDenied, type useBggAccount } from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { RefreshCw, Unlink2, UserRoundPen } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { ListCard } from "@/components/common/ui/ListCard";
import { ProfileBggAttribution } from "./ProfileBggAttribution";

export function ProfileBggCard({ bgg }: { bgg: ReturnType<typeof useBggAccount> }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false),
    [disconnect, setDisconnect] = useState(false),
    [username, setUsername] = useState(""),
    [attempted, setAttempted] = useState(false);
  const data = communityAccessDenied(bgg.account.error) ? undefined : bgg.account.data,
    active = data?.active;
  const busy =
    bgg.busy ||
    bgg.link.isPending ||
    bgg.sync.isPending ||
    bgg.unlink.isPending ||
    data?.pending?.status === "syncing";
  const failed =
    !busy &&
    (bgg.account.isError ||
      bgg.link.isError ||
      bgg.sync.isError ||
      bgg.unlink.isError ||
      data?.lastAttempt?.status === "error");
  const validUsername = bggUsernameSchema.safeParse(username);
  const invalid = attempted && !validUsername.success;
  const askUsername = () => {
    setUsername((current) => current || active?.username || "");
    setAttempted(false);
    setOpen(true);
  };
  return (
    <>
      <ListCard>
        <div className="space-y-3 p-4">
          <h2 className="font-semibold">{t`Your BGG collection`}</h2>
          <p className="text-sm text-muted">{t`Link your BGG username to use your collection when choosing games.`}</p>
          {bgg.account.isPending && !data ? <Skeleton className="h-11 w-full rounded-lg" /> : null}
          {active ? (
            <>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{active.username}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="min-h-11 min-w-11"
                  aria-label={t`Change BGG username`}
                  isDisabled={busy}
                  onPress={askUsername}
                >
                  <UserRoundPen className="size-4" aria-hidden />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  className="min-h-11 min-w-11"
                  aria-label={t`Disconnect BoardGameGeek`}
                  isDisabled={busy}
                  onPress={() => setDisconnect(true)}
                >
                  <Unlink2 className="size-4" aria-hidden />
                </Button>
              </div>
              <p className="text-xs text-muted">{t`Last successful sync`}</p>
              <DateTimeInfo startsAt={active.syncedAt} dateStyle="medium" />
            </>
          ) : null}
          {busy ? (
            <p
              className="text-sm text-muted"
              role="status"
            >{t`Syncing BoardGameGeek collection`}</p>
          ) : data?.lastAttempt?.status === "success" ? (
            <p className="text-sm text-success">{t`Collection up to date`}</p>
          ) : null}
          {failed ? (
            <p
              role="alert"
              className="text-sm text-danger"
            >{t`Could not synchronize BGG collection. Your previous collection is retained.`}</p>
          ) : null}
          <Button
            variant="primary"
            isDisabled={busy || bgg.account.isPending}
            onPress={() => {
              bgg.reset();
              if (active) bgg.link.mutate({ username: active.username, synchronize: true });
              else askUsername();
            }}
          >
            <RefreshCw className="size-4" aria-hidden />
            {t`Sync collection`}
          </Button>
          {bgg.account.isError ? (
            <Button
              variant="secondary"
              onPress={() => void bgg.account.refetch()}
            >{t`Try again`}</Button>
          ) : null}
          <ProfileBggAttribution />
        </div>
      </ListCard>
      {open ? (
        <ContactConfirmDialog
          title={t`BGG username`}
          description={t`Link your BGG username to use your collection when choosing games.`}
          busy={busy}
          onCancel={() => setOpen(false)}
          actions={[
            {
              label: t`Sync collection`,
              onPress: () => {
                if (busy) return;
                setAttempted(true);
                if (!validUsername.success) return;
                bgg.reset();
                bgg.link.mutate({ username: validUsername.data, synchronize: true });
                setOpen(false);
              },
            },
          ]}
        >
          <div data-form-field className="space-y-2">
            <Label htmlFor="profile-bgg-username">{t`BGG username`}</Label>
            <Input
              id="profile-bgg-username"
              name="bggUsername"
              maxLength={64}
              spellCheck={false}
              aria-describedby={invalid ? "profile-bgg-error" : undefined}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              autoComplete="off"
              aria-invalid={invalid}
            />
            {invalid ? (
              <p
                id="profile-bgg-error"
                role="alert"
                className="text-sm text-danger"
              >{t`Enter a valid BGG username.`}</p>
            ) : null}
          </div>
        </ContactConfirmDialog>
      ) : null}
      {disconnect ? (
        <ContactConfirmDialog
          title={t`Disconnect BoardGameGeek?`}
          description={t`Synced collection games will be removed from your profile. Existing matches remain unchanged.`}
          busy={busy}
          onCancel={() => setDisconnect(false)}
          actions={[
            {
              label: t`Disconnect`,
              variant: "danger",
              onPress: () => {
                bgg.reset();
                bgg.unlink.mutate();
                setDisconnect(false);
              },
            },
          ]}
        />
      ) : null}
    </>
  );
}
