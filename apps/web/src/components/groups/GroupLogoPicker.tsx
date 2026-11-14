"use client";
import { startGroupLogoSchema } from "@board-game-organizer/schemas";
import { bytesToBase64, uploadGroupLogo } from "@board-game-organizer/shared";
import { Button, Card, Label, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Image as ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const { t } = useLingui(),
    options = useCommunityApi();
  const input = useRef<HTMLInputElement | null>(null),
    controller = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusyChange(false);
    },
    [onBusyChange],
  );
  const upload = async (file: File) => {
    if (disabled || uploading) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setUploading(true);
    onBusyChange(true);
    setError("");
    try {
      startGroupLogoSchema.parse({ mimeType: file.type, byteLength: file.size });
      const result = await uploadGroupLogo(
        options,
        bytesToBase64(new Uint8Array(await file.arrayBuffer())),
        file.type,
        current.signal,
      );
      if (!current.signal.aborted) {
        onChange({ id: result.id, preview: result.preview });
        options.feedback?.onSuccess?.("upload_group_logo");
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setError(t`Could not upload logo`);
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
    <div className="space-y-2">
      <Label htmlFor="group-logo">
        {t`Group logo`}
        {required ? " *" : ""}
      </Label>
      <input
        ref={input}
        id="group-logo"
        name="group-logo"
        type="file"
        required={required && !value}
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <Card className="p-0">
        <Card.Content className="flex min-w-0 flex-row items-center gap-[12px] p-[12px]">
          <div className="flex size-[64px] shrink-0 items-center justify-center rounded-xl bg-default">
            {value ? (
              // biome-ignore lint/performance/noImgElement: Authenticated, optimized data URI, not a remote image.
              <img
                src={value.preview}
                alt={t`Group logo`}
                width={64}
                height={64}
                className="h-full w-full rounded-xl object-contain"
              />
            ) : uploading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ImageIcon
                role="img"
                aria-label={t`No logo selected`}
                className="size-8 text-muted"
              />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-auto min-h-[44px] min-w-[44px] max-w-full gap-[8px] px-[8px] py-[8px] whitespace-normal"
                variant="secondary"
                data-form-control
                aria-label={value ? t`Change logo` : t`Upload group logo`}
                isDisabled={disabled || uploading}
                onPress={() => input.current?.click()}
              >
                <UploadIcon className="size-[16px] shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{value ? t`Change logo` : t`Upload`}</span>
              </Button>
              {value ? (
                <Button
                  isIconOnly
                  size="sm"
                  className="min-h-[44px] min-w-[44px]"
                  variant="danger-soft"
                  aria-label={t`Remove logo`}
                  isDisabled={disabled || uploading}
                  onPress={() => {
                    setError("");
                    onChange(null);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted">{t`JPEG, PNG or WebP, up to 5 MB.`}</p>
          </div>
        </Card.Content>
      </Card>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
