import { useInvites } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Share2, UserPlus, UserRoundPlus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Share, View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

/** Same native share sheet as Contacts; its copy action keeps the complete link. */
export function TableInviteLinkRow({
  tableId,
  disabled = false,
}: {
  tableId: string;
  disabled?: boolean;
}) {
  const t = useT(),
    options = useCommunityApi(),
    [foreground, muted] = useThemeColor(["foreground", "muted"]);
  const scope = JSON.stringify([options.apiUrl, options.userId, tableId]);
  const currentScope = useRef(scope),
    mounted = useRef(false),
    generating = useRef(false);
  currentScope.current = scope;
  const [shareError, setShareError] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const invite = useInvites({
    apiUrl: options.apiUrl,
    token: null,
    getToken: options.getToken,
    userId: options.userId,
    protectionBypass: options.protectionBypass,
    feedback: options.feedback,
    tableId,
  });
  const current = () => mounted.current && currentScope.current === scope;
  const share = async (link: string) => {
    if (!current()) return;
    setShareError(false);
    try {
      await Share.share({ message: link });
    } catch {
      if (current()) setShareError(true);
    }
  };
  const unavailable = disabled || options.enabled === false || !options.userId || invite.isPending;
  const generate = () => {
    if (unavailable || generating.current) return;
    generating.current = true;
    setShareError(false);
    invite.mutate(undefined, {
      onSuccess: (created) => {
        if (current()) void share(created.link);
      },
      onSettled: () => {
        generating.current = false;
      },
    });
  };
  const link = invite.data?.link;
  return (
    <View style={{ gap: 8 }} testID="table-invite-link-row">
      <GroupedList>
        <GroupedRow>
          <View
            className="bg-muted/20"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserRoundPlus size={20} color={muted} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Typography className="text-muted">{t("Generate invite")}</Typography>
            {invite.isPending && !link ? (
              <Skeleton style={{ width: "80%", height: 14, borderRadius: 4 }} />
            ) : link ? (
              <Typography
                testID="table-invite-link-value"
                className="text-sm text-muted"
                accessibilityLabel={t("Invite link")}
                numberOfLines={2}
                selectable
              >
                {link}
              </Typography>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {link ? (
              <Button
                testID="share-table-invite-link"
                isIconOnly
                size="sm"
                variant="outline"
                style={{ minWidth: 44, minHeight: 44 }}
                isDisabled={unavailable}
                accessibilityLabel={t("Share invite link")}
                onPress={() => {
                  if (!unavailable) void share(link);
                }}
              >
                <Share2 size={18} color={foreground} />
              </Button>
            ) : null}
            <Button
              testID="generate-table-invite-link"
              isIconOnly
              size="sm"
              variant="outline"
              style={{ minWidth: 44, minHeight: 44 }}
              isDisabled={unavailable}
              accessibilityLabel={t("Generate invite")}
              onPress={generate}
            >
              <UserPlus size={18} color={foreground} />
            </Button>
          </View>
        </GroupedRow>
      </GroupedList>
      {invite.isError || shareError ? (
        <Typography accessibilityRole="alert" className="text-sm text-danger">
          {shareError
            ? t("Could not share the invite. Try again.")
            : t("Could not create the invite. Try again.")}
        </Typography>
      ) : null}
    </View>
  );
}
