import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import Tesseract from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[₹]/g, '₹')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAmount(s) {
  if (!s) return null
  const cleaned = s
    .replace(/[₹,]/g, '')
    .replace(/[^0-9.]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return n
}

const AMOUNT_RE = /₹?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/

/** Skip 4-digit years; cap so we don’t grab salary totals by mistake in small windows. */
function isPlausibleLineAmount(v, maxVal) {
  if (v == null || v <= 0 || v > maxVal) return false
  if (Number.isInteger(v) && v >= 2000 && v <= 2099) return false
  return true
}

function firstPlausibleAmountInSlice(slice, maxVal) {
  const re = new RegExp(AMOUNT_RE.source, 'g')
  let m
  while ((m = re.exec(slice)) !== null) {
    const v = parseAmount(m[0])
    if (isPlausibleLineAmount(v, maxVal)) return v
  }
  return null
}

function findAmountNearKeyword(text, keyword, windowLen = 220) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx === -1) return null

  const window = text.slice(idx, Math.min(text.length, idx + windowLen))
  const match = window.match(AMOUNT_RE)
  return match ? parseAmount(match[0]) : null
}

/**
 * Regexes must have one capture group for the numeric part.
 */
function findAmountByRegexList(text, regexes, maxVal) {
  for (const re of regexes) {
    const m = text.match(re)
    if (m?.[1] != null) {
      const v = parseAmount(m[1])
      if (isPlausibleLineAmount(v, maxVal)) return v
    }
  }
  return null
}

function bestCandidateGrossMonthly(text) {
  const candidates = [
    'gross earnings',
    'gross salary',
    'total earnings',
    'gross pay',
    'total gross',
    'earnings total',
    'gross amount',
    'total gross earnings',
  ]

  for (const k of candidates) {
    const v = findAmountNearKeyword(text, k, 320)
    if (v != null && v > 0) return v
  }

  return null
}

const MIN_PLAUSIBLE_ANNUAL_SALARY = 100_000
const MAX_PLAUSIBLE_ANNUAL_SALARY = 50_000_000

/**
 * Annual figure from payslip — use directly for "Annual gross salary" (no ×12).
 * Picks the largest plausible rupee amount near the label (handles messy PDF order).
 */
function bestCandidateAnnualTaxableSalary(text) {
  const byRegex = findAmountByRegexList(
    text,
    [
      /annual\s*taxable\s*salary\D{0,100}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /annual\s*taxable\s*sal\D{0,100}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    ],
    MAX_PLAUSIBLE_ANNUAL_SALARY,
  )
  if (byRegex != null && byRegex >= MIN_PLAUSIBLE_ANNUAL_SALARY) return byRegex

  const phrases = [
    'annual taxable salary',
    'annual taxable sal',
    'annual taxable',
  ]
  const lower = text.toLowerCase()
  let best = null
  for (const phrase of phrases) {
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(phrase, from)
      if (idx === -1) break
      const slice = text.slice(idx, Math.min(text.length, idx + 420))
      const re = new RegExp(AMOUNT_RE.source, 'g')
      let m
      while ((m = re.exec(slice)) !== null) {
        const v = parseAmount(m[0])
        if (
          v != null &&
          v >= MIN_PLAUSIBLE_ANNUAL_SALARY &&
          v <= MAX_PLAUSIBLE_ANNUAL_SALARY &&
          !(Number.isInteger(v) && v >= 2000 && v <= 2099)
        ) {
          if (best == null || v > best) best = v
        }
      }
      from = idx + Math.max(1, phrase.length)
    }
  }
  return best
}

/** Professional tax on payslips is almost always a monthly deduction. */
function bestCandidateProfessionalTaxMonthly(text) {
  const byRegex = findAmountByRegexList(
    text,
    [
      /professional\s*tax\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /prof\.?\s*tax\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /pt\s*[-–]?\s*deduction\D{0,40}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    ],
    12_500,
  )
  if (byRegex != null) return byRegex

  const phrases = [
    'professional tax',
    'prof. tax',
    'prof tax',
    'professional tax deduction',
    'p.tax',
    'pt deduction',
    'professional  tax',
  ]
  const forward = findAmountNearPhrasesForDeduction(text, phrases, 300, 12_500)
  if (forward != null) return forward
  return findAmountBeforePhrasesForDeduction(text, phrases, 90, 12_500)
}

function findAmountNearPhrasesForDeduction(text, phrases, windowLen, maxVal) {
  const lower = text.toLowerCase()
  for (const phrase of phrases) {
    const p = phrase.toLowerCase()
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(p, from)
      if (idx === -1) break
      const slice = text.slice(idx, Math.min(text.length, idx + windowLen))
      const v = firstPlausibleAmountInSlice(slice, maxVal)
      if (v != null) return v
      from = idx + Math.max(1, p.length)
    }
  }
  return null
}

function lastPlausibleAmountInSlice(slice, maxVal) {
  const re = new RegExp(AMOUNT_RE.source, 'g')
  const matches = [...slice.matchAll(re)]
  for (let i = matches.length - 1; i >= 0; i--) {
    const v = parseAmount(matches[i][0])
    if (isPlausibleLineAmount(v, maxVal)) return v
  }
  return null
}

/** When PDF text order is amount then label (e.g. "200.00 Professional Tax"). */
function findAmountBeforePhrasesForDeduction(text, phrases, windowLen, maxVal) {
  const lower = text.toLowerCase()
  for (const phrase of phrases) {
    const p = phrase.toLowerCase()
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(p, from)
      if (idx === -1) break
      const slice = text.slice(Math.max(0, idx - windowLen), idx)
      const v = lastPlausibleAmountInSlice(slice, maxVal)
      if (v != null) return v
      from = idx + Math.max(1, p.length)
    }
  }
  return null
}

/** Meal coupon / food allowance component (usually monthly). */
function bestCandidateMealCouponMonthly(text) {
  const byRegex = findAmountByRegexList(
    text,
    [
      /meal\s*coupons?\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /meal\s*vouchers?\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /food\s*coupons?\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /food\s*allowance\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /meal\s*allowance\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /sodexo\D{0,60}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      /flexi\s*allowance\D{0,40}meal\D{0,40}₹?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    ],
    50_000,
  )
  if (byRegex != null) return byRegex

  const phrases = [
    'meal coupon',
    'meal coupons',
    'meal voucher',
    'meal vouchers',
    'food coupon',
    'food coupons',
    'meal card',
    'canteen coupon',
    'food allowance',
    'meal allowance',
    'meal benefit',
    'sodexo',
    'meal reimbursement',
  ]
  const forward = findAmountNearPhrasesForDeduction(text, phrases, 320, 50_000)
  if (forward != null) return forward
  return findAmountBeforePhrasesForDeduction(text, phrases, 100, 50_000)
}

function pageTextInReadingOrder(content) {
  const items = (content.items || [])
    .filter((it) => it.str && String(it.str).trim())
    .map((it) => ({
      str: String(it.str),
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0,
    }))

  items.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) return b.y - a.y
    return a.x - b.x
  })

  let out = ''
  let lastY = null
  for (const it of items) {
    if (lastY != null && Math.abs(it.y - lastY) > 4) {
      out += '\n'
    } else if (out.length > 0 && !out.endsWith('\n') && !out.endsWith(' ')) {
      out += ' '
    }
    out += it.str
    lastY = it.y
  }
  return out
}

export async function extractTextFromPdf(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const parts = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    parts.push(pageTextInReadingOrder(content))
  }
  return normalizeText(parts.join('\n'))
}

export async function ocrImageFile(file) {
  const url = URL.createObjectURL(file)
  try {
    const res = await Tesseract.recognize(url, 'eng')
    return normalizeText(res?.data?.text || '')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Declared / exempt amounts from "Tax Deductions (D)" style tables (e.g. Archents / Zoho-like payslips).
 * Values are annual rupee amounts as printed (exempted column preferred where present).
 */
function extractDeclaredChapterVIAAndRelated(text) {
  const blockMatch = text.match(/Tax\s*Deductions\s*\(D\)([\s\S]{0,14000})/i)
  const block = blockMatch ? blockMatch[1] : text

  let deduction80C = null
  const total80Block = block.match(/Section\s*80C[\s\S]{0,900}?Total\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)/i)
  if (total80Block) {
    const exempted = parseAmount(total80Block[2])
    const declared = parseAmount(total80Block[1])
    if (exempted != null && exempted > 0) deduction80C = exempted
    else if (declared != null && declared > 0) deduction80C = declared
  }

  const m80d = block.match(/Section\s*80D\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)/i)
  let deduction80D = null
  if (m80d) {
    const a2 = parseAmount(m80d[2])
    const a1 = parseAmount(m80d[1])
    deduction80D = a2 ?? a1
  }

  const mNps = block.match(/Section\s*80CCD\s*\(\s*1\s*B\s*\)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)/i)
  let deduction80CCD1B = null
  if (mNps) {
    const a2 = parseAmount(mNps[2])
    const a1 = parseAmount(mNps[1])
    deduction80CCD1B = a2 ?? a1
  }

  const m24 = block.match(/Section\s*24\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)/i)
  let housePropertyInterest = null
  if (m24) {
    const exempted = parseAmount(m24[2])
    const declared = parseAmount(m24[1])
    housePropertyInterest = exempted ?? declared
  }

  const mLta = block.match(/(?:^|\n)\s*LTA\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s*(?:\n|$)/im)
  let ltaExemption = null
  if (mLta) {
    const a2 = parseAmount(mLta[2])
    const a1 = parseAmount(mLta[1])
    ltaExemption = a2 ?? a1
  }

  return {
    deduction80C,
    deduction80D,
    deduction80CCD1B,
    housePropertyInterest,
    ltaExemption,
  }
}

/** Annual HRA exempt total from year-end summary row (e.g. "Total 2,69,004 1,31,004"). */
function extractHraExemptionAnnualTotal(text) {
  const idx = text.search(/HRA\s*Exemption\s*Calculations/i)
  if (idx === -1) return null
  const slice = text.slice(idx, Math.min(text.length, idx + 14000))
  const totals = [...slice.matchAll(/(?:^|\n)\s*Total\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)/gim)]
  if (!totals.length) return null
  const last = totals[totals.length - 1]
  const exempt = parseAmount(last[1])
  if (exempt != null && exempt >= 10_000 && exempt <= 50_000_000) return exempt
  return null
}

/** e.g. "Professional Tax (Section 16) -2,400" → annual PT */
function extractProfessionalTaxAnnualFromSummary(text) {
  const m = text.match(/Professional\s*Tax\s*\(\s*Section\s*16\s*\)\s*-?\s*([0-9][0-9,]*)/i)
  if (!m) return null
  const v = parseAmount(m[1])
  if (v == null || v <= 0 || v > 50_000) return null
  return v
}

/** e.g. "Meal Allowances Deduction (Section 10) -36,000" → annual meal exemption */
function extractMealAllowanceAnnualFromSummary(text) {
  const m = text.match(
    /Meal\s*Allowances?\s*Deduction\s*\(\s*Section\s*10\s*\)\s*-?\s*([0-9][0-9,]*)/i,
  )
  if (!m) return null
  const v = parseAmount(m[1])
  if (v == null || v <= 0 || v > 10_000_000) return null
  return v
}

export async function extractPayslipData(file) {
  const type = (file?.type || '').toLowerCase()
  let text = ''

  if (type.includes('pdf')) {
    text = await extractTextFromPdf(file)
  } else if (type.startsWith('image/')) {
    text = await ocrImageFile(file)
  } else {
    throw new Error('Unsupported file type. Please upload a PDF or image.')
  }

  const annualTaxableSalary = bestCandidateAnnualTaxableSalary(text)
  const grossMonthly = bestCandidateGrossMonthly(text)
  const professionalTaxMonthly = bestCandidateProfessionalTaxMonthly(text)
  const mealCouponMonthly = bestCandidateMealCouponMonthly(text)
  const professionalTaxAnnual = extractProfessionalTaxAnnualFromSummary(text)
  const mealCouponAnnualFromSummary = extractMealAllowanceAnnualFromSummary(text)
  const chapterVIA = extractDeclaredChapterVIAAndRelated(text)
  const hraExemption = extractHraExemptionAnnualTotal(text)

  return {
    text,
    annualTaxableSalary,
    grossMonthly,
    professionalTaxMonthly,
    mealCouponMonthly,
    professionalTaxAnnual,
    mealCouponAnnualFromSummary,
    hraExemption,
    ...chapterVIA,
  }
}

