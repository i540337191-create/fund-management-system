// Display exact textual amounts without changing stored values or inventing a currency.
export function formatAmountLabel(text: string): string | null {
  const match = text.trim().match(/^(人民币\s*|CNY\s*|[¥￥]\s*)?([+-]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*(亿元|万元|元|亿|万)$/);
  if (!match) return null;
  const [, currency, sign, number, unit] = match;
  const [whole, fraction = ''] = number.replace(/,/g, '').split('.');
  const scale = unit.startsWith('亿') ? 8 : unit.startsWith('万') ? 4 : 0;
  const coefficient = BigInt((whole || '0') + fraction) * 10n ** BigInt(scale);
  const suffix = [[9, 'B'], [6, 'M'], [3, 'K'], [0, '']] as const;
  const [exponent, label] = suffix.find(([exponent]) => coefficient >= 10n ** BigInt(fraction.length + exponent)) ?? suffix[3];
  const decimals = fraction.length + exponent;
  const digits = coefficient.toString().padStart(decimals + 1, '0');
  const integer = decimals ? digits.slice(0, -decimals) : digits;
  const tail = decimals ? digits.slice(-decimals).replace(/0+$/, '') : '';
  return `${currency || unit.endsWith('元') ? 'CNY ' : ''}${sign === '-' && coefficient !== 0n ? '-' : sign === '+' ? '+' : ''}${integer}${tail ? '.' + tail : ''}${label}`;
}
