/** The chip glyph. ◎ is play money with no real-world value. */
export const CURRENCY = '◎';

/** Cents → "◎ 1,250.00". Negative amounts keep their sign: "−◎ 12.50". */
export function formatCents(cents: number, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  const { sign = false, symbol = true } = opts;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  const body = `${symbol ? `${CURRENCY} ` : ''}${whole}.${frac}`;
  if (cents < 0) return `−${body}`;
  return sign && cents > 0 ? `+${body}` : body;
}

/** "12.5" / "1,250" / "◎ 3" → cents, or null when it isn't a non-negative amount. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(CURRENCY, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

/** Cents each of the 100 table chips is worth at this buy-in. */
export const chipValueFor = (buyInCents: number): number => buyInCents / 100;

/** A stack of table chips as money. */
export const stackCents = (chips: number, chipValueCents: number): number => Math.round(chips * chipValueCents);
