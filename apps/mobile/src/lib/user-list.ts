export type UserPage = {
  hasNextPage?: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
};

export function nextUserPage(pages: readonly UserPage[]) {
  if (pages.some((page) => page.isError || page.isLoading)) return;
  const page = pages.find((candidate) => candidate.hasNextPage);
  if (page && !page.isFetchingNextPage && !page.isFetchNextPageError) return page;
}
