import { tableTitle } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";

export function useTableTitle() {
  const { t, i18n } = useLingui();
  const numberedTableTitle = (number?: number) =>
    number === undefined ? t`Table` : `${t`Table`} #${i18n.number(number)}`;
  return {
    getTableTitle: (record: Parameters<typeof tableTitle>[0]) =>
      tableTitle(record, numberedTableTitle),
    numberedTableTitle,
  };
}
