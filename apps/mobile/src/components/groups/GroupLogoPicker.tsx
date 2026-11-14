import { uploadGroupLogo } from "@board-game-organizer/shared";
import * as ImagePicker from "expo-image-picker";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Camera, Image as ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function GroupLogoPicker({
  value,
  required,
  disabled,
  onChange,
  onBusyChange,
}: {
  value: { id: string; preview: string } | null;
  required: boolean;
  disabled: boolean;
  onChange: (value: { id: string; preview: string } | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useT(),
    options = useCommunityApi(),
    insets = useSafeAreaInsets();
  const [foreground, danger, muted] = useThemeColor([
    "foreground",
    "danger-soft-foreground",
    "muted",
  ]);
  const controller = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false),
    [uploading, setUploading] = useState(false),
    [settings, setSettings] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusyChange(false);
    },
    [onBusyChange],
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void ImagePicker.getCameraPermissionsAsync()
          .then((permission) => setSettings(!permission.granted && !permission.canAskAgain))
          .catch(() => setError(t("Could not read photo permissions")));
    });
    return () => listener.remove();
  }, [t]);
  const select = async (source: "camera" | "library") => {
    if (disabled || uploading) return;
    setOpen(false);
    setUploading(true);
    onBusyChange(true);
    setError("");
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
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
      // System photo picker scopes access to the selected image. Never request library permission.
      const result = await (source === "camera"
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync)({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        allowsEditing: source === "camera",
        aspect: [1, 1],
        base64: true,
        quality: 1,
        exif: false,
      });
      if (source === "camera") {
        const permission = await ImagePicker.getCameraPermissionsAsync();
        setSettings(!permission.granted && !permission.canAskAgain);
      }
      if (result.canceled || current.signal.aborted) return;
      const base64 = result.assets[0]?.base64;
      if (!base64) throw new Error("Missing image data");
      const mime = base64.startsWith("/9j/")
        ? "image/jpeg"
        : base64.startsWith("iVBOR")
          ? "image/png"
          : base64.startsWith("UklGR")
            ? "image/webp"
            : "invalid";
      const ready = await uploadGroupLogo(options, base64, mime, current.signal);
      if (!current.signal.aborted) {
        onChange({ id: ready.id, preview: ready.preview });
        options.feedback?.onSuccess?.("upload_group_logo");
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setError(t("Could not upload logo"));
        options.feedback?.onError?.(
          error instanceof Error ? error : new Error("Upload failed"),
          "upload_group_logo",
        );
      }
    } finally {
      if (!current.signal.aborted) {
        setUploading(false);
        onBusyChange(false);
      }
    }
  };
  const UploadIcon = value ? RefreshCw : Upload;
  return (
    <View style={{ gap: 8 }}>
      <Typography className="font-semibold text-foreground">
        {t("Group logo")}
        {required ? " *" : ""}
      </Typography>
      <Card style={{ padding: 0 }}>
        <Card.Body style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
          <View
            className="bg-default"
            accessible={!value && !uploading}
            accessibilityRole="image"
            accessibilityLabel={!value && !uploading ? t("No logo selected") : undefined}
            style={{
              width: 64,
              height: 64,
              flexShrink: 0,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {value ? (
              <Image
                source={{ uri: value.preview }}
                accessibilityLabel={t("Group logo")}
                resizeMode="contain"
                style={{ width: 64, height: 64, borderRadius: 8 }}
              />
            ) : uploading ? (
              <Skeleton style={{ width: 64, height: 64, borderRadius: 8 }} />
            ) : (
              <ImageIcon size={32} color={muted} accessible={false} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <BottomSheet isOpen={open} onOpenChange={setOpen}>
                <BottomSheet.Trigger asChild>
                  <Button
                    size="sm"
                    style={{ minHeight: 44, minWidth: 44, maxWidth: "100%" }}
                    variant="secondary"
                    accessibilityLabel={value ? t("Change logo") : t("Upload group logo")}
                    isDisabled={disabled || uploading}
                  >
                    <UploadIcon size={18} color={foreground} />
                    <Button.Label style={{ flexShrink: 1 }}>
                      {value ? t("Change logo") : t("Upload")}
                    </Button.Label>
                  </Button>
                </BottomSheet.Trigger>
                <BottomSheet.Portal>
                  <BottomSheet.Overlay />
                  <BottomSheet.Content>
                    <BottomSheet.Title>{t("Upload group logo")}</BottomSheet.Title>
                    <View style={{ gap: 12, paddingBottom: Math.max(insets.bottom, 24) }}>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <Button
                          style={{ flex: 1 }}
                          variant="secondary"
                          isDisabled={disabled || uploading}
                          onPress={() => void select("camera")}
                        >
                          <Camera size={18} color={foreground} />
                          <Button.Label>{t("Camera")}</Button.Label>
                        </Button>
                        <Button
                          style={{ flex: 1 }}
                          variant="secondary"
                          isDisabled={disabled || uploading}
                          onPress={() => void select("library")}
                        >
                          <ImageIcon size={18} color={foreground} />
                          <Button.Label>{t("Photo library")}</Button.Label>
                        </Button>
                      </View>
                      <Button variant="ghost" onPress={() => setOpen(false)}>
                        <Button.Label>{t("Cancel")}</Button.Label>
                      </Button>
                    </View>
                  </BottomSheet.Content>
                </BottomSheet.Portal>
              </BottomSheet>
              {value ? (
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minHeight: 44, minWidth: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={t("Remove logo")}
                  isDisabled={disabled || uploading}
                  onPress={() => {
                    setError("");
                    onChange(null);
                  }}
                >
                  <Trash2 size={18} color={danger} />
                </Button>
              ) : null}
            </View>
            <Typography className="text-xs text-muted">
              {t("JPEG, PNG or WebP, up to 5 MB.")}
            </Typography>
          </View>
        </Card.Body>
      </Card>
      {settings ? (
        <Button
          variant="outline"
          onPress={() =>
            void Linking.openSettings().catch(() => setError(t("Could not open settings")))
          }
        >
          <Button.Label>{t("Open settings")}</Button.Label>
        </Button>
      ) : null}
      {error ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {error}
        </Typography>
      ) : null}
    </View>
  );
}
