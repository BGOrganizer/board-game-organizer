import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { nextUserPage, type UserPage } from "../user-list";

type Element = { type: unknown; props: Record<string, unknown> };
function render(pages: UserPage[]): Element {
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View" },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "@/lib/i18n": { useT: () => (value: string) => value },
    "@/lib/user-list": { nextUserPage },
    "./InputFlatList": { InputFlatList: "List" },
    "./GroupedList": { GroupedList: "Grouped" },
    "./EmptyList": { EmptyList: "Empty" },
  };
  const exports: { UserList?: (props: Record<string, unknown>) => Element } = {};
  const source = readFileSync(
    new URL("../../components/common/ui/UserList.tsx", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (id: string) => {
        if (!(id in modules)) throw new Error(`Missing module ${id}`);
        return modules[id];
      },
    },
  );
  if (!exports.UserList) throw new Error("UserList export missing");
  return exports.UserList({ data: [], pages, empty: "Empty", emptyIcon: null });
}

it("does not announce an empty list while cached/source pages remain, and keeps explicit loading available", () => {
  const more = vi.fn();
  const page: UserPage = {
    hasNextPage: true,
    isLoading: false,
    isError: false,
    fetchNextPage: more,
    refetch: vi.fn(),
  };
  const list = render([page]);
  expect(list.props.ListEmptyComponent).toBeNull();
  const controls = (list.props.ListFooterComponent as Element).props.children as (
    | Element
    | null
    | undefined
  )[];
  const button = controls.find((node) => node?.type === "Button");
  expect(button?.props.children).toBe("Load more");
  (button?.props.onPress as (() => void) | undefined)?.();
  expect(more).toHaveBeenCalledOnce();
  expect((render([{ ...page, hasNextPage: false }]).props.ListEmptyComponent as Element).type).toBe(
    "Empty",
  );
  expect(render([{ ...page, isError: true }]).props.ListEmptyComponent).toBeNull();
});
