"use client";

import { getMobileNumber } from "@board-game-organizer/schemas";
import { useUser } from "@clerk/nextjs";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function MobileNumberGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const { t } = useLingui();
  const mobileNumber = getMobileNumber(user?.unsafeMetadata);

  useEffect(() => {
    if (isLoaded && user && !mobileNumber) router.replace("/mobile-number");
  }, [isLoaded, mobileNumber, router, user]);

  if (!isLoaded || (user && !mobileNumber)) {
    return (
      <div
        className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-6 sm:px-6 sm:py-10 lg:px-8"
        role="status"
      >
        <span className="sr-only">{t`Loading profile`}</span>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-default-200" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-default-200" />
      </div>
    );
  }

  return children;
}
