export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

function getDateParts(date: Date, timeZone = SAO_PAULO_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Falha ao extrair partes da data.");
  }

  return { year, month, day };
}

export function getSaoPauloDateIso(date = new Date()) {
  const { year, month, day } = getDateParts(date);
  return `${year}-${month}-${day}`;
}

export function getSaoPauloYearMonth(date = new Date()) {
  const { year, month } = getDateParts(date);
  return `${year}-${month}`;
}

export function addDaysToIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return getSaoPauloDateIso(base);
}

export function startOfSaoPauloWeekIso(date = new Date()) {
  const todayIso = getSaoPauloDateIso(date);
  const [year, month, day] = todayIso.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = noonUtc.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToIsoDate(todayIso, diff);
}

export function parseAppDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00Z`);
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed.replace(" ", "T") + "Z");
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)) {
    return new Date(trimmed + "Z");
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTime(value: string | Date | null | undefined, locale = "pt-BR") {
  const date = parseAppDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined, locale = "pt-BR") {
  const date = parseAppDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);
}

export function formatLongDate(value: string | Date | null | undefined, locale = "pt-BR") {
  const date = parseAppDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);
}
