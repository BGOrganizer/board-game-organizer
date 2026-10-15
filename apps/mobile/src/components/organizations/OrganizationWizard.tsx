import {
  type MatchLocation,
  type OrganizationResponse,
  saveOrganizationSchema,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  uploadOrganizationLogo,
  useFavoriteLocations,
  useOrganization,
  useOrganizationActions,
} from "@board-game-organizer/shared";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Camera, Image as ImageIcon, Send, Upload } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { LocationListRow } from "@/components/locations/LocationListRow";
import LocationPicker from "@/components/locations/LocationPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationWizard({ organizationId }: { organizationId?: string }) {
  const o = useCommunityApi();
  const t = useT();
  const query = useOrganization(
    { ...o, enabled: Boolean(organizationId) && o.enabled !== false },
    organizationId ?? "",
  );
  if (
    organizationId &&
    (communityAccessDenied(query.error) || !query.data || query.data.role !== "admin")
  )
    return (
      <View style={{ padding: 20 }}>
        {query.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <Button onPress={() => void query.refetch()}>
            {t("Could not load organization. Retry")}
          </Button>
        )}
      </View>
    );
  return <Editor key={`${o.userId}/${organizationId ?? "new"}`} organization={query.data} />;
}

function Editor({ organization }: { organization?: OrganizationResponse }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  const actions = useOrganizationActions(o);
  const [name, setName] = useState(organization?.name ?? "");
  const [location, setLocation] = useState<MatchLocation | undefined>(organization?.location);
  const favorites = useFavoriteLocations(o, location ? [location] : []);
  const [logo, setLogo] = useState(organization?.logoAssetId ?? "");
  const [preview, setPreview] = useState(organization?.logo ?? "");
  const [picking, setPicking] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void ImagePicker.getCameraPermissionsAsync()
          .then((camera) => setSettings(!camera.granted && !camera.canAskAgain))
          .catch(() => setError(t("Could not read photo permissions")));
    });
    return () => sub.remove();
  }, [t]);
  const selectLogo = async (source: "camera" | "library") => {
    if (uploading || actions.busy) return;
    setSourceOpen(false);
    setError("");
    setUploading(true);
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    try {
      // The system photo picker grants access only to the selected image; no library permission.
      if (source === "camera") {
        let permission = await ImagePicker.getCameraPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          await ImagePicker.requestCameraPermissionsAsync();
          permission = await ImagePicker.getCameraPermissionsAsync();
        }
        setSettings(!permission.granted && !permission.canAskAgain);
        if (current.signal.aborted) return;
        if (!permission.granted) {
          setError(t("Camera permission is required"));
          return;
        }
      }
      const result = await (source === "camera"
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync)({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        allowsEditing: false,
        base64: true,
        quality: 1,
        exif: false,
      });
      if (source === "camera") {
        const after = await ImagePicker.getCameraPermissionsAsync();
        setSettings(!after.granted && !after.canAskAgain);
      }
      if (result.canceled || current.signal.aborted) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error("Missing image data");
      const mime = asset.base64.startsWith("/9j/")
        ? "image/jpeg"
        : asset.base64.startsWith("iVBOR")
          ? "image/png"
          : asset.base64.startsWith("UklGR")
            ? "image/webp"
            : "invalid";
      o.feedback?.onOptimisticUpdate?.("upload_organization_logo");
      const ready = await uploadOrganizationLogo(o, asset.base64, mime, current.signal);
      if (!current.signal.aborted) {
        setLogo(ready.id);
        setPreview(ready.preview);
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setError(t("Could not upload logo"));
        o.feedback?.onError?.(
          error instanceof Error ? error : new Error("Upload failed"),
          "upload_organization_logo",
        );
      }
    } finally {
      if (!current.signal.aborted) setUploading(false);
    }
  };
  const save = async () => {
    const input = saveOrganizationSchema.safeParse({ name, location, logoAssetId: logo });
    if (!input.success) {
      setError(t("Enter a name, logo and verified address"));
      return;
    }
    setError("");
    try {
      const row = organization
        ? await actions.update.mutateAsync({
            id: organization.id,
            input: { ...input.data, version: organization.version },
          })
        : await actions.create.mutateAsync(input.data);
      router.dismissTo(`/organization/${row.id}`);
    } catch {
      setError(t("Could not save organization"));
    }
  };
  if (picking)
    return (
      <LocationPicker
        initial={location}
        onSelect={(next) => {
          setLocation(next);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + 56}
    >
      <Stack.Screen
        options={{
          title: organization ? t("Edit organization") : t("New organization"),
          headerLeft: undefined,
        }}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <SearchHelpLabel
          label={t("Organization name")}
          helpTitle={t("Field help")}
          help={t("Choose a unique name, from 5 to 120 characters.")}
        />
        <Input
          accessibilityLabel={t("Organization name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
        <SearchHelpLabel
          label={t("Organization logo")}
          helpTitle={t("Field help")}
          help={t("JPEG, PNG or WebP, up to 5 MB. A logo can be replaced, not removed.")}
        />
        {preview ? (
          <Image
            source={{ uri: preview }}
            accessibilityLabel={t("Organization logo")}
            resizeMode="contain"
            style={{ width: 128, height: 128 }}
          />
        ) : null}
        {uploading ? <Skeleton style={{ width: 128, height: 128, borderRadius: 12 }} /> : null}
        <BottomSheet isOpen={sourceOpen} onOpenChange={setSourceOpen}>
          <BottomSheet.Trigger asChild>
            <Button
              size="sm"
              variant="secondary"
              style={{ alignSelf: "flex-start" }}
              accessibilityLabel={t("Upload organization logo")}
              isDisabled={uploading || actions.busy}
            >
              <Upload size={18} color={foreground} />
              <Button.Label>{t("Upload")}</Button.Label>
            </Button>
          </BottomSheet.Trigger>
          <BottomSheet.Portal>
            <BottomSheet.Overlay />
            <BottomSheet.Content>
              <BottomSheet.Title>{t("Upload organization logo")}</BottomSheet.Title>
              <View style={{ gap: 12, paddingBottom: Math.max(insets.bottom, 24) }}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Button
                    style={{ flex: 1 }}
                    variant="secondary"
                    onPress={() => void selectLogo("camera")}
                    isDisabled={uploading || actions.busy}
                  >
                    <Camera size={18} color={foreground} />
                    <Button.Label>{t("Camera")}</Button.Label>
                  </Button>
                  <Button
                    style={{ flex: 1 }}
                    variant="secondary"
                    onPress={() => void selectLogo("library")}
                    isDisabled={uploading || actions.busy}
                  >
                    <ImageIcon size={18} color={foreground} />
                    <Button.Label>{t("Photo library")}</Button.Label>
                  </Button>
                </View>
                <Button variant="ghost" onPress={() => setSourceOpen(false)}>
                  {t("Cancel")}
                </Button>
              </View>
            </BottomSheet.Content>
          </BottomSheet.Portal>
        </BottomSheet>
        {settings ? (
          <Button
            variant="outline"
            onPress={() =>
              void Linking.openSettings().catch(() => setError(t("Could not open settings")))
            }
          >
            {t("Open settings")}
          </Button>
        ) : null}
        <GroupedList>
          <LocationListRow
            name={location?.name ?? t("Choose a verified address")}
            accessibilityLabel={t("Choose a verified address")}
            address={location?.address}
            onPress={() => setPicking(true)}
            leading={
              location ? (
                <LocationFavoriteButton location={location} favorites={favorites} />
              ) : undefined
            }
          />
        </GroupedList>
        {favorites.status.isError ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load favorite locations")}
          </Typography>
        ) : null}
        {error ? (
          <Typography accessibilityRole="alert" className="text-danger">
            {error}
          </Typography>
        ) : null}
      </ScrollView>
      <View
        className="bg-background"
        testID="organization-submit-bar"
        style={{ padding: 20, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      >
        <Button
          isDisabled={
            actions.busy ||
            uploading ||
            !saveOrganizationSchema.safeParse({ name, location, logoAssetId: logo }).success
          }
          onPress={() => void save()}
        >
          <Send size={18} color={accentForeground} />
          <Button.Label>{t("Submit for review")}</Button.Label>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
