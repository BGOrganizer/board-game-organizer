import { GROUP_LOGO_CHUNK_BYTES, startGroupLogoSchema } from "@board-game-organizer/schemas";
import { bytesToBase64 } from "@board-game-organizer/shared";
import { Button, Card, Label, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { callTool } from "./protocol";

const logoResult = z.object({ id: z.uuid() });

export function GroupLogoField({
  app,
  value,
  onChange,
  onPendingChange,
  required,
  disabled,
}: {
  app: App;
  value: string | null;
  onChange: (assetId: string | null) => void;
  onPendingChange: (pending: boolean) => void;
  required: boolean;
  disabled: boolean;
}) {
  const { t } = useLingui();
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fileName, setFileName] = useState("");

  async function upload(file: File) {
    if (uploading.current || disabled) return;
    uploading.current = true;
    setPending(true);
    onPendingChange(true);
    setFailed(false);
    try {
      const body = startGroupLogoSchema.parse({ mimeType: file.type, byteLength: file.size });
      const asset = logoResult.parse(await callTool(app, "start_group_logo", { body }));
      const params = { assetId: asset.id };
      for (let offset = 0; offset < file.size; offset += GROUP_LOGO_CHUNK_BYTES) {
        const bytes = new Uint8Array(
          await file.slice(offset, offset + GROUP_LOGO_CHUNK_BYTES).arrayBuffer(),
        );
        await callTool(app, "upload_group_logo_chunk", {
          params,
          body: { offset, base64: bytesToBase64(bytes) },
        });
      }
      const complete = logoResult.parse(await callTool(app, "complete_group_logo", { params }));
      setFileName(file.name);
      onChange(complete.id);
    } catch {
      setFailed(true);
    } finally {
      uploading.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="group-logo">
        {t`Group logo`}
        {required ? (
          <span aria-hidden className="text-danger">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      <input
        ref={input}
        id="group-logo"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || pending}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = "";
        }}
      />
      <Card className="p-0">
        <Card.Content className="flex min-w-0 flex-row flex-wrap items-center gap-2 p-3">
          <ImageIcon className="size-5 text-muted" aria-hidden />
          {value ? <span className="min-w-0 flex-1 break-words text-sm">{fileName}</span> : null}
          {pending ? (
            <Skeleton aria-label={t`Loading…`} className="h-5 min-w-20 flex-1 rounded" />
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            type="button"
            isDisabled={disabled || pending}
            onPress={() => input.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {t`Upload group logo`}
          </Button>
          {value ? (
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              type="button"
              isDisabled={disabled || pending}
              aria-label={t`Remove logo`}
              onPress={() => onChange(null)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </Card.Content>
      </Card>
      {failed ? (
        <p role="alert" className="text-sm text-danger">{t`Could not upload logo`}</p>
      ) : null}
    </div>
  );
}
