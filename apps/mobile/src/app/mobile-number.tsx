import { getMobileNumber, MOBILE_NUMBER_METADATA_KEY } from "@board-game-organizer/schemas";
import {
  defaultPhoneCountry,
  filterPhoneCountries,
  fullMobileNumber,
  type PhoneCountryCode,
  phoneCountries,
} from "@board-game-organizer/shared";
import { useUser } from "@clerk/expo";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useLingui } from "@lingui/react";
import * as Localization from "expo-localization";
import { Redirect, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { SearchField } from "heroui-native/search-field";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useT } from "@/lib/i18n";

export default function MobileNumberScreen() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const t = useT();
  const { i18n } = useLingui();
  const [mobileNumber, setMobileNumber] = useState("");
  const [country, setCountry] = useState<PhoneCountryCode>(() =>
    defaultPhoneCountry(Localization.getLocales()[0]?.regionCode),
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const countries = useMemo(() => phoneCountries(i18n.locale), [i18n.locale]);
  const selected = countries.find((item) => item.code === country);
  const options = filterPhoneCountries(countries, debouncedSearch);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const savedMobileNumber = getMobileNumber(user?.unsafeMetadata);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Skeleton isLoading variant="pulse" style={{ width: 220, height: 32, borderRadius: 8 }} />
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 48, borderRadius: 8 }}
        />
      </View>
    );
  }

  if (!user) return <Redirect href="/" />;
  if (savedMobileNumber) return <Redirect href="/matches" />;
  const currentUser = user;

  async function saveMobileNumber() {
    if (!mobileNumber.trim()) return;
    const value = fullMobileNumber(country, mobileNumber);

    setIsSaving(true);
    setError(undefined);
    try {
      await currentUser.update({
        unsafeMetadata: {
          ...currentUser.unsafeMetadata,
          [MOBILE_NUMBER_METADATA_KEY]: value,
        },
      });
      router.replace("/matches");
    } catch {
      setError(t("Could not save mobile number"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-background p-6" style={{ justifyContent: "center", gap: 16 }}>
      <Typography style={{ fontSize: 28, fontWeight: "700" }}>
        {t("Complete your profile")}
      </Typography>
      <Typography className="text-foreground/60">
        {t("Add your mobile number to continue.")}
      </Typography>
      <View style={{ gap: 8 }}>
        <Typography style={{ fontWeight: "600" }}>{t("Mobile number")}</Typography>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Select
            presentation="bottom-sheet"
            style={{ width: 124 }}
            value={
              selected
                ? { value: selected.code, label: `${selected.name} ${selected.callingCode}` }
                : undefined
            }
            onValueChange={(value) => {
              if (value) setCountry(value.value as PhoneCountryCode);
            }}
            onOpenChange={(open) => {
              if (!open) {
                setSearch("");
                setDebouncedSearch("");
              }
            }}
          >
            <Select.Trigger
              accessibilityLabel={`${t("Country calling code")}: ${selected?.name ?? country} ${selected?.callingCode ?? ""}`}
              testID="country-calling-code-select"
              style={{ width: 124, flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Typography className="text-foreground">{selected?.flag}</Typography>
              <Typography className="flex-1 text-foreground">{selected?.callingCode}</Typography>
              <Select.TriggerIndicator />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content
                presentation="bottom-sheet"
                snapPoints={["70%"]}
                enableDynamicSizing={false}
                keyboardBehavior="extend"
              >
                <SearchField value={search} onChange={setSearch}>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input
                      accessibilityLabel={t("Search countries by name or code")}
                      placeholder={t("Search countries by name or code")}
                    />
                    <SearchField.ClearButton accessibilityLabel={t("Clear search")} />
                  </SearchField.Group>
                </SearchField>
                <BottomSheetFlatList
                  data={options}
                  keyExtractor={(item) => item.code}
                  keyboardShouldPersistTaps="handled"
                  style={{ flex: 1 }}
                  ListEmptyComponent={
                    <Typography className="p-3 text-muted">{t("No countries found")}</Typography>
                  }
                  renderItem={({ item }) => (
                    <Select.Item value={item.code} label={`${item.name} ${item.callingCode}`}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Typography className="text-foreground">{item.flag}</Typography>
                        <Typography className="flex-1 text-foreground" numberOfLines={1}>
                          {item.name}
                        </Typography>
                        <Typography className="text-muted">{item.callingCode}</Typography>
                      </View>
                      <Select.ItemIndicator />
                    </Select.Item>
                  )}
                />
              </Select.Content>
            </Select.Portal>
          </Select>
          <Input
            accessibilityLabel={t("Mobile number")}
            autoComplete="tel-national"
            keyboardType="phone-pad"
            onChangeText={setMobileNumber}
            testID="mobile-number-input"
            value={mobileNumber}
            style={{ flex: 1 }}
          />
        </View>
      </View>
      {error ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {error}
        </Typography>
      ) : null}
      <Button
        variant="primary"
        isDisabled={isSaving || !mobileNumber.trim()}
        onPress={() => void saveMobileNumber()}
      >
        <Typography className="text-primary-foreground">
          {isSaving ? t("Saving…") : t("Continue")}
        </Typography>
      </Button>
    </View>
  );
}
