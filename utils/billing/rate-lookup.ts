import { rates } from "../../marketing/src/data/rates";

// Lessons are stored with a free-text subject, and the rate sheet is keyed by
// subject name. Match on the normalised name, then fall back to the closest
// containing name, so "IB Economics HL" still finds "Economics HL / SL".
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();

const table = rates.map((rate) => ({
  key: normalise(rate.name),
  koKey: rate.nameKo ? normalise(rate.nameKo) : null,
  price: rate.price,
}));

/** Hourly rate in KRW for a lesson subject, or null when nothing matches. */
export function hourlyRateFor(subject: string | null | undefined) {
  if (!subject) return null;
  const target = normalise(subject);
  if (!target) return null;

  const exact = table.find((row) => row.key === target || row.koKey === target);
  if (exact) return exact.price;

  const partial = table
    .filter((row) => target.includes(row.key) || row.key.includes(target))
    .sort((a, b) => b.key.length - a.key.length)[0];
  return partial?.price ?? null;
}

/** Charge for one lesson, rounded to the won. Null when the subject is unpriced. */
export function lessonAmountKrw(subject: string | null | undefined, minutes: number | null) {
  const hourly = hourlyRateFor(subject);
  if (hourly === null || !minutes || minutes <= 0) return null;
  return Math.round((hourly * minutes) / 60);
}
