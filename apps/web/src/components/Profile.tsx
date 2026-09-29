"use client";

import { resolveApiUrl, useBggAccount, useProfileQuery } from "@board-game-organizer/shared";
import { useAuth, useClerk } from "@clerk/nextjs";
import { Avatar, Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Crown,
  Dices,
  Link2,
  LogOut,
  type LucideIcon,
  RefreshCw,
  Unlink2,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) {
  return (
    <fieldset
      className="flex flex-col items-center gap-2 border-0 p-0 text-center"
      aria-label={`${label}: ${value}`}
    >
      <span
        className="relative inline-flex h-14 w-14 items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="h-10 w-10 text-accent" />
        <span className="absolute -bottom-1 -right-2 min-w-6 rounded-full bg-accent px-1 text-center text-xs font-bold leading-6 text-accent-foreground">
          {value}
        </span>
      </span>
      <span className="text-xs text-default-500">{label}</span>
    </fieldset>
  );
}

export function Profile() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const { t } = useLingui();
  const feedback = useMutationFeedback();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [username, setUsername] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileQuery({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && Boolean(isSignedIn),
    protectionBypass: protectionBypass(),
  });
  const bgg = useBggAccount({
    apiUrl: apiUrl(),
    getToken,
    userId,
    protectionBypass: protectionBypass(),
    enabled: isLoaded && Boolean(isSignedIn),
    feedback,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialogOpen && !dialog?.open) dialog?.showModal();
    if (!dialogOpen && dialog?.open) dialog.close();
  }, [dialogOpen]);

  const handleLogout = useCallback(async () => {
    try {
      setIsSigningOut(true);
      await signOut({ redirectUrl: "/" });
    } catch {
      setIsSigningOut(false);
    }
  }, [signOut]);

  const synchronize = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    try {
      await bgg.link.mutateAsync(username.trim());
      setDialogOpen(false);
      bgg.sync.mutate(false);
    } catch (cause) {
      setFormError(
        cause instanceof Error && cause.message === "BGG user not found"
          ? t`BGG user not found`
          : t`Could not connect to BoardGameGeek. Try again.`,
      );
    }
  };

  if (isSigningOut) {
    return (
      <div className="mx-auto mt-6 flex min-h-[60vh] w-full max-w-3xl items-center justify-center">
        <Skeleton animationType="pulse" className="h-16 w-48 rounded-lg" />
      </div>
    );
  }
  if (isLoading) {
    return (
      <Card className="mx-auto mt-4 w-full max-w-3xl rounded-xl p-4 sm:p-6">
        <Skeleton animationType="pulse" className="h-16 w-16 rounded-full" />
        <div className="mt-4 grid grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} animationType="pulse" className="h-16 w-14 rounded" />
          ))}
        </div>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card className="mx-auto mt-4 w-full max-w-3xl rounded-xl p-4 sm:p-6">
        <p className="text-sm text-danger">
          {t`Error while loading the profile:`}{" "}
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button className="mt-3" variant="outline" onPress={() => refetch()}>
          {t`Retry`}
        </Button>
        <Button className="mt-6" variant="danger" onPress={handleLogout}>
          {t`Logout`}
        </Button>
      </Card>
    );
  }
  if (!profile) return null;
  const stats = [
    { label: t`Friends`, value: profile.stats.friends, Icon: UsersRound },
    { label: t`Followers`, value: profile.stats.followers, Icon: UserCheck },
    { label: t`Following`, value: profile.stats.following, Icon: UserPlus },
    { label: t`Matches played`, value: profile.stats.playedMatches, Icon: Dices },
    { label: t`Admin groups`, value: profile.stats.adminGroups, Icon: Crown },
    { label: t`Joined groups`, value: profile.stats.joinedGroups, Icon: UsersRound },
  ];
  const active = bgg.account.data?.active;
  const pending = bgg.account.data?.pending;
  const shown = active ?? pending;

  return (
    <Card className="mx-auto mt-6 flex min-h-[60vh] w-full max-w-3xl flex-col rounded-xl p-4 sm:p-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Avatar size="lg" color="accent">
          <Avatar.Image src={profile.avatarUrl} alt={profile.name} />
          <Avatar.Fallback>{profile.name?.charAt(0) ?? "?"}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{profile.name}</h2>
          <p className="break-all text-sm text-default-500">{profile.email}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-6">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>
      <p className="mt-6 text-xs text-default-400">
        {t`Plan:`} {profile.plan} &middot; {t`Language:`} {profile.preferredLanguage}
      </p>

      <Button
        className="mt-6 w-full sm:w-auto"
        variant="primary"
        onPress={() => {
          setUsername(active?.username ?? pending?.username ?? "");
          setFormError(null);
          setDialogOpen(true);
        }}
      >
        <RefreshCw className="h-5 w-5" />
        {t`Sync with BoardGameGeek`}
      </Button>
      {bgg.account.isError ? (
        <Button className="mt-3" variant="outline" onPress={() => void bgg.account.refetch()}>
          {t`Could not load BoardGameGeek connection. Retry`}
        </Button>
      ) : null}
      {shown ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-default-200 p-3">
          <Avatar size="md" color="accent">
            {shown.avatarUrl ? <Avatar.Image src={shown.avatarUrl} alt="" /> : null}
            <Avatar.Fallback>{shown.username.charAt(0).toUpperCase()}</Avatar.Fallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate font-medium">{shown.username}</span>
          {active ? (
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              aria-label={t`Disconnect BoardGameGeek`}
              onPress={() => setConfirmUnlink(true)}
            >
              <Unlink2 className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {pending ? (
        <div className="mt-2 text-sm text-default-500" role="status">
          {pending.status === "syncing" ? (
            `${t`Syncing BoardGameGeek collection`}: ${pending.username}`
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-danger">
              {t`Could not synchronize BoardGameGeek collection`}: {pending.username}
              <Button
                size="sm"
                variant="outline"
                isDisabled={bgg.sync.isPending}
                onPress={() => bgg.sync.mutate(true)}
              >
                {t`Retry`}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-auto pt-10">
        <Button className="w-full sm:w-auto" variant="danger" onPress={handleLogout}>
          <LogOut className="h-5 w-5" />
          {t`Logout`}
        </Button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="bgg-sync-title"
        onClose={() => setDialogOpen(false)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-default-200 bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/50"
      >
        <form onSubmit={(event) => void synchronize(event)}>
          <h3
            id="bgg-sync-title"
            className="text-lg font-semibold"
          >{t`Sync with BoardGameGeek`}</h3>
          <label
            htmlFor="bgg-username"
            className="mt-4 block text-sm font-medium"
          >{t`BGG username`}</label>
          <input
            id="bgg-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            maxLength={64}
            autoFocus
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-default-200 bg-surface px-3 py-2 outline-none focus:border-primary"
          />
          {formError ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              isDisabled={bgg.link.isPending}
              onPress={() => setDialogOpen(false)}
            >{t`Cancel`}</Button>
            <Button type="submit" variant="primary" isDisabled={bgg.link.isPending}>
              <Link2 className="h-4 w-4" />
              {t`Sync`}
            </Button>
          </div>
        </form>
      </dialog>
      {confirmUnlink ? (
        <ContactConfirmDialog
          title={t`Disconnect BoardGameGeek?`}
          description={t`Synced collection games will be removed from your profile. Existing matches remain unchanged.`}
          busy={bgg.unlink.isPending}
          onCancel={() => setConfirmUnlink(false)}
          actions={[
            {
              label: t`Disconnect`,
              variant: "danger",
              onPress: () => {
                bgg.unlink.mutate(undefined, { onSuccess: () => setConfirmUnlink(false) });
              },
            },
          ]}
        />
      ) : null}
    </Card>
  );
}
