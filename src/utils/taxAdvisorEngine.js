import { computeTaxOldRegime } from './indianTax'

const CAP_80C = 150_000
const CAP_80D = 50_000
const CAP_80CCD1B = 50_000
const CAP_24B = 200_000
const STANDARD_DEDUCTION_OLD = 50_000

function clamp0(n) {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

function sectionTotal(deduction80C, deduction80D, deduction80CCD1B, otherSectionDeductions) {
  return (
    Math.min(clamp0(deduction80C), CAP_80C) +
    Math.min(clamp0(deduction80D), CAP_80D) +
    Math.min(clamp0(deduction80CCD1B), CAP_80CCD1B) +
    clamp0(otherSectionDeductions)
  )
}

function oldTaxTotal(args) {
  return computeTaxOldRegime(args).totalTax || 0
}

/**
 * Personalised “AI Tax Advisor” copy + scored suggestions after old/new comparison.
 * Savings are marginal vs your current Old-regime tax (each action estimated alone).
 */
export function buildTaxAdvisorAdvice({
  annualGrossSalary,
  exemptions,
  professionalTax,
  housePropertyInterest,
  deduction80C,
  deduction80D,
  deduction80CCD1B,
  otherSectionDeductions,
  taxOld,
  taxNew,
}) {
  const gross = clamp0(annualGrossSalary)
  if (gross <= 0) {
    return {
      preferredRegime: 'New',
      summaryQuote: '',
      optimisationScore: 0,
      potentialExtraSavings: 0,
      suggestions: [],
    }
  }

  const ex = clamp0(exemptions)
  const pt = clamp0(professionalTax)
  const hp = clamp0(housePropertyInterest)
  const hpCapped = Math.min(CAP_24B, hp)
  const baseOther = sectionTotal(deduction80C, deduction80D, deduction80CCD1B, otherSectionDeductions)

  const baseArgs = {
    annualGrossSalary: gross,
    exemptions: ex,
    housePropertyInterestDeduction: hp,
    standardDeduction: STANDARD_DEDUCTION_OLD,
    professionalTax: pt,
    otherDeductions: baseOther,
  }

  const baselineTax = oldTaxTotal(baseArgs)
  const preferredRegime = (taxNew || 0) <= (taxOld || 0) ? 'New' : 'Old'

  const room80CCD1B = Math.max(0, CAP_80CCD1B - Math.min(clamp0(deduction80CCD1B), CAP_80CCD1B))
  const room80D = Math.max(0, CAP_80D - Math.min(clamp0(deduction80D), CAP_80D))
  const room80C = Math.max(0, CAP_80C - Math.min(clamp0(deduction80C), CAP_80C))
  const room24 = Math.max(0, CAP_24B - hpCapped)

  const candidates = []

  if (room80CCD1B > 0) {
    const other = baseOther + room80CCD1B
    const after = oldTaxTotal({ ...baseArgs, otherDeductions: other })
    const save = Math.max(0, baselineTax - after)
    if (save > 0) {
      candidates.push({
        id: '80ccd1b',
        icon: 'retirement',
        title: 'Boost retirement savings with NPS',
        section: '80CCD(1B)',
        saveAmount: save,
        description: `You have about ₹${formatInr(room80CCD1B)} of headroom under Section 80CCD(1B). Contributing more to NPS (within limits) can reduce Old-regime taxable income.`,
      })
    }
  }

  if (room80D > 0) {
    const other = baseOther + room80D
    const after = oldTaxTotal({ ...baseArgs, otherDeductions: other })
    const save = Math.max(0, baselineTax - after)
    if (save > 0) {
      candidates.push({
        id: '80d',
        icon: 'health',
        title: "Secure parents' health insurance",
        section: '80D',
        saveAmount: save,
        description: `Use remaining Section 80D room (about ₹${formatInr(
          room80D,
        )}) for self/family or parents’ health premiums—senior parents have higher sub-limits in rules.`,
      })
    }
  }

  if (room80C > 0) {
    const other = baseOther + room80C
    const after = oldTaxTotal({ ...baseArgs, otherDeductions: other })
    const save = Math.max(0, baselineTax - after)
    if (save > 0) {
      candidates.push({
        id: '80c',
        icon: 'invest',
        title: 'Top up Section 80C (EPF / ELSS / PPF)',
        section: '80C',
        saveAmount: save,
        description: `About ₹${formatInr(
          room80C,
        )} remains under the ₹1.5 lakh 80C umbrella. ELSS, PPF, or voluntary EPF can fill the gap if it fits your goals.`,
      })
    }
  }

  if (room24 > 0) {
    const after = oldTaxTotal({
      ...baseArgs,
      housePropertyInterestDeduction: hp + room24,
    })
    const save = Math.max(0, baselineTax - after)
    if (save > 0) {
      candidates.push({
        id: '24b',
        icon: 'home',
        title: 'Utilise housing loan interest (Section 24)',
        section: '24(b)',
        saveAmount: save,
        description: `Self-occupied home loan interest is generally capped at ₹2 lakh/year under Section 24(b). You still have about ₹${formatInr(
          room24,
        )} of that headroom in this estimate.`,
      })
    }
  }

  const illustrative80G = 25_000
  const otherWith80g = baseOther + illustrative80G
  const after80g = oldTaxTotal({ ...baseArgs, otherDeductions: otherWith80g })
  const save80g = Math.max(0, baselineTax - after80g)
  if (save80g > 500) {
    candidates.push({
      id: '80g',
      icon: 'give',
      title: 'Donate to approved charities',
      section: '80G',
      saveAmount: save80g,
      description:
        'Illustrative: adding ₹25,000 of eligible 80G-style donations (subject to approval % and caps in law) shows meaningful Old-regime relief at your slab—verify with an auditor.',
    })
  }

  candidates.sort((a, b) => b.saveAmount - a.saveAmount)
  const suggestions = candidates.slice(0, 5)

  const fullyOptimizedOther = baseOther + room80C + room80D + room80CCD1B
  const fullyOptimizedHp = Math.min(CAP_24B, hp + room24)
  const bestOldTax = oldTaxTotal({
    ...baseArgs,
    otherDeductions: fullyOptimizedOther,
    housePropertyInterestDeduction: fullyOptimizedHp,
  })
  const potentialExtraSavings = Math.max(0, Math.round(baselineTax - bestOldTax))

  const usedRatio =
    (Math.min(clamp0(deduction80C), CAP_80C) +
      Math.min(clamp0(deduction80D), CAP_80D) +
      Math.min(clamp0(deduction80CCD1B), CAP_80CCD1B) +
      hpCapped) /
    (CAP_80C + CAP_80D + CAP_80CCD1B + CAP_24B)
  const optimisationScore = Math.max(0, Math.min(100, Math.round(Math.min(1, usedRatio * 1.12) * 100)))

  const highSalary = gross >= 15_00_000
  let summaryQuote = ''
  if (preferredRegime === 'New') {
    summaryQuote = highSalary
      ? 'With a higher salary and the New regime looking cheaper on these numbers, your biggest lever is still Old-regime deductions—NPS (80CCD(1B)), insurance (80D), and home-loan interest (24(b))—if they apply to you.'
      : 'The New regime edges out on this estimate. If you can claim meaningful Chapter VI-A deductions, re-check the Old regime with updated numbers—it sometimes wins once NPS, 80D, and housing interest are in play.'
  } else {
    summaryQuote = highSalary
      ? 'The Old regime is ahead with your current inputs. Closing unused caps (80C, 80D, NPS) and recording all eligible interest can further improve the picture—see the actions below.'
      : 'Old regime looks better for you right now. Use the suggestions to capture any remaining headroom so you are not leaving slab benefit on the table.'
  }

  return {
    preferredRegime,
    summaryQuote,
    optimisationScore,
    potentialExtraSavings,
    suggestions,
  }
}

function formatInr(n) {
  return Math.round(n).toLocaleString('en-IN')
}
