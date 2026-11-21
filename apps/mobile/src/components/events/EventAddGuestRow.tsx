import { GUEST_NAME_MAX_LENGTH, tableGuestDetailsSchema } from "@board-game-organizer/schemas";
import type { useTableGuestActions } from "@board-game-organizer/shared";
import { Avatar } from "heroui-native/avatar";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Label } from "heroui-native/label";
import { Typography } from "heroui-native/text";
import { TextField } from "heroui-native/text-field";
import { AtSign, Mail, Plus, UserRound } from "lucide-react-native";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { Input } from "@/components/common/ui/Input";
import { InputField } from "@/components/common/ui/InputField";
import { InputScrollView } from "@/components/common/ui/InputScrollView";
import { useT } from "@/lib/i18n";

type GuestField = "name" | "email";

export function EventAddGuestRow({
  guest,
  disabled,
  onSaved,
}: {
  guest: ReturnType<typeof useTableGuestActions>;
  disabled: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [muted, foreground, accentForeground] = useThemeColor([
    "muted",
    "foreground",
    "accent-foreground",
  ]);
  const [open, setOpen] = useState(false);
  const sheet = useRef<ComponentRef<typeof BottomSheet.Content>>(null);
  const focusedField = useRef<GuestField | null>(null);
  const restoreFrame = useRef<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const details = tableGuestDetailsSchema.safeParse({ name, email: email.trim() || undefined });
  const invalidEmail =
    emailTouched &&
    !tableGuestDetailsSchema.shape.email.safeParse(email.trim() || undefined).success;
  const saving = guest.add.isPending;

  useEffect(() => {
    if (!open) return;
    const hidden = Keyboard.addListener("keyboardDidHide", () => sheet.current?.collapse());
    return () => {
      hidden.remove();
      if (restoreFrame.current !== null) cancelAnimationFrame(restoreFrame.current);
      restoreFrame.current = null;
      focusedField.current = null;
    };
  }, [open]);

  function focusField(field: GuestField) {
    focusedField.current = field;
    sheet.current?.expand();
  }
  function blurField(field: GuestField) {
    if (focusedField.current !== field) return;
    focusedField.current = null;
    if (restoreFrame.current !== null) cancelAnimationFrame(restoreFrame.current);
    // A blur followed by another field taking focus should keep the sheet expanded.
    restoreFrame.current = requestAnimationFrame(() => {
      restoreFrame.current = null;
      if (focusedField.current === null) sheet.current?.collapse();
    });
  }

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setEmailTouched(false);
    guest.add.reset();
  }
  function add() {
    if (!details.success || disabled || saving) return;
    guest.addGuest(details.data, () => {
      close();
      onSaved();
    });
  }

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <UserRound size={16} color={muted} accessible={false} />
        <Typography className="font-semibold text-foreground">{t("Guest")}</Typography>
        <HelpPopover label={t("About guests")} title={t("Guest")} size="compact">
          <Typography className="text-foreground">
            {t("Add someone who does not have a Board Game Organizer account.")}
          </Typography>
        </HelpPopover>
      </View>
      <GroupedList>
        <GroupedRow>
          <Avatar size="md" alt="" accessible={false}>
            <Avatar.Fallback>
              <UserRound size={20} color={foreground} accessible={false} />
            </Avatar.Fallback>
          </Avatar>
          <Typography style={{ flex: 1 }} className="text-foreground">
            {t("Add a guest")}
          </Typography>
          <Button
            isIconOnly
            size="sm"
            variant="primary"
            style={{ minWidth: 44, minHeight: 44 }}
            accessibilityLabel={t("Add a guest")}
            testID="table-guest-open"
            isDisabled={disabled || saving}
            onPress={() => setOpen(true)}
          >
            <Plus size={18} color={accentForeground} accessible={false} />
          </Button>
        </GroupedRow>
      </GroupedList>
      {open ? (
        <FormInteractionScope>
          <BottomSheet
            isOpen
            onOpenChange={(next) => {
              if (!next && !saving) close();
            }}
          >
            <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
              <BottomSheet.Overlay isCloseOnPress={!saving} />
              <BottomSheet.Content
                ref={sheet}
                snapPoints={["80%"]}
                enablePanDownToClose={!saving}
                keyboardBehavior="extend"
                keyboardBlurBehavior="restore"
                android_keyboardInputMode="adjustResize"
                topInset={insets.top}
              >
                <InputScrollView
                  sizing="content"
                  contentContainerStyle={{
                    padding: 20,
                    paddingBottom: insets.bottom + 16,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      justifyContent: "space-between",
                    }}
                  >
                    <BottomSheet.Title style={{ flex: 1 }}>{t("Add a guest")}</BottomSheet.Title>
                    <BottomSheet.Close
                      accessibilityLabel={t("Close")}
                      isDisabled={saving}
                      style={{ minWidth: 44, minHeight: 44 }}
                    />
                  </View>
                  <InputField>
                    <TextField isRequired isDisabled={saving}>
                      <Label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <AtSign size={16} color={foreground} accessible={false} />
                        <Label.Text>{t("Username")}</Label.Text>
                      </Label>
                      <Input
                        accessibilityLabel={t("Username")}
                        testID="table-guest-username"
                        placeholder={t("Enter a username")}
                        value={name}
                        onChangeText={setName}
                        onFocus={() => focusField("name")}
                        onBlur={() => blurField("name")}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={GUEST_NAME_MAX_LENGTH}
                      />
                    </TextField>
                  </InputField>
                  <InputField>
                    <TextField isInvalid={invalidEmail} isDisabled={saving}>
                      <Label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Mail size={16} color={foreground} accessible={false} />
                        <Label.Text>{t("Email (optional)")}</Label.Text>
                      </Label>
                      <Input
                        accessibilityLabel={t("Email (optional)")}
                        testID="table-guest-email"
                        placeholder={t("Enter an email address")}
                        value={email}
                        onChangeText={setEmail}
                        onFocus={() => focusField("email")}
                        onBlur={() => {
                          setEmailTouched(true);
                          blurField("email");
                        }}
                        isInvalid={invalidEmail}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        maxLength={320}
                        returnKeyType="done"
                        onSubmitEditing={add}
                      />
                      {invalidEmail ? (
                        <Typography className="text-danger" accessibilityRole="alert">
                          {t("Enter a valid email address.")}
                        </Typography>
                      ) : null}
                    </TextField>
                  </InputField>
                  {guest.add.isError ? (
                    <Typography className="text-danger" accessibilityRole="alert">
                      {t("Could not add guest. Try again.")}
                    </Typography>
                  ) : null}
                  <Button
                    onPress={add}
                    isDisabled={!details.success || disabled || saving}
                    testID="table-guest-submit"
                  >
                    <Button.Label>{t("Add")}</Button.Label>
                  </Button>
                </InputScrollView>
              </BottomSheet.Content>
            </BottomSheet.Portal>
          </BottomSheet>
        </FormInteractionScope>
      ) : null}
    </View>
  );
}
