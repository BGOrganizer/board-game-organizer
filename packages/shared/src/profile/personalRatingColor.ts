/** Semantic rating bands shared by web and native. Missing ratings remain neutral. */
export function personalRatingColor(rating: number | null | undefined) {
  if (rating == null || !Number.isFinite(rating) || rating < 0 || rating > 10) return "default";
  if (rating < 4) return "danger";
  if (rating < 7) return "warning";
  if (rating < 9) return "accent";
  return "success";
}
