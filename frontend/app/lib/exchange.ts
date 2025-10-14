export type CurrencyCode = 'usd' | 'hkd' | 'cny'

const exchangeRates: Record<CurrencyCode, Record<CurrencyCode, number>> = {
  usd: { usd: 1, hkd: 7.7585, cny: 7.2468 },
  hkd: { usd: 0.1289, hkd: 1, cny: 0.9342 },
  cny: { usd: 0.138, hkd: 1.0705, cny: 1 },
}

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (!Number.isFinite(amount)) return 0
  if (from === to) return amount

  const rate = exchangeRates[from]?.[to]
  if (rate === undefined) {
    throw new Error(`Unsupported currency conversion: ${from} -> ${to}`)
  }

  return amount * rate
}

export function convertAllTo(
  values: Array<{ amount: number; currency: CurrencyCode }>,
  target: CurrencyCode,
): number {
  return values.reduce((total, { amount, currency }) => {
    return total + convertCurrency(amount, currency, target)
  }, 0)
}

export function getExchangeRates() {
  return exchangeRates
}
