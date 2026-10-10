import {
  CommunityApiError,
  formatLocationAddress,
  useOrganizationActions,
  useOrganizationReview,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, X } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { OrganizationArtwork } from "@/components/organizations/OrganizationArtwork";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationReview({ organizationId }: { organizationId: string }) {
  const t = useT();
  const options = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accentForeground = useThemeColor("accent-foreground");
  const dangerForeground = useThemeColor("danger-foreground");
  const detail = useOrganizationReview(options, organizationId);
  const actions = useOrganizationActions(options);
  const [reason, setReason] = useState("");
  const organization = detail.data;
  function review(decision: "approve" | "reject") {
    if (!organization) return;
    actions.review.mutate(
      {
        id: organizationId,
        input:
          decision === "approve"
            ? { decision, version: organization.version }
            : { decision, version: organization.version, reason: reason.trim() },
      },
      { onSuccess: () => router.replace("/moderation") },
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t("Review organization") }} />
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          gap: 20,
          paddingBottom: floatingActionLayout(insets.bottom, 100).paddingBottom,
        }}
      >
        {!organization && detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 192, borderRadius: 12 }} />
        ) : null}
        {detail.isError ? (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {detail.error instanceof CommunityApiError && detail.error.status === 403
                ? t("Moderator access required")
                : t("Could not load organization review")}
            </Typography>
            <Button variant="outline" onPress={() => void detail.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        ) : organization ? (
          <>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <OrganizationArtwork organization={organization} />
              <View style={{ flex: 1, gap: 4 }}>
                <Typography className="font-semibold">{organization.name}</Typography>
                <Typography>{organization.location.name}</Typography>
                <Typography className="text-muted">
                  {formatLocationAddress(organization.location.address)}
                </Typography>
              </View>
            </View>
            {organization.approved ? (
              <View className="bg-surface" style={{ padding: 12, borderRadius: 12, gap: 8 }}>
                <Typography className="font-semibold">
                  {t("Currently approved information")}
                </Typography>
                <Typography>{organization.approved.name}</Typography>
                <Typography className="text-muted">
                  {formatLocationAddress(organization.approved.location.address)}
                </Typography>
              </View>
            ) : null}
            {organization.reviewStatus === "PENDING" ? (
              <>
                <SearchHelpLabel
                  label={t("Manage organization")}
                  helpTitle={t("Manage organization")}
                  help={t(
                    "Approve the proposed organization information, or reject it with a reason so the creator can correct it. Previously approved information remains available.",
                  )}
                />
                <Typography>{t("Rejection reason")}</Typography>
                <Input
                  accessibilityLabel={t("Rejection reason")}
                  placeholder={t("Reject reason")}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={1000}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Button
                    variant="primary"
                    style={{
                      flex: 1,
                      minWidth: 44,
                      minHeight: 64,
                      flexDirection: "column",
                      gap: 4,
                    }}
                    isDisabled={actions.busy}
                    onPress={() => review("approve")}
                  >
                    <Check size={16} color={accentForeground} />
                    <Button.Label style={{ textAlign: "center", alignSelf: "stretch" }}>
                      {t("Approve organization")}
                    </Button.Label>
                  </Button>
                  <Button
                    variant="danger"
                    style={{
                      flex: 1,
                      minWidth: 44,
                      minHeight: 64,
                      flexDirection: "column",
                      gap: 4,
                    }}
                    isDisabled={actions.busy || !reason.trim()}
                    onPress={() => review("reject")}
                  >
                    <X size={16} color={dangerForeground} />
                    <Button.Label style={{ textAlign: "center", alignSelf: "stretch" }}>
                      {t("Reject organization")}
                    </Button.Label>
                  </Button>
                </View>
              </>
            ) : (
              <Typography accessibilityRole="text">
                {t("This proposal has already been reviewed.")}
              </Typography>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
