import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { UsersRound } from "lucide-react-native";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import type { UserPage } from "@/lib/user-list";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { UserList } from "../UserList";

function page(overrides: Partial<UserPage> = {}): UserPage {
  return {
    isLoading: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function Fixture({ pages, rows = [] }: { pages: UserPage[]; rows?: string[] }) {
  return (
    <NativeTestProviders>
      <UserList
        data={rows}
        pages={pages}
        keyExtractor={(item) => item}
        renderRow={(item) => <Text>{item}</Text>}
        empty="No connections"
        emptyIcon={<UsersRound />}
        error="Connections unavailable"
        skeleton={<Text>Loading connections</Text>}
        header={<Text>My connections</Text>}
        footer={<Text>Privacy information</Text>}
        testID="connections"
      />
    </NativeTestProviders>
  );
}

async function scrollToEnd(contentHeight = 1000) {
  await userEvent.setup().scrollTo(screen.getByTestId("connections"), {
    y: contentHeight - 500,
    contentSize: { width: 390, height: contentHeight },
    layoutMeasurement: { width: 390, height: 500 },
  });
}

it("keeps an unexhausted empty window distinct from an empty result and exposes explicit loading", async () => {
  const first = page({ hasNextPage: true });
  const second = page({ hasNextPage: true });
  await render(<Fixture pages={[first, second]} />);
  expect(screen.queryByText("No connections")).toBeNull();
  expect(screen.getByText("My connections")).toBeVisible();
  expect(screen.getByText("Privacy information")).toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
  expect(first.fetchNextPage).toHaveBeenCalledOnce();
  expect(second.fetchNextPage).not.toHaveBeenCalled();

  await screen.rerender(<Fixture pages={[page()]} />);
  expect(screen.getByText("No connections")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("retains cached rows during a failing read and retries only the failed source", async () => {
  const healthy = page();
  const failed = page({ isError: true });
  await render(<Fixture pages={[healthy, failed]} rows={["Ada", "Grace"]} />);
  expect(screen.getByText("Ada")).toBeVisible();
  expect(screen.getByText("Grace")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Connections unavailable");
  expect(screen.queryByText("No connections")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(failed.refetch).toHaveBeenCalledOnce();
  expect(healthy.refetch).not.toHaveBeenCalled();

  await screen.rerender(<Fixture pages={[failed]} />);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.queryByText("No connections")).toBeNull();
});

it("shows initial loading and does not request more until all sources are ready", async () => {
  const loading = page({ isLoading: true });
  const more = page({ hasNextPage: true });
  await render(<Fixture pages={[loading, more]} />);
  expect(screen.getByText("Loading connections")).toBeVisible();
  expect(screen.queryByText("No connections")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  await scrollToEnd();
  expect(more.fetchNextPage).not.toHaveBeenCalled();

  await screen.rerender(<Fixture pages={[page(), more]} rows={["Ada"]} />);
  expect(screen.queryByText("Loading connections")).toBeNull();
  // A newly visible row changes native content length; VirtualizedList rightly
  // deduplicates end-reached for the previously measured empty window.
  await scrollToEnd(1064);
  expect(more.fetchNextPage).toHaveBeenCalledOnce();
});

it("keeps the current page during next-page loading and offers a scoped retry after failure", async () => {
  const fetching = page({ hasNextPage: true, isFetchingNextPage: true });
  await render(<Fixture pages={[fetching]} rows={["Ada"]} />);
  expect(screen.getByText("Ada")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  await scrollToEnd();
  expect(fetching.fetchNextPage).not.toHaveBeenCalled();

  const healthy = page({ hasNextPage: false });
  const failed = page({ hasNextPage: true, isFetchNextPageError: true });
  await screen.rerender(<Fixture pages={[healthy, failed]} rows={["Ada"]} />);
  expect(screen.getByText("Ada")).toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(failed.fetchNextPage).toHaveBeenCalledOnce();
  expect(healthy.fetchNextPage).not.toHaveBeenCalled();
  expect(failed.refetch).not.toHaveBeenCalled();
});

it("leaves the exhausted list stable when native end-reached fires again", async () => {
  const exhausted = page();
  await render(<Fixture pages={[exhausted]} rows={["Ada"]} />);
  await scrollToEnd();
  expect(exhausted.fetchNextPage).not.toHaveBeenCalled();
  expect(screen.getByText("Ada")).toBeVisible();
  expect(screen.queryByText("No connections")).toBeNull();
});
