// SQLite CURRENT_TIMESTAMP is UTC; ISO timestamps already carry their own zone.
export function studyTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !value.trim()) return NaN;
  const text = value.trim();
  const sqliteDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text);
  const isoDate = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(text);
  if (!sqliteDate && !isoDate) return NaN;
  const timestamp = sqliteDate
    ? `${text.replace(" ", "T")}Z` : text;
  return Date.parse(timestamp);
}

export function formatStudyDate(value, language = "en", fallback = "—") {
  const timestamp = studyTimestamp(value);
  // Keep unfamiliar legacy display dates rather than guessing a different date.
  if (!Number.isFinite(timestamp)) return typeof value === "string" && value.trim() ? value : fallback;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(timestamp));
}
