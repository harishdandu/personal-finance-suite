export function sanitizeDigits(value) {
  const raw = String(value ?? '')
  const digits = raw.replace(/\D+/g, '')
  if (digits === '') return ''
  // remove leading zeros (but keep single '0' if all zeros)
  const trimmed = digits.replace(/^0+(?=\d)/, '')
  return trimmed
}

export function toNumberOr0(value) {
  const v = Number(value)
  return Number.isFinite(v) ? v : 0
}

