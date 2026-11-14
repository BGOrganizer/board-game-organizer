/** Header-only geometry. Colors stay owned by each HeroUI action variant. */
export const HEADER_ICON_CLASS = "size-5 shrink-0";
export const headerButtonProps = {
  isIconOnly: true,
  size: "sm",
  className: "min-h-11 min-w-11",
} as const;
// Link and compound triggers retain their own semantics; never nest another button inside them.
export const headerControlClassName =
  "button button--sm button--icon-only button--ghost min-h-11 min-w-11";
