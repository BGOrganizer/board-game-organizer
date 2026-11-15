import {
  eventGroupChangeNeedsConfirmation,
  type useEventRecordForm,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ArrowRightLeft } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { InputField } from "@/components/common/ui/InputField";
import { NameInput } from "@/components/common/ui/NameInput";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";
import { EventGroupSelect } from "./EventGroupSelect";
import { EventPlanningSettings } from "./EventPlanningSettings";
import { EventVisibilityPicker } from "./EventVisibilityPicker";

export function EventInformationFields({
  form,
  busy,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
}) {
  const t = useT(),
    foreground = useThemeColor("accent-foreground");
  const [pending, setPending] = useState<{ id: string; type: "PUBLIC" } | null>(null);
  const { draft, fieldError } = form;
  const choose = (id: string | null, type: "PRIVATE" | "PUBLIC" | null) => {
    if (form.groupLocked || id === draft.groupId) return;
    if (id && type === "PUBLIC" && eventGroupChangeNeedsConfirmation(draft, true))
      setPending({ id, type });
    else form.selectGroup(id, type);
  };
  return (
    <View style={{ gap: 20 }}>
      <EventVisibilityPicker
        value={draft.visibility ?? "PRIVATE"}
        publicAllowed={form.publicGroup}
        locked={form.visibilityLocked}
        busy={busy}
        onChange={(visibility) => form.patch({ visibility })}
      />
      <View style={{ gap: 12 }}>
        <InputField invalid={fieldError("name")} style={{ minWidth: 0, gap: 8 }}>
          <SearchHelpLabel
            required
            label={t("Event name")}
            helpTitle={t("Field help")}
            help={t("Choose a recognizable event name between 5 and 120 characters.")}
          />
          <NameInput
            category="evento"
            accessibilityLabel={t("Event name")}
            value={draft.name}
            onChangeText={(name) => form.patch({ name })}
            editable={!busy}
            isInvalid={fieldError("name")}
            placeholder={t("Friday game night")}
          />
          {fieldError("name") ? (
            <Typography accessibilityRole="alert" className="text-sm text-danger">
              {t("Enter an event name between 5 and 120 characters.")}
            </Typography>
          ) : null}
        </InputField>
        <InputField invalid={fieldError("groupId")} style={{ minWidth: 0, gap: 8 }}>
          <SearchHelpLabel
            label={t("Group")}
            helpTitle={t("Field help")}
            help={
              form.groupLocked
                ? t("This event belongs to this group. The group cannot be changed.")
                : t("Choose one of your groups, or create a standalone event without a group.")
            }
          />
          {draft.groupId && form.groupQuery.isPending ? (
            <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
          ) : (
            <EventGroupSelect
              groupId={draft.groupId}
              group={form.group}
              locked={form.groupLocked}
              busy={busy}
              onChange={choose}
            />
          )}
          {draft.groupId && form.groupQuery.isError ? (
            <View style={{ gap: 8 }}>
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load group")}
              </Typography>
              <Button variant="outline" onPress={() => void form.groupQuery.refetch()}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </View>
          ) : fieldError("groupId") ? (
            <Typography accessibilityRole="alert" className="text-sm text-danger">
              {t("An approved group and its administrator are required.")}
            </Typography>
          ) : null}
        </InputField>
      </View>
      <EventPlanningSettings form={form} busy={busy} />
      {pending ? (
        <ConfirmDialog
          title={t("Change group")}
          description={t(
            "Public groups allow one date and one location and do not allow participant proposals. Keep the first options and disable proposals?",
          )}
          busy={busy}
          onCancel={() => setPending(null)}
          actions={[
            {
              label: t("Change group"),
              variant: "primary",
              icon: <ArrowRightLeft size={18} color={foreground} />,
              onPress: () => {
                form.selectGroup(pending.id, pending.type);
                setPending(null);
              },
            },
          ]}
        />
      ) : null}
    </View>
  );
}
