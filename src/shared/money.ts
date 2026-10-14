// Amounts are integer Rappen. Display follows Swiss conventions: CHF 12’345.50
const nf0 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const chf = (rp: number, decimals = false) => "CHF " + (decimals ? nf2 : nf0).format(rp / 100);
export const amount2 = (rp: number) => nf2.format(rp / 100);
/** Editable form value, e.g. 12'345.50 */
export const plain = (rp: number) => nf2.format(rp / 100).replace(/’/g, "'");

export function chfShort(rp: number): string {
  const v = rp / 100;
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 2).replace(/\.?0+$/, "") + "M";
  if (v >= 1000) return Math.round(v / 1000) + "k";
  return String(Math.round(v));
}

/** Parses user input like "12'345.50", "12 345,5" or "CHF 80" into Rappen; NaN if invalid. */
export function parseChf(input: string): number {
  const s = input.replace(/CHF/i, "").replace(/['’\s]/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === "." || !/^-?\d*\.?\d*$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}
