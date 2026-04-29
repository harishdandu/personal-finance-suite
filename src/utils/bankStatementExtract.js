import { extractTextFromPdf, ocrImageFile } from './payslipExtract'

function normalizeWhitespace(text) {
  return (text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

function parseAmount(str) {
  if (str == null) return null
  const s = String(str).trim()
  if (s === '' || s === '-' || /^nil$/i.test(s)) return null
  const cleaned = s.replace(/[₹,]/g, '').replace(/[^0-9.]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Rupee-like amounts on a line (typical txn size). */
function amountsInLine(line, minAmt = 3_000, maxAmt = 5_000_000) {
  const re = /₹?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/g
  const out = []
  let m
  while ((m = re.exec(line)) !== null) {
    const v = parseAmount(m[1])
    if (v >= minAmt && v <= maxAmt) out.push(v)
  }
  return out
}

function amountsInLineWide(line) {
  return amountsInLine(line, 500, 500_000_000)
}

const SALARY_LINE_RE =
  /salary|payroll|pay\s*roll|monthly\s*(pay|payment|sal)|wages|stipend|sal\.?\s*credit|salary\s*credit|emp\.?\s*pay|employee\s*pay|neft.*sal|imps.*sal|cms.*sal|sal\s+from|pay\s*slip|payout|disbursal/i

const SIP_LINE_RE =
  /sip|systematic|mutual\s*fund|\bmf\b|cam|kfintech|karvy|zerodha|groww|navi|ppfas|nippon|hdfc\s*mf|icici\s*pru|axis\s*mf|sbi\s*mf|uti\s*mf|kuvera/i

const CLOSING_BALANCE_LINE_RE =
  /closing\s*balance|cl\.?\s*balance|book\s*balance|available\s*balance|eod\s*balance|balance\s*as\s*on|bal\.?\s*carried|closing\s*bal/i

const CREDIT_REMARK_RE =
  /(?:^|\s)(?:cr|credit|credited|deposit|deposited|inward|received|by\s*transfer|neft\s*in|imps\s*in|rtgs\s*in|salary|refund|reversal|\+)\b/i

const DEBIT_REMARK_RE =
  /(?:^|\s)(?:dr|debit|debited|upi|nfs|pos|atm\s*wd|withdrawal|payment|paid|emi|nach|ach|si\s|standing\s*instr|imps\s*out|neft\s*out|bill\s*pay|merchant|purchase)\b/i

/** Narration suggests loan / instalment / auto-debit style outflow. */
const EMI_LIKE_REMARK_RE =
  /\bemi\b|nach|ach\b|loan|instal|install|ecs|auto\s*debit|standing\s*instr|si\s|mortgage|personal\s*loan|home\s*loan|car\s*loan|bajaj|hdfc\s*loan|icici\s*loan|kissht|earlysalary/i

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function coefficientOfVariation(arr) {
  if (arr.length < 2) return 1
  const m = mean(arr)
  if (m <= 0) return 1
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length
  return Math.sqrt(v) / m
}

function isFixedAmountCluster(amounts, medianAmt) {
  if (amounts.length < 2 || medianAmt <= 0) return false
  const cv = coefficientOfVariation(amounts)
  const spread = (Math.max(...amounts) - Math.min(...amounts)) / medianAmt
  return cv < 0.12 || spread < 0.09
}

/**
 * Same remark text → repeated withdrawal or deposit with near-constant amount (EMI / rent / SIP-like).
 */
function findRecurringFixedPatternsByRemark(tabularRows) {
  /** @type {Map<string, { displayRemark: string, withdrawals: number[], deposits: number[] }>} */
  const byKey = new Map()

  for (const r of tabularRows) {
    const raw = String(r.remark || '').trim()
    if (raw.length < 5) continue
    const key = raw
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\d{4,}/g, '#')
      .trim()
    if (key.length < 5) continue

    if (!byKey.has(key)) {
      byKey.set(key, { displayRemark: raw.length > 90 ? `${raw.slice(0, 87)}…` : raw, withdrawals: [], deposits: [] })
    }
    const bucket = byKey.get(key)
    if (r.withdrawal > 0) bucket.withdrawals.push(r.withdrawal)
    if (r.deposit > 0) bucket.deposits.push(r.deposit)
  }

  const recurringDebitPatterns = []
  const recurringCreditPatterns = []

  for (const [, v] of byKey) {
    if (v.withdrawals.length >= 2) {
      const med = median(v.withdrawals)
      if (med != null && med >= 150 && isFixedAmountCluster(v.withdrawals, med)) {
        recurringDebitPatterns.push({
          remarkSnippet: v.displayRemark,
          count: v.withdrawals.length,
          medianAmount: Math.round(med),
          isEmiLike: EMI_LIKE_REMARK_RE.test(v.displayRemark),
        })
      }
    }
    if (v.deposits.length >= 2) {
      const med = median(v.deposits)
      if (med != null && med >= 150 && isFixedAmountCluster(v.deposits, med)) {
        recurringCreditPatterns.push({
          remarkSnippet: v.displayRemark,
          count: v.deposits.length,
          medianAmount: Math.round(med),
          isRentOrFixedIncome: /\brent|lease|dividend|interest\s*credited|pension|subsidy\b/i.test(v.displayRemark),
        })
      }
    }
  }

  recurringDebitPatterns.sort((a, b) => b.count - a.count)
  recurringCreditPatterns.sort((a, b) => b.count - a.count)

  let estimatedMonthlyEmiTotal = 0
  for (const p of recurringDebitPatterns) {
    if (p.isEmiLike) estimatedMonthlyEmiTotal += p.medianAmount
  }
  estimatedMonthlyEmiTotal = Math.round(estimatedMonthlyEmiTotal)

  return {
    recurringDebitPatterns: recurringDebitPatterns.slice(0, 10),
    recurringCreditPatterns: recurringCreditPatterns.slice(0, 8),
    estimatedMonthlyEmiTotal,
  }
}

function formatInrInText(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

/**
 * Human-readable bullets for the Autopilot dialog (plain language).
 */
export function buildPatternExplanationLines(analysis) {
  if (!analysis) return []
  const lines = []

  if (analysis.usedTabularMonthlyAnalysis) {
    lines.push(
      `We parsed ${analysis.tabulatedTxnCount} dated transactions into ${analysis.monthlyParsedMonthCount} calendar months using date, remarks, withdrawal, deposit, and balance-style fields.`,
    )
    if (analysis.medianMonthlyDepositTotal != null && analysis.medianMonthlyDepositTotal > 0) {
      lines.push(
        `Month-to-month, typical total credits (deposits) cluster around ${formatInrInText(analysis.medianMonthlyDepositTotal)} per month (median of monthly sums).`,
      )
    }
    if (analysis.medianMonthlyWithdrawalTotal != null && analysis.medianMonthlyWithdrawalTotal > 0) {
      lines.push(
        `Typical total debits (withdrawals) are about ${formatInrInText(analysis.medianMonthlyWithdrawalTotal)} per month (median of monthly sums).`,
      )
    }
    if (analysis.medianMonthlyNetFlow != null && Number.isFinite(analysis.medianMonthlyNetFlow)) {
      const net = analysis.medianMonthlyNetFlow
      lines.push(
        net >= 0
          ? `Net of deposits minus withdrawals is usually positive (about ${formatInrInText(net)} / month), so balances tend to build when that holds.`
          : `Net flow is often negative (about ${formatInrInText(Math.abs(net))} / month out), which implies drawing down or heavy outflows in the window we see.`,
      )
    }
  } else if (analysis.hasStatementPattern) {
    if (analysis.medianSalaryCredit != null && analysis.medianSalaryCredit > 0) {
      lines.push(
        `We matched salary or similar credit wording with amounts near ${formatInrInText(analysis.medianSalaryCredit)}.`,
      )
    }
    if (analysis.creditTxnCount >= 2 && analysis.debitTxnCount >= 2) {
      lines.push(
        `We also classified several lines as credits vs debits from narration (UPI, NEFT, CR/DR, etc.) to estimate inflows and outflows.`,
      )
    }
    if (analysis.monthEndBalanceCount >= 2) {
      lines.push(`Closing-balance phrases appear ${analysis.monthEndBalanceCount} times to sanity-check the trend.`)
    }
  } else {
    lines.push(
      'We could not reliably align columns or narration into a month-wise or recurring pattern, so the plan uses your salary-band default from annual gross.',
    )
  }

  const rd = analysis.recurringDebitPatterns || []
  const rc = analysis.recurringCreditPatterns || []
  if (rd.length) {
    const emis = rd.filter((x) => x.isEmiLike)
    if (emis.length) {
      lines.push(
        `EMI- or loan-style debits: ${emis.length} narration group(s) repeat with stable amounts (combined ~${formatInrInText(analysis.estimatedMonthlyEmiTotal || 0)} / month if summed).`,
      )
    } else {
      lines.push(
        `${rd.length} debit narration(s) repeat with nearly the same amount — often rent, subscriptions, or standing instructions.`,
      )
    }
  }
  if (rc.length) {
    lines.push(
      `${rc.length} credit narration(s) repeat with stable amounts (e.g. recurring transfers or fixed credits).`,
    )
  }

  if (analysis.estimatedSipMonthly > 0) {
    lines.push(
      `Mutual-fund / broker-style debits suggest about ${formatInrInText(analysis.estimatedSipMonthly)} / month going to investments (median).`,
    )
  }

  lines.push(
    'Retirement target blends take-home from tax with bank flows where trusted, assumes ~6% annual inflation to the horizon, then a 25× withdrawal-style rule (capped ₹1–15 Cr).',
  )

  return lines
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
      continue
    }
    if (!inQ && c === ',') {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

/** Normalize header cell for keyword match. */
function normHeader(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First column whose normalized header contains every keyword in a group (order of groups = priority). */
function findColumnIndex(cells, keywordGroups) {
  const hs = cells.map((c) => normHeader(c))
  for (const group of keywordGroups) {
    for (let i = 0; i < hs.length; i++) {
      if (group.every((kw) => hs[i].includes(kw))) return i
    }
  }
  return -1
}

/**
 * Map CSV headers to indices: date, remark, withdrawal, deposit, balance.
 */
function mapStatementColumns(headerCells) {
  const dateIdx = findColumnIndex(headerCells, [
    ['transaction', 'date'],
    ['value', 'date'],
    ['posting', 'date'],
    ['txn', 'date'],
    ['tran', 'date'],
    ['date'],
  ])
  const remarkIdx = findColumnIndex(headerCells, [
    ['remarks'],
    ['narration'],
    ['description'],
    ['particulars'],
    ['details'],
    ['transaction', 'remarks'],
  ])
  const withdrawalIdx = findColumnIndex(headerCells, [
    ['withdrawal'],
    ['withdrawals'],
    ['debit'],
    ['dr'],
    ['payment'],
    ['money', 'out'],
  ])
  const depositIdx = findColumnIndex(headerCells, [
    ['deposit'],
    ['deposits'],
    ['credit'],
    ['cr'],
    ['money', 'in'],
  ])
  const balanceIdx = findColumnIndex(headerCells, [['balance'], ['closing'], ['running', 'balance']])

  return { dateIdx, remarkIdx, withdrawalIdx, depositIdx, balanceIdx }
}

function parseDateToYyyymm(s) {
  if (!s) return null
  const t = String(s).trim()
  const m1 = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (m1) {
    let y = Number(m1[3])
    if (y < 100) y += 2000
    return `${y}-${String(m1[2]).padStart(2, '0')}`
  }
  const m2 = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m2) {
    return `${m2[1]}-${String(m2[2]).padStart(2, '0')}`
  }
  return null
}

function amountWithCrDrSuffix(line) {
  const m = line.match(
    /([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)\s*(cr|dr|credit|debit)\b\.?/i,
  )
  if (!m) return null
  const v = parseAmount(m[1])
  if (v == null || v < 100) return null
  const t = m[2].toLowerCase()
  const isCredit = t === 'cr' || t === 'credit'
  return { value: v, isCredit }
}

/**
 * PDF / text row: leading date, remark, then withdrawal | deposit | balance (3 numeric columns).
 */
function tryParseSpacedTableRow(line) {
  const threeAmt =
    /^(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(.+?)\s+([0-9,]+\.?[0-9]*)\s+([0-9,]+\.?[0-9]*)\s+([0-9,]+\.?[0-9]*)\s*$/i.exec(
      line,
    )
  if (threeAmt) {
    const w = parseAmount(threeAmt[3]) || 0
    const d = parseAmount(threeAmt[4]) || 0
    const b = parseAmount(threeAmt[5])
    const yyyymm = parseDateToYyyymm(threeAmt[1])
    if (!yyyymm) return null
    return {
      yyyymm,
      remark: threeAmt[2].trim(),
      withdrawal: w,
      deposit: d,
      balance: b,
    }
  }
  return null
}

function parseCsvStatementRows(text) {
  const lines = String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const headerCells = splitCsvLine(lines[0])
  if (headerCells.length < 3) return []

  const map = mapStatementColumns(headerCells)
  if (map.dateIdx < 0) return []
  if (map.withdrawalIdx < 0 && map.depositIdx < 0 && map.balanceIdx < 0) return []

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    if (cells.length < headerCells.length * 0.5) continue

    const dateCell = cells[map.dateIdx] || ''
    const yyyymm = parseDateToYyyymm(dateCell)
    if (!yyyymm) continue

    const remark =
      map.remarkIdx >= 0 ? String(cells[map.remarkIdx] || '').trim() : ''

    const withdrawal = map.withdrawalIdx >= 0 ? parseAmount(cells[map.withdrawalIdx]) || 0 : 0
    const deposit = map.depositIdx >= 0 ? parseAmount(cells[map.depositIdx]) || 0 : 0
    const balance = map.balanceIdx >= 0 ? parseAmount(cells[map.balanceIdx]) : null

    if (withdrawal === 0 && deposit === 0 && balance == null) continue

    rows.push({ yyyymm, remark, withdrawal, deposit, balance, source: 'csv' })
  }

  return rows
}

function parseSpacedTableRowsFromLines(lines) {
  const rows = []
  for (const line of lines) {
    if (CLOSING_BALANCE_LINE_RE.test(line)) continue
    const r = tryParseSpacedTableRow(line)
    if (r && (r.withdrawal > 0 || r.deposit > 0 || r.balance != null)) {
      rows.push({ ...r, source: 'spaced' })
    }
  }
  return rows
}

/**
 * Month-wise totals and last running balance per calendar month.
 */
function aggregateMonthlyFromTabularRows(rows) {
  /** @type {Map<string, { deposits: number, withdrawals: number, lastBalance: number | null, txnCount: number, salaryDepositMax: number }>} */
  const byMonth = new Map()

  for (const r of rows) {
    if (!r.yyyymm) continue
    if (!byMonth.has(r.yyyymm)) {
      byMonth.set(r.yyyymm, {
        deposits: 0,
        withdrawals: 0,
        lastBalance: null,
        txnCount: 0,
        salaryDepositMax: 0,
      })
    }
    const m = byMonth.get(r.yyyymm)
    m.deposits += r.deposit || 0
    m.withdrawals += r.withdrawal || 0
    m.txnCount += 1
    if (r.balance != null && Number.isFinite(r.balance)) {
      m.lastBalance = r.balance
    }
    if (r.remark && SALARY_LINE_RE.test(r.remark) && (r.deposit || 0) > 0) {
      m.salaryDepositMax = Math.max(m.salaryDepositMax, r.deposit)
    }
  }

  const keys = [...byMonth.keys()].sort()
  const monthlyDepositTotals = []
  const monthlyWithdrawalTotals = []
  const monthEndingBalances = []
  const monthNetFlows = []

  for (const k of keys) {
    const m = byMonth.get(k)
    monthlyDepositTotals.push(m.deposits)
    monthlyWithdrawalTotals.push(m.withdrawals)
    monthNetFlows.push(m.deposits - m.withdrawals)
    if (m.lastBalance != null) monthEndingBalances.push(m.lastBalance)
  }

  return {
    byMonth,
    monthKeys: keys,
    monthCount: keys.length,
    medianMonthlyDepositTotal: median(monthlyDepositTotals),
    medianMonthlyWithdrawalTotal: median(monthlyWithdrawalTotals),
    medianMonthEndingBalance: median(monthEndingBalances),
    medianMonthlyNetFlow: median(monthNetFlows),
    tabulatedTxnCount: rows.length,
  }
}

function salaryHitsFromLines(lines, netMonthlyHint) {
  const hits = []
  for (const line of lines) {
    if (!SALARY_LINE_RE.test(line)) continue
    const amts = amountsInLine(line)
    if (!amts.length) continue
    hits.push(Math.max(...amts))
  }
  let filtered = hits
  if (netMonthlyHint > 0 && hits.length) {
    const lo = netMonthlyHint * 0.32
    const hi = netMonthlyHint * 1.75
    const narrowed = hits.filter((x) => x >= lo && x <= hi)
    if (narrowed.length) filtered = narrowed
  }
  return filtered
}

function recurringCreditFallback(lines) {
  const creditish = /\bcr\b|credit|credited|deposit|deposited|\+|by\s*transfer|inward/i
  const amounts = []
  for (const line of lines) {
    if (CLOSING_BALANCE_LINE_RE.test(line)) continue
    if (!creditish.test(line)) continue
    for (const a of amountsInLine(line)) amounts.push(a)
  }
  const buckets = new Map()
  for (const a of amounts) {
    const k = Math.round(a / 1_000) * 1_000
    if (k < 12_000) continue
    buckets.set(k, (buckets.get(k) || 0) + 1)
  }
  let bestVal = null
  let bestCount = 0
  for (const [k, c] of buckets) {
    if (c >= 2 && c > bestCount) {
      bestCount = c
      bestVal = k
    }
  }
  return bestVal
}

function extractMonthEndBalances(lines) {
  const balances = []
  for (const line of lines) {
    if (!CLOSING_BALANCE_LINE_RE.test(line)) continue
    const wide = amountsInLineWide(line)
    if (!wide.length) continue
    balances.push(Math.max(...wide))
  }
  return balances
}

function extractCreditDebitFromRemarks(lines) {
  const credits = []
  const debits = []

  for (const line of lines) {
    if (CLOSING_BALANCE_LINE_RE.test(line)) continue

    const suff = amountWithCrDrSuffix(line)
    if (suff && suff.value <= 50_000_000) {
      if (suff.isCredit) credits.push(suff.value)
      else debits.push(suff.value)
      continue
    }

    const hasCred = CREDIT_REMARK_RE.test(line)
    const hasDeb = DEBIT_REMARK_RE.test(line)
    if (!hasCred && !hasDeb) continue

    const amts = amountsInLine(line, 500, 5_000_000)
    if (!amts.length) continue
    const amt = Math.max(...amts)

    if (hasCred && !hasDeb) credits.push(amt)
    else if (hasDeb && !hasCred) debits.push(amt)
  }

  return { credits, debits }
}

function computeEstimatedSipMonthly(lines) {
  const amts = []
  for (const line of lines) {
    if (!SIP_LINE_RE.test(line)) continue
    for (const a of amountsInLine(line, 500, 250_000)) amts.push(a)
  }
  return median(amts)
}

function estimateDistinctMonths(text) {
  const re = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/g
  const seen = new Set()
  let m
  while ((m = re.exec(text)) !== null) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    const mo = String(m[2]).padStart(2, '0')
    seen.add(`${y}-${mo}`)
  }
  return Math.max(1, seen.size)
}

function computeHasStatementPattern({
  monthEndBalances,
  creditTxnCount,
  debitTxnCount,
  medianSalary,
  salaryHitsLength,
  tabularTxnCount,
  tabularMonthCount,
}) {
  const hasMonthEnds = monthEndBalances.length >= 2
  const hasTxnRemarks = creditTxnCount >= 2 && debitTxnCount >= 2
  const hasSalaryRemarks = medianSalary != null && medianSalary > 0 && salaryHitsLength >= 1
  const hasTabularMonthly =
    tabularTxnCount >= 5 && tabularMonthCount >= 2
  return hasMonthEnds || hasTxnRemarks || hasSalaryRemarks || hasTabularMonthly
}

/**
 * Heuristic analysis of Indian salary-account statement text (PDF/OCR/CSV).
 * Prefers tabular rows (date, remarks, withdrawal, deposit, balance) aggregated month-wise when found.
 * @param {string} text
 * @param {{ netMonthlyHint?: number }} options — take-home from payslip/tax, to filter misparsed amounts
 */
export function analyzeBankStatement(text, options = {}) {
  const netMonthlyHint = Number(options.netMonthlyHint) || 0
  const rawText = String(text || '')
  const lines = rawText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const csvRows = parseCsvStatementRows(rawText)
  const spacedRows = parseSpacedTableRowsFromLines(lines)
  const tabularRows =
    csvRows.length >= 5
      ? csvRows
      : spacedRows.length >= 5
        ? spacedRows
        : csvRows.length > spacedRows.length
          ? csvRows
          : spacedRows
  const monthlyAgg =
    tabularRows.length > 0 ? aggregateMonthlyFromTabularRows(tabularRows) : null

  const usedTabularMonthlyAnalysis = Boolean(
    monthlyAgg &&
      monthlyAgg.tabulatedTxnCount >= 5 &&
      monthlyAgg.monthCount >= 2,
  )

  let salaryHits = salaryHitsFromLines(lines, netMonthlyHint)

  if (usedTabularMonthlyAnalysis && monthlyAgg) {
    for (const k of monthlyAgg.monthKeys) {
      const m = monthlyAgg.byMonth.get(k)
      if (m.salaryDepositMax > 0) salaryHits.push(m.salaryDepositMax)
    }
  }

  let medianSalary = median(salaryHits)
  if (medianSalary == null) {
    const recur = recurringCreditFallback(lines)
    if (recur != null) medianSalary = recur
    if (recur != null && !salaryHits.length) salaryHits = [recur]
  }

  if (
    usedTabularMonthlyAnalysis &&
    monthlyAgg &&
    medianSalary == null &&
    monthlyAgg.medianMonthlyDepositTotal != null &&
    monthlyAgg.medianMonthlyDepositTotal > 0
  ) {
    medianSalary = monthlyAgg.medianMonthlyDepositTotal
  }

  const monthEndBalances = extractMonthEndBalances(lines)
  const { credits, debits } = extractCreditDebitFromRemarks(lines)

  let medianCreditTxnAmount = median(credits)
  let medianDebitTxnAmount = median(debits)

  if (usedTabularMonthlyAnalysis && monthlyAgg) {
    if (monthlyAgg.medianMonthlyDepositTotal != null) {
      medianCreditTxnAmount = monthlyAgg.medianMonthlyDepositTotal
    }
    if (monthlyAgg.medianMonthlyWithdrawalTotal != null) {
      medianDebitTxnAmount = monthlyAgg.medianMonthlyWithdrawalTotal
    }
  }

  const estimatedStatementMonths = Math.max(
    estimateDistinctMonths(rawText),
    monthlyAgg?.monthCount || 0,
  )
  const estimatedSipMonthly = computeEstimatedSipMonthly(lines) || 0

  const hasStatementPattern = computeHasStatementPattern({
    monthEndBalances,
    creditTxnCount: credits.length,
    debitTxnCount: debits.length,
    medianSalary,
    salaryHitsLength: salaryHits.length,
    tabularTxnCount: monthlyAgg?.tabulatedTxnCount || 0,
    tabularMonthCount: monthlyAgg?.monthCount || 0,
  })

  let confidence = 'low'
  if (usedTabularMonthlyAnalysis && monthlyAgg && monthlyAgg.monthCount >= 3) confidence = 'high'
  else if (usedTabularMonthlyAnalysis) confidence = 'medium'
  else if (salaryHits.length >= 3) confidence = 'high'
  else if (monthEndBalances.length >= 3 && credits.length >= 2 && debits.length >= 2) confidence = 'high'
  else if (salaryHits.length === 2 || (salaryHits.length === 1 && estimatedStatementMonths >= 2))
    confidence = 'medium'
  else if (medianSalary != null && salaryHits.length === 1) confidence = 'medium'
  else if (hasStatementPattern && monthEndBalances.length >= 2) confidence = 'medium'

  const recurringInfo =
    tabularRows.length >= 4
      ? findRecurringFixedPatternsByRemark(tabularRows)
      : { recurringDebitPatterns: [], recurringCreditPatterns: [], estimatedMonthlyEmiTotal: 0 }

  const transactionSampleRows = tabularRows.slice(0, 12).map((r) => ({
    month: r.yyyymm,
    remark: (r.remark || '').length > 72 ? `${String(r.remark).slice(0, 69)}…` : String(r.remark || ''),
    withdrawal: r.withdrawal,
    deposit: r.deposit,
    balance: r.balance,
  }))

  const monthlyTotalsPreview = monthlyAgg
    ? monthlyAgg.monthKeys.slice(0, 10).map((k) => {
        const m = monthlyAgg.byMonth.get(k)
        return {
          month: k,
          deposits: m.deposits,
          withdrawals: m.withdrawals,
          lastBalance: m.lastBalance,
          txnCount: m.txnCount,
        }
      })
    : []

  const baseAnalysis = {
    medianSalaryCredit: medianSalary,
    salaryCreditSamples: salaryHits,
    salaryCreditCount: salaryHits.length,
    estimatedStatementMonths,
    estimatedSipMonthly,
    confidence,
    monthEndBalances,
    monthEndBalanceCount: monthEndBalances.length,
    medianCreditTxnAmount,
    medianDebitTxnAmount,
    creditTxnCount: credits.length,
    debitTxnCount: debits.length,
    hasStatementPattern,
    usedTabularMonthlyAnalysis,
    tabulatedTxnCount: monthlyAgg?.tabulatedTxnCount || 0,
    monthlyParsedMonthCount: monthlyAgg?.monthCount || 0,
    medianMonthlyDepositTotal: monthlyAgg?.medianMonthlyDepositTotal ?? null,
    medianMonthlyWithdrawalTotal: monthlyAgg?.medianMonthlyWithdrawalTotal ?? null,
    medianMonthEndingBalance: monthlyAgg?.medianMonthEndingBalance ?? null,
    medianMonthlyNetFlow: monthlyAgg?.medianMonthlyNetFlow ?? null,
    monthKeysSample: monthlyAgg?.monthKeys?.slice(0, 6) || [],
    recurringDebitPatterns: recurringInfo.recurringDebitPatterns,
    recurringCreditPatterns: recurringInfo.recurringCreditPatterns,
    estimatedMonthlyEmiTotal: recurringInfo.estimatedMonthlyEmiTotal,
    transactionSampleRows,
    monthlyTotalsPreview,
  }

  return {
    ...baseAnalysis,
    patternExplanationLines: buildPatternExplanationLines(baseAnalysis),
  }
}

export async function extractBankStatementText(file) {
  const type = (file?.type || '').toLowerCase()
  const name = (file?.name || '').toLowerCase()

  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return extractTextFromPdf(file)
  }
  if (type.startsWith('image/')) {
    return ocrImageFile(file)
  }
  if (type.includes('csv') || name.endsWith('.csv') || name.endsWith('.txt')) {
    return String(await file.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  }
  throw new Error('Unsupported bank statement format. Use PDF, image, or CSV.')
}

/** Concatenate one or more statements (multi-month / multiple files). */
export async function extractBankStatementsCombined(files) {
  const list = Array.from(files || []).filter(Boolean)
  if (!list.length) return { combinedText: '', fileCount: 0 }
  const chunks = []
  for (const f of list) {
    chunks.push(await extractBankStatementText(f))
  }
  return {
    combinedText: normalizeWhitespace(chunks.join('\n\n---NEXT FILE---\n\n')),
    fileCount: list.length,
  }
}
