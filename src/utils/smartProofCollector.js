import { extractTextFromPdf, ocrImageFile } from './payslipExtract'

export const PROOF_CATEGORIES = [
  { id: 'hra', label: 'HRA (rent)', section: 'deduction', cap: null },
  { id: '80c', label: 'Section 80C', section: 'deduction', cap: 150_000 },
  { id: '80d', label: 'Section 80D', section: 'deduction', cap: 50_000 },
  { id: 'lta', label: 'LTA', section: 'deduction', cap: null },
  { id: 'sec24', label: 'Home loan interest (Sec 24(b))', section: 'deduction', cap: 200_000 },
  { id: '80ccd1b', label: 'Section 80CCD(1B)', section: 'deduction', cap: 50_000 },
  { id: 'fuelReimb', label: 'Fuel reimbursement', section: 'reimbursement', cap: null },
  { id: 'medicalReimb', label: 'Medical reimbursement', section: 'reimbursement', cap: null },
  { id: 'telephoneReimb', label: 'Telephone reimbursement', section: 'reimbursement', cap: null },
  { id: 'otherReimb', label: 'Other reimbursement', section: 'reimbursement', cap: null },
]

export function categoryById(id) {
  return PROOF_CATEGORIES.find((c) => c.id === id) || null
}

function toNum(s) {
  if (!s) return null
  const n = Number(String(s).replace(/[₹,]/g, '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function detectKind(fileName, text) {
  const base = `${fileName || ''} ${text || ''}`.toLowerCase()
  if (/rent|lease|landlord|tenant|hra/.test(base)) return 'rent'
  if (/home loan|housing loan|section\s*24|24\s*\(b\)|interest certificate/.test(base)) return 'home_loan'
  if (/lta|leave travel|leave\s*travel|travel allowance/.test(base)) return 'lta'
  if (/nps|80ccd|ccd\s*\(1b\)|additional deduction/.test(base)) return 'nps'
  if (/fuel|petrol|diesel|mileage|conveyance reimbursement/.test(base)) return 'fuel'
  if (/telephone reimbursement|mobile reimbursement|phone bill|telecom reimbursement/.test(base)) return 'telephone_reimb'
  if (/medical reimbursement|medicine reimbursement|hospital reimbursement/.test(base)) return 'medical_reimb'
  if (/reimbursement/.test(base) && !/insurance premium|80d/.test(base)) return 'reimb_generic'
  if (/insurance|mediclaim|policy|premium|80d/.test(base)) return 'insurance'
  if (/bill|invoice|receipt|tuition|donation|80g|school|college/.test(base)) return 'bills'
  return 'other'
}

function firstAmountNear(text, keyword, maxVal = 2_000_000, window = 160) {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(keyword.toLowerCase())
  if (idx === -1) return null
  const slice = text.slice(idx, Math.min(text.length, idx + window))
  const m = slice.match(/₹?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/)
  const v = m ? toNum(m[0]) : null
  if (v == null || v <= 0 || v > maxVal) return null
  return v
}

function extractRentAmountAnnual(text) {
  const keys = ['annual rent', 'rent paid', 'rent amount', 'monthly rent', 'rent']
  let picked = null
  let usedMonthlySignal = false
  for (const k of keys) {
    const v = firstAmountNear(text, k, 3_000_000, 220)
    if (v != null) {
      picked = v
      const lower = text.toLowerCase()
      const idx = lower.indexOf(k.toLowerCase())
      const slice = idx >= 0 ? lower.slice(idx, Math.min(lower.length, idx + 120)) : ''
      if (/monthly|per month|\/month|pm\b/.test(slice) || (k === 'rent' && v <= 200_000)) {
        usedMonthlySignal = true
      }
      break
    }
  }
  if (picked == null) return null
  return usedMonthlySignal ? picked * 12 : picked
}

function extractInsurance80D(text) {
  const keys = ['health insurance premium', 'mediclaim', 'insurance premium', '80d', 'policy premium']
  for (const k of keys) {
    const v = firstAmountNear(text, k, 500_000, 220)
    if (v != null) return v
  }
  return null
}

function extractHomeLoanInterest(text) {
  const keys = ['interest paid', 'interest amount', 'home loan interest', 'housing loan interest', 'section 24']
  for (const k of keys) {
    const v = firstAmountNear(text, k, 500_000, 240)
    if (v != null) return v
  }
  return firstAmountNear(text, 'interest', 500_000, 200)
}

function extractLtaAmount(text) {
  const v =
    firstAmountNear(text, 'lta', 500_000, 200) ??
    firstAmountNear(text, 'leave travel', 500_000, 220) ??
    firstAmountNear(text, 'travel allowance', 500_000, 220)
  return v
}

function extractNps80ccd1b(text) {
  const keys = ['nps', '80ccd', 'tier ii', 'tier 2', 'additional contribution']
  for (const k of keys) {
    const v = firstAmountNear(text, k, 200_000, 220)
    if (v != null) return v
  }
  return null
}

function extractReimbursementNear(text, keyword) {
  return firstAmountNear(text, keyword, 500_000, 200)
}

function extractBillMappedAmounts(text) {
  const out = { deduction80C: 0, otherSectionDeductions: 0 }
  const tuition = firstAmountNear(text, 'tuition', 500_000, 220) ?? firstAmountNear(text, 'school fee', 500_000, 220)
  if (tuition != null) out.deduction80C += tuition

  const life = firstAmountNear(text, 'life insurance premium', 500_000, 260)
  if (life != null) out.deduction80C += life

  const donation = firstAmountNear(text, 'donation', 2_000_000, 220) ?? firstAmountNear(text, '80g', 2_000_000, 220)
  if (donation != null) out.otherSectionDeductions += donation

  return out
}

/** Pull a few standalone currency-like numbers as fallback candidates */
function scanAmountCandidates(text, limit = 8) {
  const out = []
  const re = /₹?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/g
  let m
  const seen = new Set()
  while ((m = re.exec(text)) && out.length < limit) {
    const v = toNum(m[0])
    if (v == null || v < 100 || v > 5_000_000) continue
    const key = Math.round(v)
    if (seen.has(key)) continue
    seen.add(key)
    const start = Math.max(0, m.index - 40)
    const ctx = text.slice(start, Math.min(text.length, m.index + 60)).replace(/\s+/g, ' ').trim()
    out.push({ amount: Math.round(v), label: `Amount near: …${ctx.slice(-50)}` })
  }
  return out
}

async function readProofText(file) {
  const type = (file?.type || '').toLowerCase()
  if (type.includes('pdf')) return extractTextFromPdf(file)
  if (type.startsWith('image/')) return ocrImageFile(file)
  if (type.includes('text') || type.includes('csv')) return file.text()
  return ''
}

function suggestCategoryId(kind) {
  const map = {
    rent: 'hra',
    insurance: '80d',
    home_loan: 'sec24',
    lta: 'lta',
    nps: '80ccd1b',
    fuel: 'fuelReimb',
    telephone_reimb: 'telephoneReimb',
    medical_reimb: 'medicalReimb',
    reimb_generic: 'otherReimb',
    bills: '80c',
    other: null,
  }
  return map[kind] || null
}

/**
 * Single-file extraction: candidates + suggested category + text preview (no totals).
 */
export async function extractSmartProofSingleFile(file) {
  if (!file) {
    return {
      fileName: '',
      textSnippet: '',
      candidates: [],
      suggestedCategoryId: null,
      notes: ['No file selected.'],
      kind: 'other',
    }
  }

  const textRaw = await readProofText(file)
  const text = String(textRaw || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  const textSnippet = text ? text.slice(0, 1200) : ''
  const notes = []
  const candidates = []
  const pushCandidate = (amount, label) => {
    if (amount == null || amount <= 0) return
    const rounded = Math.round(amount)
    if (candidates.some((c) => c.amount === rounded && c.label === label)) return
    candidates.push({ amount: rounded, label })
  }

  if (!text) {
    return {
      fileName: file.name,
      textSnippet: '',
      candidates: [],
      suggestedCategoryId: null,
      notes: ['No readable text detected. Enter an amount manually and choose a category.'],
      kind: 'other',
    }
  }

  const kind = detectKind(file.name, text)
  const suggestedCategoryId = suggestCategoryId(kind)

  if (kind === 'rent') {
    const annual = extractRentAmountAnnual(text)
    if (annual != null) pushCandidate(annual, 'Detected annual rent (HRA context)')
    else notes.push('Rent-style document; annual amount not detected confidently.')
  } else if (kind === 'insurance') {
    const amt = extractInsurance80D(text)
    if (amt != null) pushCandidate(amt, 'Detected health / mediclaim style premium')
    else notes.push('Insurance-style document; premium amount not detected confidently.')
  } else if (kind === 'home_loan') {
    const amt = extractHomeLoanInterest(text)
    if (amt != null) pushCandidate(amt, 'Detected home loan interest (Section 24 context)')
    else notes.push('Home loan interest style; amount not detected confidently.')
  } else if (kind === 'lta') {
    const amt = extractLtaAmount(text)
    if (amt != null) pushCandidate(amt, 'Detected LTA / leave travel amount')
    else notes.push('LTA-style document; amount not detected confidently.')
  } else if (kind === 'nps') {
    const amt = extractNps80ccd1b(text)
    if (amt != null) pushCandidate(amt, 'Detected NPS / 80CCD-style amount')
    else notes.push('NPS / 80CCD context; amount not detected confidently.')
  } else if (kind === 'fuel') {
    const amt =
      extractReimbursementNear(text, 'fuel') ??
      extractReimbursementNear(text, 'petrol') ??
      extractReimbursementNear(text, 'conveyance')
    if (amt != null) pushCandidate(amt, 'Detected fuel / conveyance reimbursement')
    else notes.push('Fuel / conveyance context; amount not detected confidently.')
  } else if (kind === 'telephone_reimb') {
    const amt = extractReimbursementNear(text, 'telephone') ?? extractReimbursementNear(text, 'mobile')
    if (amt != null) pushCandidate(amt, 'Detected telephone / mobile reimbursement')
    else notes.push('Telephone reimbursement context; amount not detected confidently.')
  } else if (kind === 'medical_reimb') {
    const amt = extractReimbursementNear(text, 'medical') ?? extractReimbursementNear(text, 'reimbursement')
    if (amt != null) pushCandidate(amt, 'Detected medical reimbursement')
    else notes.push('Medical reimbursement context; amount not detected confidently.')
  } else if (kind === 'reimb_generic') {
    const amt = firstAmountNear(text, 'reimbursement', 500_000, 200) ?? firstAmountNear(text, 'amount', 500_000, 180)
    if (amt != null) pushCandidate(amt, 'Detected reimbursement-style amount')
    else notes.push('Generic reimbursement; pick category and amount manually.')
  } else if (kind === 'bills') {
    const billMap = extractBillMappedAmounts(text)
    if (billMap.deduction80C > 0) pushCandidate(billMap.deduction80C, 'Tuition / life insurance style (80C)')
    if (billMap.otherSectionDeductions > 0) pushCandidate(billMap.otherSectionDeductions, 'Donation / 80G style')
    if (!billMap.deduction80C && !billMap.otherSectionDeductions) {
      notes.push('Bill/receipt style; no 80C/80G amount detected confidently.')
    }
  } else {
    notes.push('General document; review amounts below or enter manually.')
  }

  const scanned = scanAmountCandidates(text, 6)
  for (const s of scanned) {
    if (!candidates.some((c) => c.amount === s.amount)) {
      candidates.push(s)
    }
  }

  candidates.sort((a, b) => b.amount - a.amount)

  return {
    fileName: file.name,
    textSnippet,
    candidates,
    suggestedCategoryId,
    notes,
    kind,
  }
}

/** @deprecated Use extractSmartProofSingleFile for new UI */
export async function extractSmartProofData(files) {
  const items = []
  const totals = {
    hraExemption: 0,
    deduction80D: 0,
    deduction80C: 0,
    otherSectionDeductions: 0,
  }

  for (const f of Array.from(files || []).filter(Boolean)) {
    const ex = await extractSmartProofSingleFile(f)
    const primary = ex.candidates[0]
    if (primary && ex.suggestedCategoryId === 'hra') {
      totals.hraExemption += primary.amount
      items.push({ fileName: f.name, mappedTo: 'hraExemption', amount: primary.amount, note: ex.notes.join(' ') })
    } else if (primary && ex.suggestedCategoryId === '80d') {
      totals.deduction80D += primary.amount
      items.push({ fileName: f.name, mappedTo: 'deduction80D', amount: primary.amount, note: ex.notes.join(' ') })
    } else if (primary && ex.suggestedCategoryId === '80c') {
      totals.deduction80C += primary.amount
      items.push({ fileName: f.name, mappedTo: 'deduction80C', amount: primary.amount, note: ex.notes.join(' ') })
    } else {
      items.push({ fileName: f.name, mappedTo: null, amount: primary?.amount || 0, note: ex.notes.join(' ') })
    }
  }

  return {
    totals: {
      hraExemption: Math.round(totals.hraExemption),
      deduction80D: Math.round(totals.deduction80D),
      deduction80C: Math.round(totals.deduction80C),
      otherSectionDeductions: Math.round(totals.otherSectionDeductions),
    },
    items,
  }
}
