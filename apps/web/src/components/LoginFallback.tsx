"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function LoginFallback() {
  const { t } = useLingui();
  return (
    <div className="flex min-w-0 flex-col items-center gap-6 pt-8 text-center sm:pt-16">
      <h2 className="text-xl font-bold sm:text-2xl">{t`Welcome to Board Game Organizer`}</h2>
      <p className="max-w-md text-default-500">
        {t`Organize your board game collection, track your matches and connect with other players.`}
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <SignInButton mode="modal">
          <Button>{t`Sign In`}</Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button variant="outline">{t`Sign Up`}</Button>
        </SignUpButton>
      </div>
    </div>
  );
}
