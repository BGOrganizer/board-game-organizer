"use client";

import { getMobileNumber, MOBILE_NUMBER_METADATA_KEY } from "@board-game-organizer/schemas";
import {
  defaultPhoneCountry,
  filterPhoneCountries,
  fullMobileNumber,
  type PhoneCountryCode,
  phoneCountries,
} from "@board-game-organizer/shared";
import { useUser } from "@clerk/nextjs";
import { Button, Card, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { Collection, ListLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";

export default function MobileNumberPage() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const { t, i18n } = useLingui();
  const [mobileNumber, setMobileNumber] = useState("");
  const [country, setCountry] = useState<PhoneCountryCode>("US");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const countries = useMemo(() => phoneCountries(i18n.locale), [i18n.locale]);
  const selected = countries.find((item) => item.code === country) as (typeof countries)[number];
  const options = filterPhoneCountries(countries, debouncedSearch);
  useEffect(() => {
    const locale = navigator.language;
    setCountry(
      defaultPhoneCountry(
        locale.match(/[-_]([a-z]{2})(?:[-_]|$)/i)?.[1] ??
          (locale.startsWith("it") ? "IT" : undefined),
      ),
    );
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [isSaving, setIsSaving] = useState(false),
    [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string>();
  const savedMobileNumber = getMobileNumber(user?.unsafeMetadata);

  useEffect(() => {
    if (isLoaded && user && savedMobileNumber) router.replace("/tables");
  }, [isLoaded, router, savedMobileNumber, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || isSaving) return;
    setAttempted(true);
    if (!mobileNumber.trim()) return;
    const value = fullMobileNumber(country, mobileNumber);

    setIsSaving(true);
    setError(undefined);
    try {
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, [MOBILE_NUMBER_METADATA_KEY]: value },
      });
      router.replace("/tables");
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
        <div className="h-64 animate-pulse rounded-xl bg-default" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-3 py-6 sm:px-6 sm:py-12">
      <Card className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">{t`Complete your profile`}</h1>
        <p className="mt-2 text-muted">{t`Add your mobile number to continue.`}</p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex items-end gap-2">
            <Select
              className="w-28 shrink-0"
              value={country}
              onChange={(value) => {
                if (value) setCountry(value as PhoneCountryCode);
              }}
              onOpenChange={(open) => {
                if (!open) {
                  setSearch("");
                  setDebouncedSearch("");
                }
              }}
            >
              <Label className="sr-only">{t`Country calling code`}</Label>
              <Select.Trigger className="w-full">
                <Select.Value className="sr-only">
                  {`${selected.name} ${selected.callingCode}`}
                </Select.Value>
                <span aria-hidden="true">
                  {selected.flag} {selected.callingCode}
                </span>
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover data-input-scope data-input-overlay className="w-72 overflow-y-auto">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder={t`Search countries`}
                  label={
                    <SearchHelpLabel
                      label={t`Search countries`}
                      help={t`Search countries by name or code`}
                    />
                  }
                />
                <Virtualizer layout={ListLayout} shouldObserveItemSize>
                  <ListBox
                    data-input-results
                    className="h-[var(--input-results-height,18rem)] max-h-72 overflow-y-auto"
                    renderEmptyState={() => (
                      <EmptyList
                        icon={<Globe className="size-7" />}
                      >{t`No countries found`}</EmptyList>
                    )}
                  >
                    <Collection items={options}>
                      {(item) => (
                        <ListBox.Item id={item.code} textValue={`${item.name} ${item.callingCode}`}>
                          <span className="flex w-full items-center gap-2">
                            <span aria-hidden="true">{item.flag}</span>
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className="text-muted">{item.callingCode}</span>
                          </span>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      )}
                    </Collection>
                  </ListBox>
                </Virtualizer>
              </Select.Popover>
            </Select>
            <TextField
              fullWidth
              name="mobileNumber"
              value={mobileNumber}
              onChange={setMobileNumber}
              isRequired
              isInvalid={attempted && !mobileNumber.trim()}
            >
              <Label>{t`Mobile number`}</Label>
              <Input type="tel" inputMode="tel" autoComplete="tel-national" />
              {attempted && !mobileNumber.trim() ? (
                <p role="alert" className="text-danger">{t`Enter a mobile number.`}</p>
              ) : null}
            </TextField>
          </div>
          {error ? (
            <p className="text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button data-form-submit isDisabled={isSaving} type="submit">
            {isSaving ? t`Saving…` : t`Continue`}
          </Button>
        </form>
      </Card>
    </main>
  );
}
