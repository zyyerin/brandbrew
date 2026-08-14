const DEFAULT_STORAGE_TIME_ZONE = "Asia/Shanghai";

function partsForTimeZone(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatStorageTimestamp(
  date: Date,
  timeZone = DEFAULT_STORAGE_TIME_ZONE,
): string {
  const parts = partsForTimeZone(date, timeZone);
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function imageExtension(mimeType: string): "jpg" | "png" | "webp" {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  return "png";
}

function safePathSegment(value: string, fallback: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return safe || fallback;
}

export function buildImageBaseName(
  cardType: string,
  mimeType: string,
  date = new Date(),
  uniqueId = crypto.randomUUID(),
): string {
  const type = safePathSegment(cardType, "image");
  const suffix = safePathSegment(uniqueId.replace(/-/g, ""), "00000000").slice(0, 8).padEnd(8, "0");
  return `${type}-${formatStorageTimestamp(date)}-${suffix}.${imageExtension(mimeType)}`;
}
