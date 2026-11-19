import { generateName } from "@board-game-organizer/shared";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { CalendarDays, Check, Crown, Mail } from "lucide-react-native";
import { type ComponentProps, useState } from "react";
import { type ColorValue, processColor, StyleSheet, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InputScrollContext } from "@/lib/inputScrollContext";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { FilterChips } from "../FilterChips";
import { HelpPopover } from "../HelpPopover";
import { IconLegend } from "../IconLegend";
import { InfoSection } from "../InfoSection";
import { Input } from "../Input";
import { InputField } from "../InputField";
import { ListSearch } from "../ListSearch";
import { ListSearchFilters } from "../ListSearchFilters";
import { NameInput } from "../NameInput";
import { SearchHelpLabel } from "../SearchHelpLabel";
import { SearchInput } from "../SearchInput";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it("forwards actual input changes, focus, blur and refs through its native scroll owner", async () => {
  const owner = { reveal: vi.fn(), blur: vi.fn(), inSheet: false };
  const change = vi.fn(),
    focus = vi.fn(),
    blur = vi.fn();
  const ref = { current: null };
  await render(
    <InputScrollContext value={owner}>
      <InputField>
        <Input
          ref={ref}
          accessibilityLabel="Group name"
          value="Original name"
          onChangeText={change}
          onFocus={focus}
          onBlur={blur}
        />
      </InputField>
    </InputScrollContext>,
    { wrapper: NativeTestProviders },
  );
  const input = screen.getByLabelText("Group name");
  expect(input).toHaveDisplayValue("Original name");
  await fireEvent.changeText(input, "Updated name");
  expect(change).toHaveBeenCalledExactlyOnceWith("Updated name");
  await fireEvent(input, "focus", { nativeEvent: { target: 1 } });
  expect(focus).toHaveBeenCalledOnce();
  expect(owner.reveal).toHaveBeenCalledWith(ref.current, expect.anything());
  await fireEvent(input, "blur", { nativeEvent: { target: 1 } });
  expect(blur).toHaveBeenCalledOnce();
  expect(owner.blur).toHaveBeenCalledExactlyOnceWith(ref.current);
});

it("changes and clears a controlled actual search field without losing custom children", async () => {
  const changed = vi.fn();
  function SearchFixture() {
    const [value, setValue] = useState("");
    return (
      <SearchInput
        value={value}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
        label="Find a player"
        placeholder="Name or username"
        clearLabel="Reset player search"
        maxLength={30}
      >
        <Text>Private search</Text>
      </SearchInput>
    );
  }
  await render(<SearchFixture />, { wrapper: NativeTestProviders });
  const input = screen.getByLabelText("Find a player");
  expect(input).toHaveProp("maxLength", 30);
  expect(screen.getByText("Private search")).toBeOnTheScreen();
  await fireEvent.changeText(input, "Alice");
  expect(input).toHaveDisplayValue("Alice");
  await userEvent.setup().press(screen.getByRole("button", { name: "Reset player search" }));
  expect(input).toHaveDisplayValue("");
  expect(changed).toHaveBeenLastCalledWith("");
});

const nameCases = (["tavolo", "evento", "gruppo"] as const).flatMap((category) =>
  (["en", "it"] as const).map((locale) => ({ category, locale })),
);
let resolvedNameAccent: ColorValue | undefined;
function NameControl(props: ComponentProps<typeof NameInput>) {
  resolvedNameAccent = useThemeColor("accent");
  return <NameInput {...props} />;
}
it.each(nameCases)(
  "generates an actual localized $category name with a compact ghost accent control ($locale)",
  async ({ category, locale }) => {
    resolvedNameAccent = undefined;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const changed = vi.fn();
    const expected = generateName(category, locale).slice(0, 8);
    const view = await render(
      <NativeTestProviders locale={locale}>
        <NameControl
          category={category}
          accessibilityLabel="Resource name"
          value=""
          maxLength={8}
          onChangeText={changed}
        />
      </NativeTestProviders>,
    );
    expect(screen.getByLabelText("Resource name")).toHaveProp("maxLength", 8);
    const label = locale === "it" ? "Genera un nome casuale" : "Generate a random name";
    const control = screen.getByRole("button", { name: label });
    expect(control).toBeEnabled();
    expect(control).toHaveStyle({ minWidth: 44, minHeight: 44, height: 40 });
    // Resolve compiled native styles and SVG brushes, not undefined token comparisons.
    expect(processColor(StyleSheet.flatten(control.props.style)?.backgroundColor)).toBe(0);
    const icons = control.queryAll(
      (node) =>
        node.type.startsWith("RNSVG") &&
        Number(node.props.bbWidth) === 20 &&
        Number(node.props.bbHeight) === 20,
    );
    expect(icons).toHaveLength(1);
    expect(icons[0].props.accessible).toBe(false);
    const brush = icons[0].queryAll(
      (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
    )[0]?.props.stroke;
    const accent = processColor(resolvedNameAccent);
    if (typeof accent !== "number" || typeof brush?.payload !== "number")
      throw new Error("Expected the actual native accent color and SVG stroke");
    expect((accent >>> 24) & 255).toBe(255);
    expect(brush.type).toBe(0);
    expect(brush.payload >>> 0).toBe(accent >>> 0);
    expect(changed).not.toHaveBeenCalled();
    await userEvent.setup().press(control);
    expect(changed).toHaveBeenCalledExactlyOnceWith(expected);
    await view.rerender(
      <NativeTestProviders locale={locale}>
        <NameControl
          category={category}
          accessibilityLabel="Resource name"
          value=""
          onChangeText={changed}
        />
      </NativeTestProviders>,
    );
    expect(screen.getByLabelText("Resource name")).toHaveProp("maxLength", 30);
    await userEvent.setup().press(screen.getByRole("button", { name: label }));
    expect(changed).toHaveBeenNthCalledWith(2, generateName(category, locale).slice(0, 30));
    await view.rerender(
      <NativeTestProviders locale={locale}>
        <NameControl
          category={category}
          accessibilityLabel="Resource name"
          editable={false}
          value="Existing name"
          onChangeText={changed}
        />
      </NativeTestProviders>,
    );
    expect(screen.getByLabelText("Resource name")).toHaveProp("maxLength", 30);
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: label }));
    expect(changed).toHaveBeenCalledTimes(2);
  },
);

it("switches role chips independently and reports the search minimum only in discovery mode", async () => {
  const toggle = vi.fn(),
    change = vi.fn();
  const view = await render(
    <ListSearchFilters
      query="Al"
      onQueryChange={change}
      roles={["admin"]}
      onToggle={toggle}
      label="Search members"
      placeholder="Name"
    />,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByRole("button", { name: "Admin" })).toBeSelected();
  expect(screen.getByText("Enter at least 4 characters to search")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Invited" }));
  expect(toggle).toHaveBeenCalledExactlyOnceWith("invited");
  await fireEvent.changeText(screen.getByLabelText("Search members"), "Alice");
  expect(change).toHaveBeenCalledExactlyOnceWith("Alice");
  await view.rerender(
    <ListSearch
      query="A"
      onQueryChange={change}
      label="Filter members"
      placeholder="Name"
      mode="filter"
      options={[]}
      selected={[]}
      onToggle={toggle}
    />,
  );
  expect(screen.queryByText("Enter at least 4 characters to search")).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Admin" })).not.toBeOnTheScreen();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Filter members: Filter help" }));
  expect(screen.getByText("Filter this list by name. No minimum length.")).toBeVisible();
});

it("renders no empty chip container and prevents a disabled filter from dispatching", async () => {
  const toggle = vi.fn();
  const view = await render(<FilterChips options={[]} selected={[]} onToggle={toggle} />, {
    wrapper: NativeTestProviders,
  });
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  await view.rerender(
    <FilterChips
      options={[
        { key: "accepted", label: "Accepted", icon: Check },
        { key: "invited", label: "Invited", icon: Mail, disabled: true },
      ]}
      selected={["accepted"]}
      onToggle={toggle}
    />,
  );
  expect(screen.getByRole("button", { name: "Accepted" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Invited" })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Invited" }));
  expect(toggle).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Accepted" }));
  expect(toggle).toHaveBeenCalledExactlyOnceWith("accepted");
});

it("shows a required label and opens its contextual help through the actual popover", async () => {
  await render(<SearchHelpLabel label="Choose games" help="Choose at least one game." required />, {
    wrapper: NativeTestProviders,
  });
  expect(screen.getByText("Choose games *")).toBeOnTheScreen();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Choose games: Search help" }));
  expect(screen.getByRole("heading", { name: "Search help" })).toBeVisible();
  expect(screen.getByText("Choose at least one game.")).toBeVisible();
});

it("keeps section content and its accessory and explains all icon facts without replacing their real rendering", async () => {
  await render(
    <InfoSection
      label="Dates"
      icon={CalendarDays}
      helpLabel="About dates"
      help="Choose available dates."
      headerAccessory={<Text>Two options</Text>}
    >
      <Text>Friday evening</Text>
      <HelpPopover label="Role legend" title="Roles">
        <IconLegend
          items={[
            { icon: Crown, description: "Manages the event" },
            { icon: Check, description: "Accepted participant" },
          ]}
        />
      </HelpPopover>
    </InfoSection>,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByText("Two options")).toBeOnTheScreen();
  expect(screen.getByText("Friday evening")).toBeOnTheScreen();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Role legend" }));
  expect(screen.getByText("Manages the event")).toBeVisible();
  expect(screen.getByText("Accepted participant")).toBeVisible();
});
