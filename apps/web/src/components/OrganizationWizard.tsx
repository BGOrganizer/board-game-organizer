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
  uploadOrganizationLogo,
  useFavoriteLocations,
  useOrganization,
  useOrganizationActions,
  useRelationshipList,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchLocationPage } from "@/components/SearchLocationPage";
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
  useEffect(() => () => controller.current?.abort(), []);
  const favorites = useFavoriteLocations({ ...o });
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
        <Label>{t`Organization name`}</Label>
        <Input name="organization-name" autoComplete="off" minLength={5} maxLength={120} />
      </TextField>
      <Label htmlFor="organization-logo">{t`Organization logo`}</Label>
      <Input
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
      <p className="text-sm text-default-500">{t`JPEG, PNG or WebP, up to 5 MB. A logo can be replaced, not removed.`}</p>
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
      <Button variant="secondary" onPress={() => setPicking(true)}>
        {location ? location.name : t`Choose a verified address`}
      </Button>
      {location ? <p>{location.address}</p> : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <Button
        variant="primary"
        isDisabled={
          actions.busy ||
          uploading ||
          !saveOrganizationSchema.safeParse({ name, location, logoAssetId: logo }).success
        }
        onPress={() => void save()}
      >{t`Submit for review`}</Button>
    </section>
  );
}
export function OrganizationFriendPicker({ organizationId }: { organizationId: string }) {
  const { t } = useLingui();
  const o = useCommunityApi();
  const detail = useOrganization(o, organizationId);
  const actions = useOrganizationActions(o);
  const router = useRouter();
  const friends = useRelationshipList(
    o.apiUrl,
    null,
    o.getToken,
    o.protectionBypass,
    o.userId,
    "friends",
    detail.data?.role === "admin",
  );
  if (detail.isError || detail.data?.role !== "admin")
    return detail.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <p role="alert">{t`Organization admin required`}</p>
    );
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-3 pb-28">
      <Button variant="ghost" onPress={() => router.back()}>{t`Back`}</Button>
      <h1>{t`Invite friends`}</h1>
      {friends.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {friends.data?.map((row) =>
        row.profile ? (
          <Button
            key={row.profile.id}
            isDisabled={actions.busy}
            onPress={() =>
              void actions.invite
                .mutateAsync({ id: organizationId, userId: row.profile!.id })
                .then(() => router.back())
                .catch(() => {})
            }
          >
            {row.profile.username ?? t`Username unavailable`}
          </Button>
        ) : null,
      )}
      {friends.isError ? (
        <div role="alert">
          <Button onPress={() => void friends.refetch()}>{t`Could not load friends. Retry`}</Button>
        </div>
      ) : null}
      {friends.hasNextPage ? (
        <Button
          isDisabled={friends.isFetchingNextPage}
          onPress={() => void friends.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
      {!friends.isPending && !friends.isError && !friends.data?.length ? (
        <p>{t`No friends found`}</p>
      ) : null}
    </section>
  );
}
