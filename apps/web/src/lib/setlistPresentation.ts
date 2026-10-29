export const SETLIST_STATUSES = [
  "official",
  "confirmed",
  "observed",
  "prediction",
  "rotation",
  "draft",
  "archive",
];

export function setlistStatusLabel(status: string | undefined, t: (id: string) => string): string {
  const value = status ?? "draft";
  return SETLIST_STATUSES.includes(value) ? t(`setlist-status-${value}`) : value;
}
