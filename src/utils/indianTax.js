const CESS_RATE = 0.04

// FY 2025-26 (AY 2026-27) per public sources; non-senior citizen slabs for Old regime.
// We intentionally keep this calculator limited to salary income at normal rates.
const OLD_SLABS = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 0.05 },
  { upTo: 1000000, rate: 0.2 },
  { upTo: Infinity, rate: 0.3 },
]

// New regime slabs FY 2025-26:
const NEW_SLABS = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.1 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.2 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
]

function clamp0(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, v)
}

export function computeSlabTax(income, slabs) {
  let remaining = clamp0(income)
  let lastCap = 0
  let tax = 0

  for (const slab of slabs) {
    const cap = slab.upTo
    const band = Math.max(0, Math.min(remaining, cap - lastCap))
    tax += band * slab.rate
    remaining -= band
    lastCap = cap
    if (remaining <= 0) break
  }

  return tax
}

export function computeCess(tax) {
  return clamp0(tax) * CESS_RATE
}

export function compute87ARebateOld(taxableIncome, slabTax) {
  // Old regime: rebate up to ₹12,500 if total income <= ₹5,00,000
  if (clamp0(taxableIncome) <= 500000) return Math.min(clamp0(slabTax), 12500)
  return 0
}

export function compute87ARebateNew(taxableIncome, slabTax) {
  // New regime FY 2025-26: rebate up to ₹60,000 if total income <= ₹12,00,000
  if (clamp0(taxableIncome) <= 1200000) return Math.min(clamp0(slabTax), 60000)
  return 0
}

export function computeTaxOldRegime({
  annualGrossSalary,
  exemptions = 0,
  housePropertyInterestDeduction = 0,
  standardDeduction = 50000,
  professionalTax = 0,
  otherDeductions = 0,
} = {}) {
  const gross = clamp0(annualGrossSalary)
  const exempt = Math.min(gross, clamp0(exemptions))
  const afterExemptions = Math.max(0, gross - exempt)
  const hpDeduction = Math.min(200000, clamp0(housePropertyInterestDeduction))
  const deductions =
    clamp0(standardDeduction) +
    clamp0(professionalTax) +
    clamp0(otherDeductions) +
    hpDeduction
  const taxableIncome = Math.max(0, afterExemptions - deductions)

  const slabTax = computeSlabTax(taxableIncome, OLD_SLABS)
  const rebate = compute87ARebateOld(taxableIncome, slabTax)
  const taxAfterRebate = Math.max(0, slabTax - rebate)
  const cess = computeCess(taxAfterRebate)
  const totalTax = taxAfterRebate + cess

  return {
    taxableIncome,
    slabTax,
    rebate,
    cess,
    totalTax,
    exemptions: exempt,
    housePropertyInterestDeduction: hpDeduction,
  }
}

export function computeTaxNewRegime({
  annualGrossSalary,
  exemptions = 0,
  standardDeduction = 75000,
  // Professional tax is not applied as a deduction in the new regime in this tool (per requirement).
  professionalTax = 0,
  // New regime disallows most deductions; we keep this field for future extension but default to 0.
  otherDeductions = 0,
} = {}) {
  const gross = clamp0(annualGrossSalary)
  const exempt = Math.min(gross, clamp0(exemptions))
  const afterExemptions = Math.max(0, gross - exempt)
  const deductions = clamp0(standardDeduction) + clamp0(otherDeductions)
  const taxableIncome = Math.max(0, afterExemptions - deductions)

  const slabTax = computeSlabTax(taxableIncome, NEW_SLABS)
  const rebate = compute87ARebateNew(taxableIncome, slabTax)
  const taxAfterRebate = Math.max(0, slabTax - rebate)
  const cess = computeCess(taxAfterRebate)
  const totalTax = taxAfterRebate + cess

  return { taxableIncome, slabTax, rebate, cess, totalTax, exemptions: exempt }
}

