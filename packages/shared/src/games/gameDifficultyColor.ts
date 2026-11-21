export function gameDifficultyColor(weight: number | null | undefined) {
  if (weight == null || !Number.isFinite(weight) || weight < 1 || weight > 5) return undefined;
  if (weight <= 1.5) return "success";
  if (weight <= 3) return "warning";
  if (weight <= 4) return "accent";
  return "danger";
}
