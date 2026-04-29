const DEFAULT_HORIZON_YEARS = 20
const INFLATION_ANNUAL = 0.06
const WITHDRAWAL_MULTIPLIER = 25
const MIN_CORPUS = 10_000_000
const MAX_CORPUS = 150_000_000

/**
 * Personalized retirement corpus needed at end of horizon (4%-rule style on retirement-year expenses).
 * @param {{
 *   netMonthlyFromTax: number,
 *   bankMedianSalaryCredit: number | null,
 *   bankEstimatedSipMonthly: number,
 *   horizonYears?: number,
 * }} p
 */
export function computeRetirementCorpusTarget({
  netMonthlyFromTax,
  bankMedianSalaryCredit,
  bankEstimatedSipMonthly,
  horizonYears = DEFAULT_HORIZON_YEARS,
}) {
  const taxNet = Math.max(0, netMonthlyFromTax)
  const bankNet = bankMedianSalaryCredit != null && bankMedianSalaryCredit > 0 ? bankMedianSalaryCredit : null

  let monthlyLivingBase
  if (bankNet != null && taxNet > 0) {
    monthlyLivingBase = 0.65 * bankNet + 0.35 * taxNet
  } else if (bankNet != null) {
    monthlyLivingBase = bankNet
  } else {
    monthlyLivingBase = taxNet
  }

  let spendRatio = 0.7
  if (bankEstimatedSipMonthly > 0 && monthlyLivingBase > 0) {
    const sipShare = Math.min(0.45, bankEstimatedSipMonthly / monthlyLivingBase)
    spendRatio = Math.min(0.86, Math.max(0.52, 1 - sipShare - 0.06))
  }

  const annualExpenseToday = monthlyLivingBase * 12 * spendRatio
  const years = Math.max(1, horizonYears)
  const annualExpenseAtHorizon = annualExpenseToday * Math.pow(1 + INFLATION_ANNUAL, years)
  let target = annualExpenseAtHorizon * WITHDRAWAL_MULTIPLIER
  target = Math.max(MIN_CORPUS, Math.min(MAX_CORPUS, Math.round(target)))

  return {
    target,
    horizonYears: years,
    monthlyLivingBase: Math.round(monthlyLivingBase),
    spendRatio,
    annualExpenseToday: Math.round(annualExpenseToday),
    annualExpenseAtHorizon: Math.round(annualExpenseAtHorizon),
    inflationAnnual: INFLATION_ANNUAL,
    withdrawalMultiplier: WITHDRAWAL_MULTIPLIER,
    usedBankSalary: bankNet != null,
  }
}

/**
 * Dynamic corpus from rich bank analysis (credits/debits/month-end balances + optional salary lines).
 * Call only when `analysis.hasStatementPattern` is true.
 * @param {object} analysis — result of analyzeBankStatement()
 */
export function computeRetirementCorpusFromRichBankAnalysis(analysis, netMonthlyFromTax, horizonYears = DEFAULT_HORIZON_YEARS) {
  const taxNet = Math.max(0, netMonthlyFromTax)
  const medSal = analysis?.medianSalaryCredit
  const medCr = analysis?.medianCreditTxnAmount
  const medDr = analysis?.medianDebitTxnAmount
  const balances = Array.isArray(analysis?.monthEndBalances) ? analysis.monthEndBalances : []
  const sip = analysis?.estimatedSipMonthly || 0
  const spanMonths = Math.max(1, analysis?.estimatedStatementMonths || 1)

  const tabular = Boolean(analysis?.usedTabularMonthlyAnalysis)
  const mmDep = analysis?.medianMonthlyDepositTotal
  const mmWdr = analysis?.medianMonthlyWithdrawalTotal
  const mmNet = analysis?.medianMonthlyNetFlow
  const mmEndBal = analysis?.medianMonthEndingBalance
  const emiMonthly = Math.max(0, analysis?.estimatedMonthlyEmiTotal || 0)

  let monthlyInflow = null
  if (tabular && mmDep != null && mmDep > 0 && taxNet > 0) {
    monthlyInflow = 0.58 * mmDep + 0.42 * taxNet
  } else if (tabular && mmDep != null && mmDep > 0) {
    monthlyInflow = mmDep
  } else if (medSal != null && medSal > 0 && taxNet > 0) {
    monthlyInflow = 0.62 * medSal + 0.38 * taxNet
  } else if (medSal != null && medSal > 0) {
    monthlyInflow = medSal
  } else if (medCr != null && medCr > 0 && taxNet > 0) {
    monthlyInflow = 0.55 * medCr + 0.45 * taxNet
  } else if (medCr != null && medCr > 0) {
    monthlyInflow = medCr
  } else {
    monthlyInflow = taxNet
  }

  if (monthlyInflow == null || monthlyInflow <= 0) monthlyInflow = taxNet

  let spendRatio = 0.68
  if (tabular && mmWdr != null && mmWdr > 0 && monthlyInflow > 0) {
    spendRatio = Math.min(0.94, Math.max(0.42, mmWdr / monthlyInflow))
  } else if (medDr != null && medDr > 0 && monthlyInflow > 0) {
    spendRatio = Math.min(0.92, Math.max(0.44, medDr / monthlyInflow))
  }

  if (tabular && mmNet != null && Number.isFinite(mmNet) && monthlyInflow > 0) {
    const impliedSpend = monthlyInflow - mmNet
    if (impliedSpend > 0) {
      const r = impliedSpend / monthlyInflow
      spendRatio = Math.min(0.94, Math.max(0.42, (spendRatio * 0.55 + r * 0.45)))
    }
  }

  if (balances.length >= 2) {
    const first = balances[0]
    const last = balances[balances.length - 1]
    const monthsForTrend = Math.max(1, spanMonths - 1)
    const avgBalanceChange = (last - first) / monthsForTrend
    if (monthlyInflow > 0 && Number.isFinite(avgBalanceChange)) {
      const impliedSpend = monthlyInflow - avgBalanceChange
      if (impliedSpend > 0) {
        spendRatio = Math.min(0.92, Math.max(0.42, spendRatio * 0.65 + (impliedSpend / monthlyInflow) * 0.35))
      }
    }
  }

  if (tabular && mmEndBal != null && mmEndBal > 0 && monthlyInflow > 0 && mmWdr != null && mmWdr > 0) {
    spendRatio = Math.min(0.93, Math.max(0.43, spendRatio))
  }

  if (sip > 0 && monthlyInflow > 0) {
    const sipShare = Math.min(0.45, sip / monthlyInflow)
    spendRatio = Math.min(0.9, Math.max(0.44, spendRatio - sipShare * 0.38))
  }

  if (emiMonthly > 0 && monthlyInflow > 0) {
    const emiShare = Math.min(0.55, emiMonthly / monthlyInflow)
    spendRatio = Math.min(0.93, Math.max(0.44, spendRatio + emiShare * 0.12))
  }

  const monthlyLivingBase = monthlyInflow
  const years = Math.max(1, horizonYears)
  const annualExpenseToday = monthlyLivingBase * 12 * spendRatio
  const annualExpenseAtHorizon = annualExpenseToday * Math.pow(1 + INFLATION_ANNUAL, years)
  let target = annualExpenseAtHorizon * WITHDRAWAL_MULTIPLIER
  target = Math.max(MIN_CORPUS, Math.min(MAX_CORPUS, Math.round(target)))

  return {
    target,
    horizonYears: years,
    monthlyLivingBase: Math.round(monthlyLivingBase),
    spendRatio,
    annualExpenseToday: Math.round(annualExpenseToday),
    annualExpenseAtHorizon: Math.round(annualExpenseAtHorizon),
    inflationAnnual: INFLATION_ANNUAL,
    withdrawalMultiplier: WITHDRAWAL_MULTIPLIER,
    usedBankSalary: medSal != null && medSal > 0,
    usedCreditDebitRemarks: (analysis?.creditTxnCount || 0) >= 2 && (analysis?.debitTxnCount || 0) >= 2,
    usedMonthEndBalances: balances.length >= 2,
    usedTabularMonthly: tabular,
    usedRecurringEmiSignal: emiMonthly > 0,
  }
}
