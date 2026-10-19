"use client";
import { startGroupLogoSchema } from "@board-game-organizer/schemas";
import { bytesToBase64, uploadGroupLogo } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
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
      options.feedback?.onOptimisticUpdate?.("upload_group_logo");
      const result = await uploadGroupLogo(
        options,
        bytesToBase64(new Uint8Array(await file.arrayBuffer())),
        file.type,
        current.signal,
      );
      if (!current.signal.aborted) onChange({ id: result.id, preview: result.preview });
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
  return (
    <div className="space-y-2">
      <SearchHelpLabel
        label={t`Group logo`}
        helpTitle={t`Field help`}
        htmlFor="group-logo"
        help={t`JPEG, PNG or WebP, up to 5 MB.`}
      />
      <input
        ref={input}
        id="group-logo"
        name="group-logo"
        type="file"
        required={required}
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
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-label={t`Upload group logo`}
          isDisabled={disabled || uploading}
          onPress={() => input.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          {t`Upload`}
        </Button>
        {value && !required ? (
          <Button
            isIconOnly
            size="sm"
            variant="danger-soft"
            aria-label={t`Remove logo`}
            isDisabled={disabled || uploading}
            onPress={() => onChange(null)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {value ? (
        // biome-ignore lint/performance/noImgElement: Authenticated, optimized data URI, not a remote image.
        <img
          src={value.preview}
          alt={t`Group logo`}
          width={128}
          height={128}
          className="size-32 object-contain"
        />
      ) : null}
      {uploading && !value ? <Skeleton className="size-32 rounded-xl" /> : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
