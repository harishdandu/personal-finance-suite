import { useCallback, useRef, useState } from 'react'
import './taxChatbot.css'
import { extractPayslipData } from '../utils/payslipExtract'
import { formatIndianRupees } from '../utils/sipCalculator'
import { sanitizeDigits } from '../utils/numericInput'

const EMPTY_DEDUCTIONS = {
  hraExemption: '',
  ltaExemption: '',
  housePropertyInterest: '',
  deduction80C: '',
  deduction80D: '',
  deduction80CCD1B: '',
  otherSectionDeductions: '',
}

function deductionInputsFromExtract(data) {
  const o = { ...EMPTY_DEDUCTIONS }
  if (data.hraExemption != null) o.hraExemption = String(Math.round(data.hraExemption))
  if (data.ltaExemption != null) o.ltaExemption = String(Math.round(data.ltaExemption))
  if (data.housePropertyInterest != null) {
    o.housePropertyInterest = String(Math.round(data.housePropertyInterest))
  }
  if (data.deduction80C != null) o.deduction80C = String(Math.round(data.deduction80C))
  if (data.deduction80D != null) o.deduction80D = String(Math.round(data.deduction80D))
  if (data.deduction80CCD1B != null) {
    o.deduction80CCD1B = String(Math.round(data.deduction80CCD1B))
  }
  return o
}

const DEDUCTION_STEPS = [
  {
    key: 'hraExemption',
    label: 'HRA exemption (annual)',
    ask: 'How much HRA is exempt for you this year (old regime)? Enter 0 if none.',
    capHint: 'No fixed rupee cap — depends on rent, basic salary, and city (Section 10(13A)).',
  },
  {
    key: 'ltaExemption',
    label: 'LTA exemption (annual)',
    ask: 'Approved LTA exemption you claim (annual)? Enter 0 if none.',
    capHint: 'Capped by eligible travel and employer-approved / actual exempt amount.',
  },
  {
    key: 'housePropertyInterest',
    label: 'Home loan interest (Sec 24)',
    ask: 'Home loan interest under Section 24 (annual, capped at ₹2 lakh in rules)? Enter 0 if none.',
    capHint: 'Max capped: ₹2,00,000 per year under Section 24(b) (self-occupied).',
  },
  {
    key: 'deduction80C',
    label: 'Section 80C',
    ask: 'Total Section 80C (EPF, ELSS, PPF, etc.)? Enter 0 if none.',
    capHint: 'Max capped: ₹1,50,000 combined under Section 80C.',
  },
  {
    key: 'deduction80D',
    label: 'Section 80D',
    ask: 'Health insurance premium under Section 80D? Enter 0 if none.',
    capHint: 'Max capped: ₹50,000 (higher limits for senior citizens where applicable).',
  },
  {
    key: 'deduction80CCD1B',
    label: 'Section 80CCD(1B)',
    ask: 'Additional NPS under 80CCD(1B)? Enter 0 if none.',
    capHint: 'Max capped: ₹50,000 under Section 80CCD(1B).',
  },
  {
    key: 'otherSectionDeductions',
    label: 'Other deductions (VI-A)',
    ask: 'Other annual chapter VI-A deductions (e.g. 80G, 80E) as one total? Enter 0 if none.',
    capHint: 'Each section has its own ceiling (e.g. 80G, 80E); enter your total claimed.',
  },
]

/** Salary / allowance fields first, then chapter VI-A (one screen each, pre-filled from extract). */
const PAYSLIP_BASE_STEPS = [
  {
    scope: 'base',
    key: 'annualGrossSalary',
    label: 'Annual gross salary',
    ask: 'Let’s confirm your annual gross salary. We’ve filled what we read from the payslip—change it if needed.',
    capHint: 'Prefer “Annual Taxable Salary” from the payslip when present; otherwise monthly gross × 12.',
  },
  {
    scope: 'base',
    key: 'professionalTax',
    label: 'Professional tax (annual)',
    ask: 'Professional tax for the year (annual). Enter 0 if none.',
    capHint: 'Often shown monthly on payslip; we’ve converted to annual when possible.',
  },
  {
    scope: 'base',
    key: 'mealCouponExemption',
    label: 'Meal coupon exemption (annual)',
    ask: 'Meal allowance / Section 10 amount (annual). Enter 0 if none.',
    capHint: 'We use meal deduction or coupon lines from the payslip when found.',
  },
]

const ONBOARDING_STEPS = [
  ...PAYSLIP_BASE_STEPS,
  ...DEDUCTION_STEPS.map((d) => ({ scope: 'deduction', ...d })),
]

function formatSummaryAmount(val) {
  if (val === '' || val == null) return '—'
  const n = Number(val)
  if (!Number.isFinite(n)) return '—'
  return formatIndianRupees(Math.round(n))
}

function onboardingValueForStep(step, annualGrossSalary, professionalTax, mealCouponExemption, deductionInputs) {
  if (step.scope === 'base') {
    if (step.key === 'annualGrossSalary') return annualGrossSalary
    if (step.key === 'professionalTax') return professionalTax
    if (step.key === 'mealCouponExemption') return mealCouponExemption
  }
  return deductionInputs[step.key] ?? ''
}

function ChatBubble({ role, children }) {
  return <div className={`taxChatBubble ${role}`}>{children}</div>
}

function NumberRow({ label, prefix, value, onChange, capHint, onEnter }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>{label}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 40,
          border: '1px solid #dedede',
          borderRadius: 8,
          padding: '0 10px',
          background: '#fff',
        }}
      >
        {prefix ? <span style={{ fontWeight: 800, marginRight: 6 }}>{prefix}</span> : null}
        <input
          type="text"
          inputMode="numeric"
          className="taxNumberInput"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15 }}
          value={value}
          onChange={(e) => onChange(sanitizeDigits(e.target.value))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !onEnter) return
            e.preventDefault()
            onEnter()
          }}
        />
      </div>
      {capHint ? <div className="taxChatInputCapHint">{capHint}</div> : null}
    </div>
  )
}

/**
 * Chat-style onboarding: payslip upload → summary in thread → one field at a time (pre-filled) → review → calculator.
 */
export default function TaxChatbotPage({ onHandoff }) {
  const threadRef = useRef(null)
  const [messages, setMessages] = useState(() => [
    {
      id: 'm0',
      role: 'bot',
      text: 'Hi — I’m your tax assistant. Please upload your payslip (PDF or image). I’ll read what I can and you can correct any field before we open the full calculator.',
    },
  ])

  const [step, setStep] = useState('upload') // upload | onboarding | summary
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fileName, setFileName] = useState('')

  const [annualGrossSalary, setAnnualGrossSalary] = useState('')
  const [professionalTax, setProfessionalTax] = useState('')
  const [mealCouponExemption, setMealCouponExemption] = useState('')
  const [deductionInputs, setDeductionInputs] = useState(() => ({ ...EMPTY_DEDUCTIONS }))
  const [onboardingIndex, setOnboardingIndex] = useState(0)
  const [extractMeta, setExtractMeta] = useState({
    usedAnnualTaxable: false,
    usedMonthlyGross: false,
    grossMonthly: null,
  })

  const pushMessage = useCallback((msg) => {
    setMessages((m) => [...m, { id: `m${Date.now()}`, ...msg }])
  }, [])

  const handleFile = async (f) => {
    setParseError('')
    if (!f) return
    setFileName(f.name)
    pushMessage({ role: 'user', text: `Uploaded: ${f.name}` })
    setIsParsing(true)
    try {
      const data = await extractPayslipData(f)

      let gross = ''
      let meta = { usedAnnualTaxable: false, usedMonthlyGross: false, grossMonthly: data.grossMonthly ?? null }
      if (data.annualTaxableSalary != null) {
        gross = String(Math.round(data.annualTaxableSalary))
        meta.usedAnnualTaxable = true
      } else if (data.grossMonthly != null) {
        gross = String(Math.round(data.grossMonthly * 12))
        meta.usedMonthlyGross = true
      }

      let pt = ''
      if (data.professionalTaxAnnual != null) {
        pt = String(Math.round(data.professionalTaxAnnual))
      } else if (data.professionalTaxMonthly != null) {
        pt = String(Math.round(data.professionalTaxMonthly * 12))
      }

      let meal = ''
      if (data.mealCouponAnnualFromSummary != null) {
        meal = String(Math.round(data.mealCouponAnnualFromSummary))
      } else if (data.mealCouponMonthly != null) {
        meal = String(Math.round(data.mealCouponMonthly * 12))
      }

      setAnnualGrossSalary(gross)
      setProfessionalTax(pt)
      setMealCouponExemption(meal)
      setDeductionInputs(deductionInputsFromExtract(data))
      setOnboardingIndex(0)
      setExtractMeta(meta)
      setStep('onboarding')

      const lines = []
      if (gross) {
        lines.push(
          meta.usedAnnualTaxable
            ? `Annual gross / taxable (from payslip): ${formatIndianRupees(Number(gross))}`
            : `Annual gross (monthly × 12): ${formatIndianRupees(Number(gross))}`,
        )
      } else {
        lines.push('Annual gross: not detected — please type it below.')
      }
      if (pt) {
        lines.push(
          data.professionalTaxAnnual != null
            ? `Professional tax (annual, from payslip): ${formatIndianRupees(Number(pt))}`
            : `Professional tax (annual est.): ${formatIndianRupees(Number(pt))}`,
        )
      } else lines.push('Professional tax: not detected')
      if (meal) {
        lines.push(
          data.mealCouponAnnualFromSummary != null
            ? `Meal allowance / Section 10 (annual, from payslip): ${formatIndianRupees(Number(meal))}`
            : `Meal coupon exemption (annual est.): ${formatIndianRupees(Number(meal))}`,
        )
      } else lines.push('Meal coupon: not detected')

      if (data.hraExemption != null) {
        lines.push(`HRA exemption (annual, from payslip): ${formatIndianRupees(Math.round(data.hraExemption))}`)
      }
      if (data.ltaExemption != null) {
        lines.push(`LTA exemption (annual): ${formatIndianRupees(Math.round(data.ltaExemption))}`)
      }
      if (data.housePropertyInterest != null) {
        lines.push(
          `Section 24 (home loan interest, exempted): ${formatIndianRupees(Math.round(data.housePropertyInterest))}`,
        )
      }
      if (data.deduction80C != null) {
        lines.push(`Section 80C (exempted total): ${formatIndianRupees(Math.round(data.deduction80C))}`)
      }
      if (data.deduction80D != null) {
        lines.push(`Section 80D: ${formatIndianRupees(Math.round(data.deduction80D))}`)
      }
      if (data.deduction80CCD1B != null) {
        lines.push(`Section 80CCD(1B): ${formatIndianRupees(Math.round(data.deduction80CCD1B))}`)
      }

      pushMessage({
        role: 'bot',
        text: 'Here’s what I pulled from your payslip. Next I’ll show one field at a time—pre-filled where we read it—edit if needed and use Next.',
        extractLines: lines,
      })
    } catch (e) {
      setParseError(e?.message || 'Could not read this file.')
      pushMessage({
        role: 'bot',
        text: 'I couldn’t parse that file. Try a clearer PDF or photo, or skip and enter numbers manually in the next screen.',
      })
    } finally {
      setIsParsing(false)
    }
  }

  const handleHandoff = () => {
    onHandoff?.({
      annualGrossSalary,
      professionalTax,
      mealCouponExemption,
      fileLabel: fileName || undefined,
      ...deductionInputs,
      resultsOnlyFromChat: true,
    })
  }

  const goToSummary = () => {
    pushMessage({
      role: 'bot',
      text: 'Here’s everything together. Check the amounts, then open the full calculator—or go back to change any field.',
    })
    setStep('summary')
  }

  const setOnboardingFieldValue = (step, v) => {
    if (step.scope === 'base') {
      if (step.key === 'annualGrossSalary') setAnnualGrossSalary(v)
      else if (step.key === 'professionalTax') setProfessionalTax(v)
      else if (step.key === 'mealCouponExemption') setMealCouponExemption(v)
      return
    }
    setDeductionInputs((s) => ({ ...s, [step.key]: v }))
  }

  const handleSkip = () => {
    pushMessage({ role: 'user', text: 'Skip payslip — I’ll enter details in the calculator.' })
    onHandoff?.({
      annualGrossSalary: '',
      professionalTax: '',
      mealCouponExemption: '',
    })
  }

  const backToUpload = () => {
    setStep('upload')
    setParseError('')
    setAnnualGrossSalary('')
    setProfessionalTax('')
    setMealCouponExemption('')
    setDeductionInputs({ ...EMPTY_DEDUCTIONS })
    setOnboardingIndex(0)
    pushMessage({ role: 'bot', text: 'Upload a different payslip if you like.' })
  }

  const curOnboarding = ONBOARDING_STEPS[onboardingIndex]

  return (
    <div className="taxChatPage">
      <div className="taxChatCard">
        <div className="taxChatHeader">
          <div className="taxChatTitle">Tax assistant</div>
          <div className="taxChatSub">
            Upload your payslip first. We’ll walk through salary and each deduction one at a time (pre-filled from the file where we can read it).
          </div>
        </div>

        <div className="taxChatThread" ref={threadRef}>
          {messages.map((m) => (
            <div key={m.id}>
              <ChatBubble role={m.role}>{m.text}</ChatBubble>
              {m.extractLines?.length ? (
                <div className="taxChatExtractBox" style={{ marginLeft: 0, marginTop: 8 }}>
                  {m.extractLines.map((line, i) => (
                    <div key={i} className="taxChatExtractRow">
                      <span className="taxChatExtractLabel">{line}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {isParsing ? <ChatBubble role="bot">Reading your payslip…</ChatBubble> : null}
        </div>

        {step === 'upload' ? (
          <div className="taxChatUploadWrap">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
            />
            {parseError ? <div className="taxChatError">{parseError}</div> : null}
            <div className="taxChatHint">PDF or clear photo works best.</div>
            <div className="taxChatActions">
              <button type="button" className="taxChatBtn secondary" onClick={handleSkip}>
                Skip upload
              </button>
            </div>
          </div>
        ) : null}

        {step === 'onboarding' ? (
          <>
            <div className="taxChatSummaryCard">
              <div className="taxChatSummaryTitle">Confirmed so far</div>
              <div className="taxChatSummaryGrid">
                {ONBOARDING_STEPS.slice(0, onboardingIndex + 1).map((s) => (
                  <div key={`${s.scope}-${s.key}`} className="taxChatSummaryRow">
                    <span className="taxChatSummaryLabel">{s.label}</span>
                    <span className="taxChatSummaryValue">
                      {formatSummaryAmount(
                        onboardingValueForStep(s, annualGrossSalary, professionalTax, mealCouponExemption, deductionInputs),
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="taxChatFormBlock">
              <ChatBubble role="bot">{curOnboarding.ask}</ChatBubble>
              <div style={{ marginTop: 12 }}>
                <NumberRow
                  label={curOnboarding.label}
                  prefix="₹"
                  value={onboardingValueForStep(
                    curOnboarding,
                    annualGrossSalary,
                    professionalTax,
                    mealCouponExemption,
                    deductionInputs,
                  )}
                  capHint={curOnboarding.capHint}
                  onChange={(v) => setOnboardingFieldValue(curOnboarding, v)}
                  onEnter={() => {
                    if (onboardingIndex < ONBOARDING_STEPS.length - 1) {
                      setOnboardingIndex((i) => i + 1)
                    } else {
                      goToSummary()
                    }
                  }}
                />
              </div>
              {onboardingIndex === 0 &&
              extractMeta.grossMonthly != null &&
              extractMeta.usedMonthlyGross ? (
                <div className="taxChatHint">
                  Detected monthly gross ≈ {formatIndianRupees(extractMeta.grossMonthly)} (×12 for annual).
                </div>
              ) : null}
            </div>

            <div className="taxChatActions">
              {onboardingIndex > 0 ? (
                <button type="button" className="taxChatBtn secondary" onClick={() => setOnboardingIndex((i) => i - 1)}>
                  Back
                </button>
              ) : (
                <button type="button" className="taxChatBtn secondary" onClick={backToUpload}>
                  Upload another
                </button>
              )}
              {onboardingIndex < ONBOARDING_STEPS.length - 1 ? (
                <button type="button" className="taxChatBtn primary" onClick={() => setOnboardingIndex((i) => i + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="taxChatBtn primary" onClick={goToSummary}>
                  Review all
                </button>
              )}
              {onboardingIndex > 0 ? (
                <button type="button" className="taxChatBtn secondary" onClick={backToUpload}>
                  Upload another
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 'summary' ? (
          <>
            <div className="taxChatSummaryCard taxChatReviewAllCard">
              <div className="taxChatReviewMainTitle">Review your details</div>
              <div className="taxChatHint taxChatReviewHint">Label and value only—open the calculator when everything looks right.</div>

              <div className="taxChatSummarySectionTitle taxChatReviewSectionTitle">From your payslip</div>
              <div className="taxChatReviewList">
                <div className="taxChatReviewRow">
                  <span className="taxChatReviewLabel">Annual gross salary</span>
                  <span className="taxChatReviewValue">{formatSummaryAmount(annualGrossSalary)}</span>
                </div>
                <div className="taxChatReviewRow">
                  <span className="taxChatReviewLabel">Professional tax (annual)</span>
                  <span className="taxChatReviewValue">{formatSummaryAmount(professionalTax)}</span>
                </div>
                <div className="taxChatReviewRow">
                  <span className="taxChatReviewLabel">Meal coupon exemption (annual)</span>
                  <span className="taxChatReviewValue">{formatSummaryAmount(mealCouponExemption)}</span>
                </div>
              </div>

              <div className="taxChatSummarySectionTitle taxChatReviewSectionTitle">Deductions</div>
              <div className="taxChatReviewList">
                {DEDUCTION_STEPS.map((d) => (
                  <div key={d.key} className="taxChatReviewRow">
                    <span className="taxChatReviewLabel">{d.label}</span>
                    <span className="taxChatReviewValue">{formatSummaryAmount(deductionInputs[d.key])}</span>
                  </div>
                ))}
              </div>

              <div className="taxChatActions taxChatReviewActions">
                <button
                  type="button"
                  className="taxChatBtn secondary"
                  onClick={() => {
                    setStep('onboarding')
                    setOnboardingIndex(ONBOARDING_STEPS.length - 1)
                  }}
                >
                  Back to edit
                </button>
                <button type="button" className="taxChatBtn secondary" onClick={backToUpload}>
                  Upload another
                </button>
                <button type="button" className="taxChatBtn primary" onClick={handleHandoff}>
                  Open full tax AI
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
