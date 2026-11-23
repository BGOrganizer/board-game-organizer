import {
  type CreateGroupRecordInput,
  createGroupRecordSchema,
  type MatchLocation,
  resourceNameSchema,
} from "@board-game-organizer/schemas";
import { withClientRequestId } from "@board-game-organizer/shared";
import { Button, Card, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { Save, UsersRound } from "lucide-react";
import { useRef, useState } from "react";
import type { z } from "zod";
import { ListCard } from "@/components/common/ui/ListCard";
import { NameInput } from "@/components/common/ui/NameInput";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { GroupVisibilityPicker } from "@/components/groups/GroupVisibilityPicker";
import { GroupCreated, groupResult } from "./GroupCreated";
import { GroupLogoField } from "./GroupLogoField";
import { GroupVenuePicker } from "./GroupVenuePicker";
import { callTool, RejectedToolCall, record } from "./protocol";
import { WidgetLink } from "./WidgetLink";

export function GroupCreation({ app, data }: { app: App; data: unknown }) {
  const { t } = useLingui();
  const draft = record(data);
  const [name, setName] = useState(typeof draft?.name === "string" ? draft.name : "");
  const [type, setType] = useState<"PRIVATE" | "PUBLIC">(
    draft?.type === "PUBLIC" ? "PUBLIC" : "PRIVATE",
  );
  const [location, setLocation] = useState<MatchLocation | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"rejected" | "uncertain" | null>(null);
  const [saved, setSaved] = useState<z.infer<typeof groupResult>>();
  const requestId = useRef<{ key: string; body: CreateGroupRecordInput } | null>(null);
  const inFlight = useRef(false);
  const fields = {
    name,
    type,
    invitedUserIds: [],
    ...(location ? { location } : {}),
    ...(logo ? { logoAssetId: logo } : {}),
  };
  const valid = createGroupRecordSchema.safeParse(fields);

  async function submit() {
    if (!valid.success || uploading || inFlight.current || failure === "uncertain") return;
    const key = JSON.stringify(valid.data);
    if (requestId.current?.key !== key) {
      requestId.current = { key, body: withClientRequestId(valid.data) };
    }
    inFlight.current = true;
    setPending(true);
    setFailure(null);
    try {
      const data = await callTool(app, "create_group", {
        body: requestId.current.body,
      });
      setSaved(groupResult.parse(data));
    } catch (error) {
      setFailure(error instanceof RejectedToolCall ? "rejected" : "uncertain");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (saved) return <GroupCreated app={app} group={saved} />;
  return (
    <ListCard>
      <Card.Content className="space-y-4 p-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <UsersRound className="size-5 text-accent" aria-hidden />
          {t`Create group`}
        </h1>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextField value={name} onChange={setName} isRequired isDisabled={pending}>
            <SearchHelpLabel
              required
              label={t`Group name`}
              helpTitle={t`Field help`}
              help={t`Choose a name, from 5 to 30 characters.`}
            />
            <NameInput
              category="gruppo"
              onGenerate={setName}
              isDisabled={pending}
              name="group-name"
              placeholder={t`Group name`}
              autoComplete="off"
            />
            {name && !resourceNameSchema.safeParse(name).success ? (
              <p className="text-sm text-danger">{t`Choose a name, from 5 to 30 characters.`}</p>
            ) : null}
          </TextField>
          <GroupVisibilityPicker value={type} onChange={setType} disabled={pending} />
          <GroupLogoField
            app={app}
            value={logo}
            onChange={setLogo}
            onPendingChange={setUploading}
            required={type === "PUBLIC"}
            disabled={pending}
          />
          <GroupVenuePicker
            app={app}
            value={location}
            onChange={setLocation}
            required={type === "PUBLIC"}
            disabled={pending}
          />
          {type === "PUBLIC" ? (
            <p className="text-sm text-muted">{t`Public groups require a logo, verified venue and approval. Group type cannot be changed.`}</p>
          ) : null}
          {pending ? <Skeleton aria-label={t`Loading…`} className="h-8 w-full rounded" /> : null}
          {failure === "rejected" ? (
            <p role="alert" className="text-sm text-danger">{t`Could not create group`}</p>
          ) : null}
          {failure === "uncertain" ? (
            <div className="space-y-2">
              <p
                role="alert"
                className="text-sm text-danger"
              >{t`Group creation may have completed. Check your groups before trying again.`}</p>
              <WidgetLink app={app} path="/groups">{t`Groups`}</WidgetLink>
            </div>
          ) : null}
          <Button
            type="button"
            variant="primary"
            onPress={() => void submit()}
            isDisabled={!valid.success || uploading || pending || failure === "uncertain"}
          >
            <Save className="size-4" aria-hidden />
            {t`Create group`}
          </Button>
        </form>
      </Card.Content>
    </ListCard>
  );
}
