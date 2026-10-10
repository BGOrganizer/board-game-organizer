"use client";
import {
  type MatchLocation,
  type OrganizationResponse,
  saveOrganizationSchema,
  startOrganizationLogoSchema,
} from "@board-game-organizer/schemas";
import {
  bytesToBase64,
  communityAccessDenied,
  formatLocationAddress,
  uploadOrganizationLogo,
  useFavoriteLocations,
  useOrganization,
  useOrganizationActions,
} from "@board-game-organizer/shared";
import { Button, Input, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { MapPin, Send, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationWizard({ organizationId }: { organizationId?: string }) {
  const o = useCommunityApi();
  const { t } = useLingui();
  const query = useOrganization(
    { ...o, enabled: Boolean(organizationId) && o.enabled !== false },
    organizationId ?? "",
  );
  if (
    organizationId &&
    (communityAccessDenied(query.error) || !query.data || query.data.role !== "admin")
  )
    return query.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p>{t`Could not load organization`}</p>
        <Button onPress={() => void query.refetch()}>{t`Retry`}</Button>
      </div>
    );
  return <Editor key={`${o.userId}/${organizationId ?? "new"}`} organization={query.data} />;
}

function Editor({ organization }: { organization?: OrganizationResponse }) {
  const { t } = useLingui();
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
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const favorites = useFavoriteLocations(o, location ? [location] : []);
  const selectLogo = async (file: File) => {
    setError("");
    setUploading(true);
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      startOrganizationLogoSchema.parse({ byteLength: file.size, mimeType: file.type });
      o.feedback?.onOptimisticUpdate?.("upload_organization_logo");
      const result = await uploadOrganizationLogo(
        o,
        bytesToBase64(new Uint8Array(await file.arrayBuffer())),
        file.type,
        current.signal,
      );
      if (!current.signal.aborted) {
        setLogo(result.id);
        setPreview(result.preview);
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setError(t`Could not upload logo`);
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
      setError(t`Enter a name, logo and verified address`);
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
      router.replace(`/organizations/${row.id}`);
    } catch {
      setError(t`Could not save organization`);
    }
  };
  if (picking)
    return (
      <SearchLocationPage
        {...o}
        protectionBypass={o.protectionBypass ?? undefined}
        favorites={favorites}
        initial={location}
        onSelect={(next) => {
          setLocation(next);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    );
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <Button variant="ghost" onPress={() => router.back()}>{t`Back`}</Button>
      <h1 className="text-xl font-semibold">
        {organization ? t`Edit organization` : t`New organization`}
      </h1>
      <TextField value={name} onChange={setName} isRequired>
        <SearchHelpLabel
          label={t`Organization name`}
          helpTitle={t`Field help`}
          help={t`Choose a unique name, from 5 to 120 characters.`}
        />
        <Input name="organization-name" autoComplete="off" minLength={5} maxLength={120} />
      </TextField>
      <SearchHelpLabel
        label={t`Organization logo`}
        helpTitle={t`Field help`}
        htmlFor="organization-logo"
        help={t`JPEG, PNG or WebP, up to 5 MB. A logo can be replaced, not removed.`}
      />
      <input
        ref={fileInput}
        className="sr-only"
        tabIndex={-1}
        id="organization-logo"
        name="organization-logo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading || actions.busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void selectLogo(file);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        className="w-fit"
        aria-label={t`Upload organization logo`}
        isDisabled={uploading || actions.busy}
        onPress={() => fileInput.current?.click()}
      >
        <Upload className="size-4" aria-hidden />
        {t`Upload`}
      </Button>
      {preview ? (
        <img
          src={preview}
          alt={t`Organization logo`}
          width={128}
          height={128}
          className="object-contain"
        />
      ) : null}
      {uploading ? <Skeleton className="size-32 rounded-xl" /> : null}
      <div className="flex items-center gap-2 rounded-lg border border-separator p-3">
        {location ? (
          <LocationFavoriteButton location={location} favorites={favorites} />
        ) : (
          <MapPin className="size-5 shrink-0" aria-hidden />
        )}
        <Button
          variant="tertiary"
          className="h-auto min-h-11 min-w-0 flex-1 justify-start px-2 py-1 text-left"
          aria-label={t`Choose a verified address`}
          onPress={() => setPicking(true)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {location?.name ?? t`Choose a verified address`}
            </span>
            {location ? (
              <span className="block truncate text-xs text-default-500" title={location.address}>
                {formatLocationAddress(location.address)}
              </span>
            ) : null}
          </span>
        </Button>
      </div>
      {favorites.status.isError ? (
        <p role="alert" className="text-danger">{t`Could not load favorite locations`}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-background px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Button
          className="mx-auto flex w-full max-w-3xl"
          variant="primary"
          isDisabled={
            actions.busy ||
            uploading ||
            !saveOrganizationSchema.safeParse({ name, location, logoAssetId: logo }).success
          }
          onPress={() => void save()}
        >
          <Send className="size-4" aria-hidden />
          {t`Submit for review`}
        </Button>
      </div>
    </section>
  );
}
