"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function LoginFallback() {
  const { t } = useLingui();
  return (
    <div className="flex flex-col items-center gap-6 pt-16 text-center">
      <h2 className="text-2xl font-bold">{t`Welcome to Board Game Organizer`}</h2>
      <p className="max-w-md text-default-500">
        {t`Organize your board game collection, track your matches and connect with other players.`}
      </p>
      <div className="flex gap-3">
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
