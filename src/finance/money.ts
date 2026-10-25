export function parseMoney(value: string): number {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) throw new Error('Enter an amount with up to two decimal places.')

  const sign = match[1] === '-' ? -1n : 1n
  const whole = BigInt(match[2])
  const fraction = BigInt((match[3] ?? '').padEnd(2, '0'))
  const minorUnits = sign * (whole * 100n + fraction)
  const result = Number(minorUnits)

  if (!Number.isSafeInteger(result)) throw new Error('The amount is too large.')
  return result
}

export function toMoneyInput(minorUnits: number): string {
  if (!Number.isSafeInteger(minorUnits)) throw new Error('Money must use safe integer minor units.')
  const amount = BigInt(minorUnits)
  const absolute = amount < 0n ? -amount : amount
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}

export function formatMoney(
  minorUnits: number,
  currency: string,
  locale = 'en-US',
): string {
  if (!Number.isSafeInteger(minorUnits)) throw new Error('Money must use safe integer minor units.')

  const absolute = BigInt(Math.abs(minorUnits))
  const whole = absolute / 100n
  const fraction = (absolute % 100n).toString().padStart(2, '0')
  const groupedWhole = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).formatToParts(whole)
  const template = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(minorUnits < 0 ? -1n : 1n)
  let insertedWhole = false

  return template
    .flatMap((part) => {
      if (part.type === 'integer' && !insertedWhole) {
        insertedWhole = true
        return groupedWhole
      }
      if (part.type === 'integer' || part.type === 'group') return []
      if (part.type === 'fraction') return [{ ...part, value: fraction }]
      return [part]
    })
    .map((part) => part.value)
    .join('')
}