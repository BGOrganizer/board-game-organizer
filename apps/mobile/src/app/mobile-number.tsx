import { getMobileNumber, MOBILE_NUMBER_METADATA_KEY } from "@board-game-organizer/schemas";
import {
  defaultPhoneCountry,
  filterPhoneCountries,
  fullMobileNumber,
  type PhoneCountryCode,
  phoneCountries,
} from "@board-game-organizer/shared";
import { useUser } from "@clerk/expo";
import { useLingui } from "@lingui/react";
import * as Localization from "expo-localization";
import { Redirect, useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Globe } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { FormSubmitButton } from "@/components/common/ui/FormSubmitButton";
import { Input } from "@/components/common/ui/Input";
import { InputField } from "@/components/common/ui/InputField";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useT } from "@/lib/i18n";

export default function MobileNumberScreen() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const t = useT();
  const muted = useThemeColor("muted");
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
  const [isSaving, setIsSaving] = useState(false),
    [attempted, setAttempted] = useState(false);
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
  if (savedMobileNumber) return <Redirect href="/tables" />;
  const currentUser = user;

  async function saveMobileNumber() {
    if (isSaving) return;
    setAttempted(true);
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
      router.replace("/tables");
    } catch {
      setError(t("Could not save mobile number"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormInteractionScope>
      <View className="bg-background" style={{ flex: 1 }}>
        <ScreenScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 16 }}>
          <Typography style={{ fontSize: 28, fontWeight: "700" }}>
            {t("Complete your profile")}
          </Typography>
          <Typography className="text-foreground/60">
            {t("Add your mobile number to continue.")}
          </Typography>
          <InputField style={{ gap: 8 }}>
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
                  <Typography className="flex-1 text-foreground">
                    {selected?.callingCode}
                  </Typography>
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
                    <InputFlatList
                      ListHeaderComponent={
                        <View style={{ gap: 8 }}>
                          <SearchHelpLabel
                            label={t("Search countries")}
                            help={t("Search countries by name or code")}
                          />
                          <SearchInput
                            value={search}
                            onChange={setSearch}
                            label={t("Search countries by name or code")}
                            placeholder={t("Search countries")}
                          />
                        </View>
                      }
                      data={options}
                      keyExtractor={(item) => item.code}
                      keyboardShouldPersistTaps="handled"
                      style={{ flex: 1 }}
                      ListEmptyComponent={
                        <EmptyList icon={<Globe size={28} color={muted} />}>
                          {t("No countries found")}
                        </EmptyList>
                      }
                      renderItem={({ item }) => (
                        <Select.Item value={item.code} label={`${item.name} ${item.callingCode}`}>
                          <View
                            style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
                          >
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
                isInvalid={attempted && !mobileNumber.trim()}
                autoComplete="tel-national"
                keyboardType="phone-pad"
                onChangeText={setMobileNumber}
                testID="mobile-number-input"
                value={mobileNumber}
                style={{ flex: 1 }}
              />
            </View>
            {attempted && !mobileNumber.trim() ? (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Enter a mobile number.")}
              </Typography>
            ) : null}
          </InputField>
          {error ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {error}
            </Typography>
          ) : null}
          <FormSubmitButton
            variant="primary"
            isDisabled={isSaving}
            onPress={() => void saveMobileNumber()}
          >
            <Typography className="text-accent-foreground">
              {isSaving ? t("Saving…") : t("Continue")}
            </Typography>
          </FormSubmitButton>
        </ScreenScrollView>
      </View>
    </FormInteractionScope>
  );
}
