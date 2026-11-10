import { generateName, type NameCategory } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { InputGroup } from "heroui-native/input-group";
import { Dices } from "lucide-react-native";
import type { ComponentProps } from "react";
import { useT } from "@/lib/i18n";
import { useInputFocus } from "@/lib/useInputFocus";

export function NameInput({
  category,
  ref,
  onFocus,
  onBlur,
  maxLength = 120,
  ...props
}: ComponentProps<typeof InputGroup.Input> & { category: NameCategory }) {
  const t = useT(),
    { i18n } = useLingui(),
    foreground = useThemeColor("accent-foreground");
  const focus = useInputFocus({ ref, onFocus, onBlur, isInvalid: props.isInvalid });
  return (
    <InputGroup>
      <InputGroup.Input {...props} {...focus} maxLength={maxLength} />
      <InputGroup.Suffix>
        <Button
          isIconOnly
          size="md"
          variant="primary"
          style={{ minWidth: 44, minHeight: 44 }}
          isDisabled={props.isDisabled || props.editable === false}
          accessibilityLabel={t("Generate a random name")}
          onPress={() =>
            props.onChangeText?.(
              generateName(category, i18n.locale.startsWith("it") ? "it" : "en").slice(
                0,
                maxLength,
              ),
            )
          }
        >
          <Dices size={20} color={foreground} accessible={false} />
        </Button>
      </InputGroup.Suffix>
    </InputGroup>
  );
}
