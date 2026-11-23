import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function PeopleMoreButton({
  pages,
  busy,
}: {
  pages: {
    hasNextPage: boolean;
    isFetching: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>;
  };
  busy?: boolean;
}) {
  const { t } = useLingui();
  if (!pages.hasNextPage) return null;
  return pages.isFetchingNextPage ? (
    <Skeleton aria-label={t`Loading…`} className="h-12 w-full rounded-xl" />
  ) : (
    <Button
      variant="outline"
      isDisabled={busy || pages.isFetching}
      onPress={() => void pages.fetchNextPage({ cancelRefetch: false })}
    >
      {pages.isFetchNextPageError ? t`Try again` : t`Load more`}
    </Button>
  );
}
