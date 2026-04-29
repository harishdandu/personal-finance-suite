export function calcSIPFutureValue({
  monthlyAmount,
  years,
  annualReturnPercent,
  stepUpPercentPerYear = 0,
}) {
  const months = Math.max(0, Math.round(years * 12));
  const rAnnual = Math.max(0, annualReturnPercent) / 100;
  const monthlyRate = rAnnual / 12;

  const stepMultiplier = 1 + (stepUpPercentPerYear || 0) / 100;

  let principal = 0;
  let futureValue = 0;

  // Payments at the end of each month.
  for (let p = 0; p < months; p++) {
    const yearIndex = Math.floor(p / 12); // 0-based year bucket
    const payment = (monthlyAmount || 0) * Math.pow(stepMultiplier, yearIndex);
    const exponent = months - p - 1; // last payment exponent 0
    principal += payment;
    futureValue += payment * Math.pow(1 + monthlyRate, exponent);
  }

  return { principal, futureValue, interest: futureValue - principal };
}

// Step-up SIP only for `sipYears` and then stop investing for the remaining years.
// The existing corpus continues to compound for the full `totalYears`.
export function calcStepUpSIPThenStopFutureValue({
  monthlyAmount,
  totalYears,
  annualReturnPercent,
  stepUpPercentPerYear = 0,
  sipYears,
}) {
  const months = Math.max(0, Math.round(totalYears * 12))
  const sipMonths = Math.max(0, Math.round((sipYears || 0) * 12))

  const rAnnual = Math.max(0, annualReturnPercent) / 100
  const monthlyRate = rAnnual / 12

  const stepMultiplier = 1 + (stepUpPercentPerYear || 0) / 100

  let principal = 0
  let futureValue = 0

  for (let p = 0; p < months; p++) {
    let payment = 0
    if (p < sipMonths) {
      const yearIndex = Math.floor(p / 12) // 0-based within the SIP window
      payment = (monthlyAmount || 0) * Math.pow(stepMultiplier, yearIndex)
      principal += payment
    }

    const exponent = months - p - 1
    if (payment > 0) {
      futureValue += payment * Math.pow(1 + monthlyRate, exponent)
    }
  }

  return { principal, futureValue, interest: futureValue - principal }
}

export function calcLumpsumFutureValue({
  lumpsumAmount,
  years,
  annualReturnPercent,
}) {
  const rAnnual = Math.max(0, annualReturnPercent) / 100;
  const monthlyRate = rAnnual / 12;
  const months = Math.max(0, Math.round(years * 12));

  const principal = lumpsumAmount || 0;
  const futureValue = principal * Math.pow(1 + monthlyRate, months);
  return { principal, futureValue, interest: futureValue - principal };
}

function roundToInt(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function formatIndianRupees(value) {
  const n = roundToInt(value);
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(n).toString();

  if (s.length <= 3) return `${sign}${s}`;

  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const restWithCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');

  return `${sign}${restWithCommas},${last3}`;
}

function formatCompact(value, unit, divisor) {
  const v = (value || 0) / divisor;
  const raw = v.toFixed(2);
  const trimmed = raw.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  return `${trimmed} ${unit}`;
}

export function formatRupees(value, { compact = false } = {}) {
  if (!Number.isFinite(value)) return '₹0';
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e7) return `₹${formatCompact(value, 'CR', 1e7)}`;
    if (abs >= 1e5) return `₹${formatCompact(value, 'L', 1e5)}`;
  }
  return `₹${formatIndianRupees(value)}`;
}

export function clampNumber(value, min, max) {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

