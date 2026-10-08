import {
  type MatchLocation,
  type OrganizationResponse,
  saveOrganizationSchema,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  uploadOrganizationLogo,
  useOrganization,
  useOrganizationActions,
} from "@board-game-organizer/shared";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, ScrollView, View } from "react-native";
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
  const actions = useOrganizationActions(o);
  const [name, setName] = useState(organization?.name ?? "");
  const [location, setLocation] = useState<MatchLocation | undefined>(organization?.location);
  const [logo, setLogo] = useState(organization?.logoAssetId ?? "");
  const [preview, setPreview] = useState(organization?.logo ?? "");
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void Promise.all([
          ImagePicker.getCameraPermissionsAsync(),
          ImagePicker.getMediaLibraryPermissionsAsync(),
        ])
          .then(([camera, library]) =>
            setSettings(
              (!camera.granted && !camera.canAskAgain) ||
                (!library.granted && !library.canAskAgain),
            ),
          )
          .catch(() => setError(t("Could not read photo permissions")));
    });
    return () => sub.remove();
  }, [t]);
  const selectLogo = async (source: "camera" | "library") => {
    setError("");
    setUploading(true);
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    try {
      const get =
        source === "camera"
          ? ImagePicker.getCameraPermissionsAsync
          : ImagePicker.getMediaLibraryPermissionsAsync;
      const request =
        source === "camera"
          ? ImagePicker.requestCameraPermissionsAsync
          : ImagePicker.requestMediaLibraryPermissionsAsync;
      let permission = await get();
      if (!permission.granted && permission.canAskAgain) {
        await request();
        permission = await get();
      }
      setSettings(!permission.granted && !permission.canAskAgain);
      if (current.signal.aborted) return;
      if (!permission.granted) {
        setError(t("Photo permission is required"));
        return;
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
      const after = await get();
      setSettings(!after.granted && !after.canAskAgain);
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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: organization ? t("Edit organization") : t("New organization"),
          headerLeft: undefined,
        }}
      />
      <Typography>{t("Organization name")}</Typography>
      <Input
        accessibilityLabel={t("Organization name")}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Typography>{t("Organization logo")}</Typography>
      <Typography className="text-muted">
        {t("JPEG, PNG or WebP, up to 5 MB. A logo can be replaced, not removed.")}
      </Typography>
      {preview ? (
        <Image
          source={{ uri: preview }}
          accessibilityLabel={t("Organization logo")}
          resizeMode="contain"
          style={{ width: 128, height: 128 }}
        />
      ) : null}
      {uploading ? <Skeleton style={{ width: 128, height: 128, borderRadius: 12 }} /> : null}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button isDisabled={uploading || actions.busy} onPress={() => void selectLogo("camera")}>
          {t("Camera")}
        </Button>
        <Button isDisabled={uploading || actions.busy} onPress={() => void selectLogo("library")}>
          {t("Photo library")}
        </Button>
      </View>
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
      <Button variant="secondary" onPress={() => setPicking(true)}>
        {location ? location.name : t("Choose a verified address")}
      </Button>
      {location ? <Typography>{location.address}</Typography> : null}
      {error ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {error}
        </Typography>
      ) : null}
      <Button
        isDisabled={
          actions.busy ||
          uploading ||
          !saveOrganizationSchema.safeParse({ name, location, logoAssetId: logo }).success
        }
        onPress={() => void save()}
      >
        {t("Submit for review")}
      </Button>
    </ScrollView>
  );
}
