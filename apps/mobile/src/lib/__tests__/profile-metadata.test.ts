import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { appVersion } from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it } from "vitest";

type Node = { type: unknown; props: Record<string, any> };
function load(
  name: "ProfileIdentity" | "ProfileVersion",
  modules: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
) {
  const exports: Record<string, (props: any) => Node> = {};
  const jsx = (type: any, props: any): any =>
    typeof type === "function" ? type(props) : { type, props };
  const code = ts.transpileModule(
    readFileSync(new URL(`../../components/profile/${name}.tsx`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  runInNewContext(code, {
    exports,
    process: { env },
    require: (id: string) => {
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (!(id in modules)) throw new Error(`Unexpected dependency: ${id}`);
      return modules[id];
    },
  });
  return exports[name];
}
function nodes(node: any): Node[] {
  return Array.isArray(node)
    ? node.flatMap(nodes)
    : node?.props
      ? [node, ...nodes(node.props.children)]
      : [];
}
function text(node: any): string {
  return Array.isArray(node)
    ? node.map(text).join("")
    : node?.props
      ? text(node.props.children)
      : typeof node === "string"
        ? node
        : "";
}

it.each(["en", "it"])(
  "requires real registration-date and running-version expectations for the %s device journey",
  (locale) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/profile-inputs.js", import.meta.url),
      "utf8",
    );
    const inputs = {
      PROFILE_LOCALE: locale,
      PROFILE_JOINED_AT_LABEL: locale === "it" ? "15 giugno 2020" : "June 15, 2020",
      PROFILE_APP_VERSION: "1.3.2+abcdef1",
      PROFILE_GAME_NAME: "Game",
      PROFILE_OWNER_NAME: "Owner",
      PROFILE_TARGET_ID: "target",
      PROFILE_TARGET_NAME: "Other",
      PROFILE_EMPTY_ID: "empty",
      PROFILE_EMPTY_NAME: "Empty",
      PROFILE_BLOCKED_BY_ME_ID: "blocked",
      PROFILE_BLOCKED_ME_ID: "blocking",
      PROFILE_PUBLIC_ACTIVITY_TEXT: "Visible",
      PROFILE_PRIVATE_ACTIVITY_TEXT: "Hidden",
    };
    const output: { profile?: { version: string; joinedDate: string } } = {};
    runInNewContext(source, { ...inputs, output });
    expect(
      new RegExp(output.profile?.version ?? "").test(
        `${locale === "it" ? "Versione" : "Version"}: 1.3.2+abcdef1`,
      ),
    ).toBe(true);
    expect(new RegExp(output.profile?.joinedDate ?? "").test(inputs.PROFILE_JOINED_AT_LABEL)).toBe(
      true,
    );
    for (const key of ["PROFILE_JOINED_AT_LABEL", "PROFILE_APP_VERSION"])
      expect(() => runInNewContext(source, { ...inputs, [key]: "", output: {} })).toThrow();
  },
);

it.each(["en", "it"])(
  "native profile dates use Clerk owner identity and localized %s dates below the unchanged avatar",
  (locale) => {
    const state = {
      isLoaded: true,
      user: { id: "owner", createdAt: new Date("2020-06-15T12:00:00.000Z") } as {
        id: string;
        createdAt: Date | null;
      } | null,
    };
    let calls = 0;
    const render = load("ProfileIdentity", {
      "@clerk/expo": {
        useUser: () => {
          calls++;
          return state;
        },
      },
      "@lingui/react": {
        useLingui: () => ({
          i18n: {
            date: (date: Date, options: Intl.DateTimeFormatOptions) =>
              new Intl.DateTimeFormat(locale, options).format(date),
          },
        }),
      },
      "heroui-native/skeleton": { Skeleton: "Skeleton" },
      "heroui-native/text": { Typography: "Text" },
      "react-native": { View: "View" },
      "@/components/common/ui/GroupedRow": { GroupedRow: "GroupedRow" },
      "@/components/common/ui/UserAvatar": { UserAvatar: "Avatar" },
      "@/lib/i18n": { useT: () => (message: string) => message },
    });
    const props = { name: "Owner", username: "owner", ownerId: "owner" };
    const result = render(props);
    const expected = locale === "it" ? "15 giugno 2020" : "June 15, 2020";
    expect(text(result)).toContain(expected);
    expect(nodes(result).find((node) => node.type === "Avatar")?.props).toEqual({
      name: "Owner",
      avatarUrl: undefined,
    });
    expect(nodes(result).find((node) => node.props.testID === "profile-joined-at")).toBeTruthy();
    calls = 0;
    expect(text(render({ name: "Other" }))).not.toContain(expected);
    expect(calls).toBe(0);
    state.isLoaded = false;
    state.user = null;
    expect(nodes(render(props)).some((node) => node.type === "Skeleton")).toBe(true);
    state.isLoaded = true;
    expect(text(render(props))).toContain("—");
    state.user = { id: "previous-user", createdAt: new Date("2020-06-15T12:00:00Z") };
    expect(text(render(props))).not.toContain(expected);
    state.user = { id: "owner", createdAt: null };
    expect(text(render(props))).toContain("—");
  },
);

it.each([
  ["production", undefined, "1.3.2"],
  ["development", undefined, "1.3.2+abcdef1"],
  ["production", "true", "1.3.2+abcdef1"],
  ["development", "false", "1.3.2"],
  [undefined, undefined, "1.3.2+abcdef1"],
])(
  "native version follows running OTA bundle metadata (%s/%s)",
  (environment, prerelease, expected) => {
    const render = load(
      "ProfileVersion",
      {
        "@board-game-organizer/shared": { appVersion },
        "expo-constants": {
          __esModule: true,
          default: environment ? { expoConfig: { extra: { sentryEnvironment: environment } } } : {},
        },
        "heroui-native/text": { Typography: "Text" },
        "../../../package.json": { version: "1.3.2" },
        "@/lib/i18n": { useT: () => (message: string) => message },
      },
      {
        EXPO_PUBLIC_APP_PRERELEASE: prerelease,
        EXPO_PUBLIC_BUILD_SHA: "abcdef1234567890abcdef1234567890abcdef12",
      },
    );
    expect(text(render({}))).toBe(`Version: ${expected}`);
  },
);
