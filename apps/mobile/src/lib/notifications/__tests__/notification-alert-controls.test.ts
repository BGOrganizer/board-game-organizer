import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === "object" && "props" in value
    ? [value, ...nodes(value.props.children)]
    : [];
}
it("keeps the warning read face compact without shrinking its accessible touch target", () => {
  // Real application JSX with host primitives replaced; not native visual/hit-testing acceptance.
  const text = readFileSync(
    new URL("../../../components/notifications/NotificationChangesAlert.tsx", import.meta.url),
    "utf8",
  );
  const out: Record<string, (props: any) => Element> = {},
    jsx = (type: unknown, props: unknown) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      memo: (fn: unknown) => fn,
      useCallback: (fn: unknown) => fn,
      useRef: (current: unknown) => ({ current }),
      useState: (value: unknown) => [value, vi.fn()],
    },
    "react-native": { FlatList: "FlatList", View: "View" },
    "heroui-native/alert": {
      Alert: {
        Indicator: "Indicator",
        Content: "Content",
        Title: "Title",
        Description: "Description",
      },
    },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: (tokens: string[]) => tokens },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": {
      BellRing: "BellRing",
      Check: "Check",
      ChevronDown: "ChevronDown",
      RotateCcw: "RotateCcw",
    },
    "@/components/common/ui/NotificationUnreadDot": { NotificationUnreadDot: "UnreadDot" },
    "@/lib/i18n": { useT: () => (message: string) => message },
  };
  runInNewContext(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports: out,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (!(id in modules)) throw new Error(`Unexpected alert dependency: ${id}`);
        return modules[id];
      },
    },
  );
  const read = vi.fn(),
    tree = nodes(
      out.NotificationChangesAlert({
        model: {
          changes: [{ notificationId: "a", messageCode: "information", requiresResponse: false }],
          isPending: false,
          isError: false,
          readError: null,
          hasNextPage: false,
          isFetchingNextPage: false,
          isReading: false,
          markDisplayedAsRead: read,
        },
      }),
    );
  const button = tree.find((node) => node.props.testID === "notification-changes-read")!;
  expect(button.props).toMatchObject({
    variant: "ghost",
    size: "sm",
    accessibilityLabel: "Mark displayed changes as read",
    isDisabled: false,
    style: { minWidth: 44, minHeight: 44, padding: 0 },
  });
  const face = nodes(button).find((node) => node.props.className === "bg-warning")!;
  expect(face.props.style).toMatchObject({
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  });
  expect(nodes(face).find((node) => node.type === "Check")?.props).toMatchObject({
    size: 16,
    color: "warning-foreground",
    accessible: false,
  });
  expect(read).not.toHaveBeenCalled();
  button.props.onPress();
  expect(read).toHaveBeenCalledOnce();
});
