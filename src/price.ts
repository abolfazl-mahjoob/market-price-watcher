/** Fixed-point parsing: no floating-point arithmetic for monetary values. */
export class InvalidPriceError extends Error {
  constructor() { super('Invalid price format'); this.name = 'InvalidPriceError'; }
}

const digitMap: Record<string, string> = {
  '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
  '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
};

export function parsePrice(raw: string | null | undefined): string | null {
  if (raw == null || !raw.trim()) return null;
  let text = raw.trim().normalize('NFKC')
    .replace(/[۰-۹٠-٩]/g, char => digitMap[char] ?? char)
    .replace(/[٬،]/g, ',')
    .replace(/\s*(?:تومان|ریال|toman|irr|rial)\s*/gi, '')
    .trim();
  // Grouped thousands use a comma, decimals use a dot. Other punctuation is
  // intentionally rejected rather than silently stripping unexpected content.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
    throw new InvalidPriceError();
  }
  text = text.replace(/,/g, '');
  const [whole = '', fractional = ''] = text.split('.');
  if (whole.length > 20) throw new InvalidPriceError();
  const minor = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'));
  if (minor <= 0n) throw new InvalidPriceError();
  return formatMinor(minor);
}

export function formatMinor(minor: bigint): string {
  if (minor < 0n) throw new InvalidPriceError();
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}

export function midpoint(buy: string | null, sell: string | null): string | null {
  if (!buy || !sell) return buy ?? sell;
  const [a, b] = [buy, sell].map(x => {
    const parts = /^([0-9]+)\.([0-9]{2})$/.exec(x);
    if (!parts) throw new InvalidPriceError();
    return BigInt(parts[1]!) * 100n + BigInt(parts[2]!);
  });
  // Half-up at the smallest declared currency subdivision.
  return formatMinor((a! + b! + 1n) / 2n);
}
