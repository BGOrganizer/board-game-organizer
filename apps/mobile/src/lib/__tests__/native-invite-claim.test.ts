import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { getMobileNumber } from "@board-game-organizer/schemas";
import {
  CommunityApiError,
  communityAccessDenied,
  developmentInviteNativePath,
} from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { inviteDestination, inviteTokenParam } from "../inviteLinks";

type Node = { type: any; props: any };
const token = "abcdefghijklmnopqrstuv";
function nodes(value: any): Node[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [value, ...nodes(value.props?.children)];
}
function setup() {
  const state: any = {
    auth: { isLoaded: true, isSignedIn: true },
    user: { isLoaded: true, user: { unsafeMetadata: { mobileNumber: "+39123456789" } } },
    options: { apiUrl: "https://owned-preview.vercel.app", userId: "recipient" },
    params: { inviteToken: token },
    review: {
      data: undefined,
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    },
    claim: {
      isSuccess: false,
      isError: false,
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    },
    form: {
      dateVotes: {},
      locationVotes: {},
      gameVotes: {},
      alreadyAccepted: false,
      complete: true,
      settingsReady: true,
      attempted: false,
      submit: vi.fn(),
      setDates: vi.fn(),
      setLocations: vi.fn(),
      setGames: vi.fn(),
    },
    replace: vi.fn(),
    back: vi.fn(),
  };
  const jsx = (type: any, props: any, key?: string) => ({
    type: type?.name === "Button" ? "Button" : type,
    props: { ...props, key },
  });
  const shared = {
    CommunityApiError,
    developmentInviteNativePath,
    communityAccessDenied,
    useInviteClaim: vi.fn(() => ({ review: state.review, claim: state.claim })),
    useTableInviteForm: vi.fn(() => state.form),
    eventDateWall: () => "2030-06-01T12:00",
    eventLocalToIso: () => "2030-06-01T12:00:00Z",
    formatUsername: (username: string) => `@${username}`,
    defaultPhoneCountry: () => "IT",
    phoneCountries: () => [],
    filterPhoneCountries: () => [],
    fullMobileNumber: (_country: string, number: string) => `+39${number}`,
  };
  const modules: Record<string, any> = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    react: {
      useMemo: (fn: () => any) => fn(),
      useRef: (value: unknown) => ({ current: value }),
      useState: (initial: any) => [
        typeof initial === "function"
          ? initial()
          : initial === ""
            ? (state.inputNumber ?? initial)
            : initial,
        vi.fn(),
      ],
      useEffect: () => {},
    },
    "@board-game-organizer/shared": shared,
    "@board-game-organizer/schemas": {
      getMobileNumber,
      MOBILE_NUMBER_METADATA_KEY: "mobileNumber",
    },
    "@clerk/expo": { useAuth: () => state.auth, useUser: () => state.user },
    "@clerk/expo/native": { AuthView: "AuthView" },
    "expo-router": {
      Redirect: "Redirect",
      useLocalSearchParams: () => state.params,
      useRouter: () => ({ replace: state.replace, back: state.back }),
    },
    "heroui-native/button": { Button: Object.assign(function Button() {}, { Label: "Label" }) },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "react-native": { View: "View" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 30 }) },
    "expo-localization": { getLocales: () => [{ regionCode: "IT" }] },
    "heroui-native/hooks": { useThemeColor: () => "muted" },
    "heroui-native/select": {
      Select: Object.assign(function Select() {}, {
        Trigger: "Trigger",
        TriggerIndicator: "TriggerIndicator",
        Portal: "Portal",
        Overlay: "Overlay",
        Content: "Content",
        Item: "Item",
        ItemIndicator: "ItemIndicator",
      }),
    },
    "lucide-react-native": {
      Globe: "Globe",
      Dices: "Dices",
      CalendarDays: "CalendarDays",
      UsersRound: "UsersRound",
    },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "@/lib/inviteLinks": { inviteDestination, inviteTokenParam },
    "@/lib/useCommunityApi": { useCommunityApi: () => state.options },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en", _: (d: any) => d.message } }) },
    "./TableInviteReview": { TableInviteReview: "TableInviteReview" },
  };
  for (const [path, name] of [
    ["common/ui/EmptyList", "EmptyList"],
    ["common/ui/FormInteractionScope", "FormInteractionScope"],
    ["common/ui/FormSubmitButton", "FormSubmitButton"],
    ["common/ui/Input", "Input"],
    ["common/ui/InputField", "InputField"],
    ["common/ui/ScreenScrollView", "ScreenScrollView"],
    ["common/ui/SearchHelpLabel", "SearchHelpLabel"],
    ["common/ui/SearchInput", "SearchInput"],
    ["common/ui/DateTimeInfo", "DateTimeInfo"],
    ["common/ui/GroupedRow", "GroupedRow"],
    ["common/ui/InputFlatList", "InputFlatList"],
    ["common/ui/InputSectionList", "InputSectionList"],
    ["events/EventVoteButtons", "EventVoteButtons"],
    ["games/GameListRow", "GameListRow"],
    ["locations/LocationListRow", "LocationListRow"],
  ])
    modules[`@/components/${path}`] = { [name]: name };
  function load(path: string, privateName?: string) {
    const source =
      readFileSync(new URL(path, import.meta.url), "utf8") +
      (privateName ? `\nexport { ${privateName} };` : "");
    const exports: Record<string, (props: any) => Node> = {};
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
        Intl,
        require: (id: string) => {
          if (!(id in modules)) throw new Error(`Unexpected module ${id}`);
          return modules[id];
        },
      },
    );
    return exports;
  }
  const components = load("../../components/invites/InviteClaimScreen.tsx", "ClaimContent");
  const reviewComponent = load("../../components/invites/TableInviteReview.tsx").TableInviteReview;
  return {
    state,
    shared,
    load,
    nodes,
    screen: (value: any = token) => components.InviteClaimScreen({ token: value }),
    content: () => components.ClaimContent({ token }),
    review: (value: any, overrides: any = {}) =>
      reviewComponent({
        review: value,
        disabled: false,
        pending: false,
        failed: false,
        readFailed: false,
        onClaim: state.claim.mutateAsync,
        onRefresh: state.review.refetch,
        ...overrides,
      }),
  };
}
function review(): any {
  return {
    kind: "TABLE",
    expiresAt: "2030-06-07T12:00:00Z",
    inviter: { username: "owner", name: "Owner" },
    group: { name: "Private group" },
    event: {
      name: "Event",
      version: 2,
      timeZone: "UTC",
      planningMode: "MANUAL",
      playerPreference: "BEST",
      dates: [{ id: "date-1", day: "2030-06-01" }],
      locations: [{ id: "location-1", name: "Venue", address: "Street" }],
    },
    table: {
      name: "Table",
      minPlayers: 2,
      maxPlayers: 4,
      rankingEnabled: true,
      games: [{ gameId: 1, durationMinutes: 60 }],
      gamesDetail: [{ id: 1, name: "Game", imageUrl: "game.jpg" }],
    },
    requiresAvailability: true,
    ownRegistration: null,
  };
}
it("preserves the invite through native authentication/onboarding without reading or accepting before auth", () => {
  const s = setup();
  expect(s.screen("invalid").props.accessibilityRole).toBe("alert");
  s.state.auth.isLoaded = false;
  expect(s.screen().type.name).toBe("Loading");
  s.state.auth.isLoaded = true;
  s.state.auth.isSignedIn = false;
  expect(s.screen().props.href).toEqual({ pathname: "/sign-in", params: { inviteToken: token } });
  s.state.auth.isSignedIn = true;
  s.state.user.isLoaded = false;
  expect(s.screen().type.name).toBe("Loading");
  s.state.user.isLoaded = true;
  s.state.user.user.unsafeMetadata = {};
  expect(s.screen().props.href).toEqual({
    pathname: "/mobile-number",
    params: { inviteToken: token },
  });
  s.state.user.user.unsafeMetadata.mobileNumber = "123";
  const before = s.screen();
  expect(before.props.token).toBe(token);
  s.state.options.userId = "other";
  expect(s.screen().props.key).not.toBe(before.props.key);
  expect(s.shared.useInviteClaim).not.toHaveBeenCalled();
  expect(s.state.claim.mutateAsync).not.toHaveBeenCalled();
});
it("resumes only the constrained invite after successful native sign-in, retaining normal sign-in defaults", () => {
  const s = setup();
  const signin = s.load("../../app/sign-in.tsx").default;
  expect(signin({}).props.href).toBe(`/invite/${token}`);
  s.state.user.user.unsafeMetadata = {};
  expect(signin({}).props.href).toEqual({
    pathname: "/mobile-number",
    params: { inviteToken: token },
  });
  s.state.params.inviteToken = "https://evil.test";
  expect(signin({}).props.href.params).toEqual({});
  s.state.user.user.unsafeMetadata.mobileNumber = "123";
  expect(signin({}).props.href).toBe("/tables");
  s.state.auth.isSignedIn = false;
  const auth = signin({});
  expect(auth.type).toBe("AuthView");
  auth.props.onHostBack();
  expect(s.state.back).toHaveBeenCalledOnce();
});
it.each([401, 403, 404, 409, 410, 500])(
  "keeps invitation failure %s visible with retry, hiding unavailable context",
  (status) => {
    const s = setup();
    s.state.review.error = new CommunityApiError(status, "error");
    s.state.review.isError = true;
    s.state.review.data = status < 500 ? review() : undefined;
    const tree = nodes(s.content());
    expect(tree.some((n) => n.props.accessibilityRole === "alert")).toBe(true);
    tree.find((n) => n.type === "Button")!.props.onPress();
    expect(s.state.review.refetch).toHaveBeenCalledOnce();
    expect(tree.some((n) => n.type === "TableInviteReview")).toBe(false);
  },
);
it("opens only the authoritative table after a successful explicit claim, including waiting-list receipts", () => {
  const s = setup();
  expect(s.content().type.name).toBe("Loading");
  s.state.review.data = review();
  const component = s.content();
  expect(component.type).toBe("TableInviteReview");
  expect(component.props.onClaim).toBe(s.state.claim.mutateAsync);
  expect(s.state.claim.mutateAsync).not.toHaveBeenCalled();
  s.state.review.isError = true;
  s.state.review.isFetching = true;
  expect(s.content().props.disabled).toBe(true);
  s.state.claim.isSuccess = true;
  s.state.claim.data = {
    table: { eventId: "receipt-event", tableId: "receipt-table", position: "WAITING" },
  };
  expect(s.content().props.href).toEqual({
    pathname: "/event/table",
    params: { eventId: "receipt-event", tableId: "receipt-table" },
  });
  s.state.claim.data = {};
  expect(s.content().props.href).toBe("/contacts");
});
it("retains explicit friend consent on native and exposes failure/retry", async () => {
  const s = setup();
  s.state.review.data = { kind: "FRIEND" };
  expect(s.state.claim.mutateAsync).not.toHaveBeenCalled();
  const action = nodes(s.content()).find((n) => n.type === "Button")!;
  action.props.onPress();
  action.props.onPress();
  await Promise.resolve();
  expect(s.state.claim.mutateAsync).toHaveBeenCalledOnce();
  expect(s.state.claim.mutateAsync).toHaveBeenCalledWith({});
  s.state.claim.isError = true;
  s.state.review.isError = true;
  s.state.claim.mutateAsync.mockRejectedValueOnce(new Error("offline"));
  const tree = nodes(s.content());
  expect(tree.some((n) => n.props.accessibilityRole === "alert")).toBe(true);
  tree.find((n) => n.type === "Button")!.props.onPress();
  expect(s.state.review.refetch).toHaveBeenCalledOnce();
  tree
    .filter((n) => n.type === "Button")
    .at(-1)!
    .props.onPress();
  await Promise.resolve();
});
it("renders native settings as read-only for singleton choices and accepted participation", () => {
  const s = setup();
  const value = review();
  const tree = nodes(s.review(value));
  const list = tree.find((n) => n.type === "InputSectionList")!;
  expect(list.props.sections.map((section: any) => section.title)).toEqual([
    "Dates",
    "Locations",
    "Games",
  ]);
  for (const section of list.props.sections)
    expect(list.props.renderSectionHeader({ section }).props.children).toBe(section.title);
  const identities = nodes(list.props.ListHeaderComponent).filter(
    (n) => n.type?.name === "InvitationIdentity",
  );
  expect(identities.map((n) => n.props.icon)).toEqual(["Dices", "CalendarDays", "UsersRound"]);
  expect(identities.map((n) => n.props.name)).toEqual(["Table", "Event", "Private group"]);
  for (const item of list.props.sections.flatMap((section: any) => section.data)) {
    expect(nodes(list.props.renderItem({ item })).some((n) => n.type === "EventVoteButtons")).toBe(
      false,
    );
  }
  const button = tree.find((n) => n.props.testID === "table-link-consent-submit")!;
  button.props.onPress();
  expect(s.state.form.submit).toHaveBeenCalledOnce();
  s.state.form.settingsReady = false;
  s.state.form.complete = false;
  const failed = nodes(s.review(value, { failed: true, pending: true }));
  expect(failed.filter((n) => n.props.accessibilityRole === "alert")).toHaveLength(2);
  expect(failed.find((n) => n.props.testID === "table-link-consent-submit")!.props.isDisabled).toBe(
    true,
  );
  failed.find((n) => n.type === "Button")!.props.onPress();
  expect(s.state.review.refetch).toHaveBeenCalledOnce();
});
it("renders native multiple-option votes, preserves existing availability, and disables changes during refresh", () => {
  const s = setup();
  const value = review();
  value.event.dates.push({ id: "date-2" });
  value.event.locations.push({ id: "location-2", name: "Second" });
  value.table.games.push({ gameId: 2 });
  const tree = nodes(s.review(value, { disabled: true, readFailed: true }));
  const list = tree.find((n) => n.type === "InputSectionList")!;
  for (const item of list.props.sections.flatMap((section: any) => section.data)) {
    expect(list.props.keyExtractor(item)).toContain(item.kind);
    const row = nodes(list.props.renderItem({ item }));
    const action =
      row.find((n) => n.type === "EventVoteButtons") ??
      nodes(row[0].props.actions).find((n) => n.type === "EventVoteButtons");
    expect(action!.props.busy).toBe(true);
    expect(action!.props.inline).toBeUndefined();
    action!.props.onChange("YES");
  }
  for (const setter of [s.state.form.setDates, s.state.form.setLocations, s.state.form.setGames])
    expect(setter.mock.calls[0][0]({ untouched: "NO" })).toMatchObject({ untouched: "NO" });
  value.requiresAvailability = false;
  s.state.form.alreadyAccepted = true;
  const list2 = nodes(s.review(value)).find((n) => n.type === "InputSectionList")!;
  expect(
    nodes(list2.props.renderItem({ item: list2.props.sections[0].data[0] })).some(
      (n) => n.type === "EventVoteButtons",
    ),
  ).toBe(false);
});

it("keeps the exact invite token after completing the required native mobile-number step", async () => {
  const s = setup();
  const phone = s.load("../../app/mobile-number.tsx").default;
  expect(phone({}).props.href).toBe(`/invite/${token}`);
  s.state.user.user.unsafeMetadata = { retained: "value" };
  s.state.user.user.update = vi.fn().mockResolvedValue({});
  s.state.inputNumber = "3331234567";
  const tree = nodes(phone({}));
  const save = tree.find((n) => n.type === "FormSubmitButton");
  expect(save).toBeTruthy();
  await save!.props.onPress();
  expect(s.state.user.user.update).toHaveBeenCalledWith({
    unsafeMetadata: { retained: "value", mobileNumber: "+393331234567" },
  });
  await vi.waitFor(() => expect(s.state.replace).toHaveBeenCalledWith(`/invite/${token}`));
});

it("keeps native acceptance disabled until every required category is valid", () => {
  const s = setup();
  s.state.form.complete = false;
  const button = () =>
    nodes(s.review(review())).find((n) => n.props.testID === "table-link-consent-submit")!;
  expect(button().props.isDisabled).toBe(true);
  s.state.form.complete = true;
  expect(button().props.isDisabled).toBe(false);
});

it("rewrites the stable Development App Link without changing authentication or other routes", () => {
  const s = setup();
  const redirect = s.load("../../app/+native-intent.tsx").redirectSystemPath;
  expect(
    redirect({
      path: `https://api.board-game-organizer.com/development/invite/${token}?web=ignored`,
      initial: true,
    }),
  ).toBe(`/invite/${token}`);
  for (const path of [
    "clerk://com.bgo.boardgameorganizer.dev.callback",
    "bgo-dev:///profile",
    "/groups",
    `https://evil.test/development/invite/${token}`,
  ])
    expect(redirect({ path, initial: false })).toBe(path);
});
