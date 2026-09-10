"use client";

import { getMobileNumber, MOBILE_NUMBER_METADATA_KEY } from "@board-game-organizer/schemas";
import { useUser } from "@clerk/nextjs";
import { Button, Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

export default function MobileNumberPage() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const { t } = useLingui();
  const [mobileNumber, setMobileNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const savedMobileNumber = getMobileNumber(user?.unsafeMetadata);

  useEffect(() => {
    if (isLoaded && user && savedMobileNumber) router.replace("/matches");
  }, [isLoaded, router, savedMobileNumber, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = mobileNumber.trim();
    if (!user || !value) return;

    setIsSaving(true);
    setError(undefined);
    try {
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, [MOBILE_NUMBER_METADATA_KEY]: value },
      });
      router.replace("/matches");
    } catch {
      setError(t`Could not save mobile number`);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isLoaded || !user || savedMobileNumber) {
    return (
      <main className="mx-auto w-full max-w-lg px-3 py-6 sm:px-6 sm:py-12" role="status">
        <span className="sr-only">{t`Loading profile`}</span>
        <div className="h-64 animate-pulse rounded-xl bg-default-200" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-3 py-6 sm:px-6 sm:py-12">
      <Card className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">{t`Complete your profile`}</h1>
        <p className="mt-2 text-default-500">{t`Add your mobile number to continue.`}</p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 font-medium" htmlFor="mobile-number">
            {t`Mobile number`}
            <input
              autoComplete="tel"
              className="w-full min-w-0 rounded-xl border border-default-300 bg-background px-3 py-2 font-normal outline-none focus:border-primary"
              id="mobile-number"
              inputMode="tel"
              name="mobileNumber"
              onChange={(event) => setMobileNumber(event.target.value)}
              required
              type="tel"
              value={mobileNumber}
            />
          </label>
          {error ? (
            <p className="text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button isDisabled={isSaving || !mobileNumber.trim()} type="submit">
            {isSaving ? t`Saving…` : t`Continue`}
          </Button>
        </form>
      </Card>
    </main>
  );
}
