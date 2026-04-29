import { useEffect, useMemo, useState } from 'react'
import '../index.css'
import './tax.css'
import { extractPayslipData } from '../utils/payslipExtract'
import { analyzeBankStatement, extractBankStatementsCombined } from '../utils/bankStatementExtract'
import { computeRetirementCorpusFromRichBankAnalysis } from '../utils/retirementCorpus'
import { calcSIPFutureValue, formatIndianRupees, formatRupees } from '../utils/sipCalculator'
import { computeTaxNewRegime, computeTaxOldRegime } from '../utils/indianTax'
import { buildTaxAdvisorAdvice } from '../utils/taxAdvisorEngine'
import { sanitizeDigits, toNumberOr0 } from '../utils/numericInput'

const CAP_80C = 150000
const CAP_80D = 50000
const CAP_80CCD1B = 50000
/** Fixed in calculations (inputs removed from UI). */
const STANDARD_DEDUCTION_OLD = 50000
const STANDARD_DEDUCTION_NEW = 75000
const AUTOPILOT_YEARS = 20
const AUTOPILOT_EXPECTED_RETURN = 0.12

/** Default corpus when no bank statement is uploaded (by annual gross salary band). */
function defaultRetirementCorpusFromAnnualGross(annualGross) {
  const g = Math.max(0, Number(annualGross) || 0)
  const L = 100_000
  if (g < 10 * L) return 1_00_00_000
  if (g < 15 * L) return 2_00_00_000
  if (g < 20 * L) return 3_00_00_000
  if (g < 25 * L) return 4_00_00_000
  return 5_00_00_000
}
const SUGGESTED_FUNDS = [
  { name: 'Nifty 50 Index Fund', why: 'Large-cap core allocation, low-cost market exposure.' },
  { name: 'Nifty Next 50 Index Fund', why: 'Growth-oriented satellite to complement Nifty 50.' },
  { name: 'Flexi Cap Fund', why: 'Manager-led diversification across market caps.' },
  { name: 'Large & Mid Cap Fund', why: 'Balanced exposure to stability and growth.' },
]

const ADVISOR_ICON = {
  retirement: '↗',
  health: '🏥',
  invest: '📈',
  home: '🏡',
  give: '💜',
}

function AiTaxAdvisorPanel({ advice }) {
  const pct = Math.max(0, Math.min(100, advice.optimisationScore || 0))
  return (
    <section className="taxAdvisor" aria-label="AI Tax Advisor suggestions">
      <div className="taxAdvisorHead">
        <div className="taxAdvisorHeadMain">
          <div className="taxAdvisorTitleLine">
            <span className="taxAdvisorSparkle" aria-hidden="true">
              ✦
            </span>
            <span className="taxAdvisorTitle">AI Tax Advisor</span>
          </div>
          {/* <p className="taxAdvisorSub">Based on your calculator inputs (rule-based, not AI chat).</p> */}
        </div>
        <div className="taxAdvisorSavings">
          <div className="taxAdvisorSavingsLabel">Extra savings in Old regime</div>
          <div className="taxAdvisorSavingsValue">
            ₹{formatIndianRupees(advice.potentialExtraSavings || 0)}
          </div>
        </div>
      </div>

      <p className="taxAdvisorQuote">{advice.summaryQuote}</p>

      <div className="taxAdvisorScoreRow">
        <span className="taxAdvisorScoreLabel">Tax optimisation score</span>
        <span className="taxAdvisorScoreNum">
          {pct}/100
        </span>
      </div>
      <div className="taxAdvisorScoreBar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="taxAdvisorScoreFill" style={{ width: `${pct}%` }} />
      </div>

      {advice.suggestions?.length ? (
        <div className="taxAdvisorCards">
          {advice.suggestions.map((s) => (
            <div key={s.id} className="taxAdvisorCard">
              <div className="taxAdvisorCardIcon" aria-hidden="true">
                {ADVISOR_ICON[s.icon] || '💡'}
              </div>
              <div className="taxAdvisorCardBody">
                <div className="taxAdvisorCardTop">
                  <div className="taxAdvisorCardTitle">{s.title}</div>
                  <div className="taxAdvisorBadges">
                    <span className="taxAdvisorBadgeSection">{s.section}</span>
                    <span className="taxAdvisorBadgeSave">
                      Save ₹{formatIndianRupees(Math.round(s.saveAmount))}
                    </span>
                  </div>
                </div>
                <div className="taxAdvisorCardDesc">{s.description}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="taxAdvisorCardDesc" style={{ padding: '4px 2px 0' }}>
          No major unused deduction headroom showed up on these numbers—you may already be near common caps, or the New
          regime is simply ahead for your profile.
        </div>
      )}

      <p className="taxAdvisorFoot">
        Each “Save” figure is an approximate marginal benefit vs your current Old-regime calculation in this tool—not
        legal or tax advice. Consult a CA for your situation.
      </p>
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div className="taxFieldRow">
      <div className="taxFieldLabel">{label}</div>
      <div className="taxFieldControl">{children}</div>
    </div>
  )
}

function NumberBox({ prefix, value, onChange }) {
  return (
    <div className="taxNumberBox">
      {prefix ? <span className="taxPrefix">{prefix}</span> : null}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="taxNumberInput"
        value={value}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
      />
    </div>
  )
}

function cappedSectionDeductions({ deduction80C, deduction80D, deduction80CCD1B, otherSectionDeductions }) {
  return (
    Math.min(toNumberOr0(deduction80C), CAP_80C) +
    Math.min(toNumberOr0(deduction80D), CAP_80D) +
    Math.min(toNumberOr0(deduction80CCD1B), CAP_80CCD1B) +
    toNumberOr0(otherSectionDeductions)
  )
}

function hasAnyDeductionOrExemptionDetails({
  professionalTax,
  deduction80C,
  deduction80D,
  deduction80CCD1B,
  otherSectionDeductions,
  housePropertyInterest,
  hraExemption,
  ltaExemption,
  mealCouponExemption,
}) {
  return (
    toNumberOr0(professionalTax) > 0 ||
    toNumberOr0(deduction80C) > 0 ||
    toNumberOr0(deduction80D) > 0 ||
    toNumberOr0(deduction80CCD1B) > 0 ||
    toNumberOr0(otherSectionDeductions) > 0 ||
    toNumberOr0(housePropertyInterest) > 0 ||
    toNumberOr0(hraExemption) > 0 ||
    toNumberOr0(ltaExemption) > 0 ||
    toNumberOr0(mealCouponExemption) > 0
  )
}

function monthlySipForTarget(target, annualReturn, years) {
  const r = annualReturn / 12
  const n = years * 12
  if (r <= 0 || n <= 0) return 0
  const factor = ((Math.pow(1 + r, n) - 1) / r) * (1 + r)
  return factor > 0 ? target / factor : 0
}

function futureValueWithStepUp(startMonthlySip, annualStepUp, annualReturn, years) {
  const r = annualReturn / 12
  const months = years * 12
  let corpus = 0
  for (let m = 0; m < months; m++) {
    const year = Math.floor(m / 12)
    const sip = startMonthlySip * Math.pow(1 + annualStepUp, year)
    corpus = (corpus + sip) * (1 + r)
  }
  return corpus
}

function startingSipForStepUpTarget(target, annualStepUp, annualReturn, years) {
  let low = 0
  let high = 1
  while (futureValueWithStepUp(high, annualStepUp, annualReturn, years) < target) {
    high *= 2
    if (high > 1e8) break
  }
  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2
    const fv = futureValueWithStepUp(mid, annualStepUp, annualReturn, years)
    if (fv >= target) high = mid
    else low = mid
  }
  return high
}

function estimateAdditionalTaxSaving({
  annualGrossSalary,
  exemptions,
  housePropertyInterestDeduction,
  standardDeduction,
  professionalTax,
  otherDeductions,
}) {
  const before = computeTaxOldRegime({
    annualGrossSalary,
    exemptions,
    housePropertyInterestDeduction,
    standardDeduction,
    professionalTax,
    otherDeductions,
  })
  return before.totalTax || 0
}

export default function TaxCalculatorPage({ onEditPlanInSip, chatInitialValues }) {
  const resultsOnlyFromChat = Boolean(chatInitialValues?.resultsOnlyFromChat)

  const [file, setFile] = useState(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  const [annualGrossSalary, setAnnualGrossSalary] = useState('')
  const [professionalTax, setProfessionalTax] = useState('')
  const [deduction80C, setDeduction80C] = useState('')
  const [deduction80D, setDeduction80D] = useState('')
  const [deduction80CCD1B, setDeduction80CCD1B] = useState('')
  const [otherSectionDeductions, setOtherSectionDeductions] = useState('')
  const [housePropertyInterest, setHousePropertyInterest] = useState('')
  const [hraExemption, setHraExemption] = useState('')
  const [ltaExemption, setLtaExemption] = useState('')
  const [mealCouponExemption, setMealCouponExemption] = useState('')

  const [showAutopilot, setShowAutopilot] = useState(false)

  const [bankStatementText, setBankStatementText] = useState('')
  const [bankFileLabel, setBankFileLabel] = useState('')
  const [isParsingBank, setIsParsingBank] = useState(false)
  const [bankParseError, setBankParseError] = useState('')

  const autopilotHasSalary = toNumberOr0(annualGrossSalary) > 0
  const autopilotHasDeductionOrExemption = useMemo(
    () =>
      hasAnyDeductionOrExemptionDetails({
        professionalTax,
        deduction80C,
        deduction80D,
        deduction80CCD1B,
        otherSectionDeductions,
        housePropertyInterest,
        hraExemption,
        ltaExemption,
        mealCouponExemption,
      }),
    [
      deduction80C,
      deduction80CCD1B,
      deduction80D,
      hraExemption,
      housePropertyInterest,
      ltaExemption,
      mealCouponExemption,
      otherSectionDeductions,
      professionalTax,
    ],
  )

  /** Need some salary or deduction/exemption context; full SIP numbers need salary. */
  const autopilotReady = useMemo(() => {
    return autopilotHasSalary || autopilotHasDeductionOrExemption
  }, [autopilotHasDeductionOrExemption, autopilotHasSalary])

  const autopilotCanShowPlan = autopilotHasSalary

  useEffect(() => {
    if (!autopilotReady) setShowAutopilot(false)
  }, [autopilotReady])

  useEffect(() => {
    if (!chatInitialValues) return
    setAnnualGrossSalary(chatInitialValues.annualGrossSalary ?? '')
    setProfessionalTax(chatInitialValues.professionalTax ?? '')
    setMealCouponExemption(chatInitialValues.mealCouponExemption ?? '')
    setHraExemption(chatInitialValues.hraExemption ?? '')
    setLtaExemption(chatInitialValues.ltaExemption ?? '')
    setHousePropertyInterest(chatInitialValues.housePropertyInterest ?? '')
    setDeduction80C(chatInitialValues.deduction80C ?? '')
    setDeduction80D(chatInitialValues.deduction80D ?? '')
    setDeduction80CCD1B(chatInitialValues.deduction80CCD1B ?? '')
    setOtherSectionDeductions(chatInitialValues.otherSectionDeductions ?? '')
  }, [chatInitialValues])

  const onUpload = async (f) => {
    setFile(f)
    setParseError('')
    if (!f) return

    setIsParsing(true)
    try {
      const data = await extractPayslipData(f)

      // Annual gross: prefer "Annual Taxable Salary" from PDF; else monthly gross × 12.
      if (data.annualTaxableSalary != null) {
        setAnnualGrossSalary(String(Math.round(data.annualTaxableSalary)))
      } else if (data.grossMonthly != null) {
        setAnnualGrossSalary(String(Math.round(data.grossMonthly * 12)))
      }
      if (data.professionalTaxAnnual != null) {
        setProfessionalTax(String(Math.round(data.professionalTaxAnnual)))
      } else if (data.professionalTaxMonthly != null) {
        setProfessionalTax(String(Math.round(data.professionalTaxMonthly * 12)))
      }
      if (data.mealCouponAnnualFromSummary != null) {
        setMealCouponExemption(String(Math.round(data.mealCouponAnnualFromSummary)))
      } else if (data.mealCouponMonthly != null) {
        setMealCouponExemption(String(Math.round(data.mealCouponMonthly * 12)))
      }
      if (data.hraExemption != null) setHraExemption(String(Math.round(data.hraExemption)))
      if (data.ltaExemption != null) setLtaExemption(String(Math.round(data.ltaExemption)))
      if (data.housePropertyInterest != null) {
        setHousePropertyInterest(String(Math.round(data.housePropertyInterest)))
      }
      if (data.deduction80C != null) setDeduction80C(String(Math.round(data.deduction80C)))
      if (data.deduction80D != null) setDeduction80D(String(Math.round(data.deduction80D)))
      if (data.deduction80CCD1B != null) {
        setDeduction80CCD1B(String(Math.round(data.deduction80CCD1B)))
      }
    } catch (e) {
      setParseError(e?.message || 'Failed to parse payslip')
    } finally {
      setIsParsing(false)
    }
  }

  const onBankStatementsUpload = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    setBankParseError('')
    setBankStatementText('')
    setBankFileLabel('')
    if (!files.length) return

    setIsParsingBank(true)
    try {
      const { combinedText, fileCount } = await extractBankStatementsCombined(files)
      setBankStatementText(combinedText || '')
      const names = files.map((f) => f.name).join(', ')
      setBankFileLabel(fileCount > 1 ? `${fileCount} files: ${names}` : names)
    } catch (e) {
      setBankParseError(e?.message || 'Failed to read bank statement')
    } finally {
      setIsParsingBank(false)
    }
  }

  const old = useMemo(() => {
    const exemptions =
      toNumberOr0(hraExemption) + toNumberOr0(ltaExemption) + toNumberOr0(mealCouponExemption)
    const sectionDeductionsOld = cappedSectionDeductions({
      deduction80C,
      deduction80D,
      deduction80CCD1B,
      otherSectionDeductions,
    })
    return computeTaxOldRegime({
      annualGrossSalary: toNumberOr0(annualGrossSalary),
      exemptions,
      housePropertyInterestDeduction: toNumberOr0(housePropertyInterest),
      standardDeduction: STANDARD_DEDUCTION_OLD,
      professionalTax: toNumberOr0(professionalTax),
      otherDeductions: sectionDeductionsOld,
    })
  }, [
    annualGrossSalary,
    deduction80C,
    deduction80CCD1B,
    deduction80D,
    hraExemption,
    housePropertyInterest,
    ltaExemption,
    mealCouponExemption,
    otherSectionDeductions,
    professionalTax,
  ])

  const neu = useMemo(() => {
    return computeTaxNewRegime({
      annualGrossSalary: toNumberOr0(annualGrossSalary),
      exemptions: toNumberOr0(mealCouponExemption),
      standardDeduction: STANDARD_DEDUCTION_NEW,
      professionalTax: toNumberOr0(professionalTax),
      otherDeductions: 0,
    })
  }, [annualGrossSalary, mealCouponExemption, professionalTax])

  const diff = useMemo(() => {
    const a = old.totalTax || 0
    const b = neu.totalTax || 0
    return { old: a, neu: b, savingsIfNew: a - b }
  }, [neu.totalTax, old.totalTax])

  const netMonthlyForHint = useMemo(() => {
    const gross = toNumberOr0(annualGrossSalary)
    const recommendedRegime = (neu.totalTax || 0) <= (old.totalTax || 0) ? 'New' : 'Old'
    const selectedTax = recommendedRegime === 'New' ? neu.totalTax || 0 : old.totalTax || 0
    return Math.max(0, gross - selectedTax) / 12
  }, [annualGrossSalary, neu.totalTax, old.totalTax])

  const bankAnalysis = useMemo(() => {
    if (!bankStatementText.trim()) return null
    return analyzeBankStatement(bankStatementText, { netMonthlyHint: netMonthlyForHint })
  }, [bankStatementText, netMonthlyForHint])

  const autopilot = useMemo(() => {
    const years = AUTOPILOT_YEARS
    const expectedReturnPct = AUTOPILOT_EXPECTED_RETURN * 100
    const expectedReturn = AUTOPILOT_EXPECTED_RETURN
    const gross = toNumberOr0(annualGrossSalary)
    const recommendedRegime = (neu.totalTax || 0) <= (old.totalTax || 0) ? 'New' : 'Old'
    const selectedTax = recommendedRegime === 'New' ? neu.totalTax || 0 : old.totalTax || 0
    const netAnnualIncome = Math.max(0, gross - selectedTax)
    const netMonthlyIncome = netAnnualIncome / 12
    const investableMonthly = netMonthlyIncome * 0.3

    const hasBankStatement = Boolean(bankStatementText.trim())
    const hasStatementPattern = Boolean(bankAnalysis?.hasStatementPattern)

    const retirement =
      hasBankStatement && hasStatementPattern && bankAnalysis
        ? computeRetirementCorpusFromRichBankAnalysis(bankAnalysis, netMonthlyIncome, years)
        : null

    const defaultTarget = defaultRetirementCorpusFromAnnualGross(gross)
    /** Dynamic model when statement shows salary remarks, credit+debit narration, and/or month-end balances. */
    const useDynamicCorpus = hasBankStatement && hasStatementPattern
    const target = useDynamicCorpus && retirement ? retirement.target : defaultTarget
    const planMode = useDynamicCorpus ? 'dynamic' : 'default'
    const usedSalaryBandWithBankUpload = hasBankStatement && !hasStatementPattern

    const requiredFlatSip = monthlySipForTarget(target, expectedReturn, years)
    const requiredStepUpStart = startingSipForStepUpTarget(target, 0.1, expectedReturn, years)

    const corpusIfOnlyInvestThirtyPercent = calcSIPFutureValue({
      monthlyAmount: investableMonthly,
      years,
      annualReturnPercent: expectedReturnPct,
      stepUpPercentPerYear: 0,
    }).futureValue

    return {
      recommendedRegime,
      netMonthlyIncome,
      investableMonthly,
      target,
      years,
      expectedReturnPct,
      requiredFlatSip,
      requiredStepUpStart,
      isFlatAffordable: investableMonthly >= requiredFlatSip,
      retirement: useDynamicCorpus ? retirement : null,
      bankAnalysis: hasBankStatement ? bankAnalysis : null,
      hasBankStatement,
      planMode,
      defaultTarget,
      usedSalaryBandWithBankUpload,
      corpusIfOnlyInvestThirtyPercent: Math.round(corpusIfOnlyInvestThirtyPercent),
    }
  }, [annualGrossSalary, bankAnalysis, bankStatementText, neu.totalTax, old.totalTax])

  const summary = useMemo(() => {
    const earnings = toNumberOr0(annualGrossSalary)
    const exemptionsOld = old.exemptions || 0
    const exemptionsNew = neu.exemptions || 0

    const sectionDeductionsOld = cappedSectionDeductions({
      deduction80C,
      deduction80D,
      deduction80CCD1B,
      otherSectionDeductions,
    })

    const pt = toNumberOr0(professionalTax)
    const deductionsOldOther =
      sectionDeductionsOld + (old.housePropertyInterestDeduction || 0)

    const deductionsNew = 0

    return {
      earnings,
      exemptionsOld,
      exemptionsNew,
      stdOld: STANDARD_DEDUCTION_OLD,
      stdNew: STANDARD_DEDUCTION_NEW,
      /** Section 16(iii) — shown on its own row in the Old regime column. */
      professionalTaxDeductionOld: pt,
      /** Chapter VI-A + Section 24(b) (excludes professional tax). */
      deductionsOld: deductionsOldOther,
      deductionsNew,
      taxableOld: old.taxableIncome || 0,
      taxableNew: neu.taxableIncome || 0,
      taxOld: old.totalTax || 0,
      taxNew: neu.totalTax || 0,
    }
  }, [
    annualGrossSalary,
    neu.taxableIncome,
    neu.exemptions,
    old.exemptions,
    old.housePropertyInterestDeduction,
    old.taxableIncome,
    old.totalTax,
    deduction80C,
    deduction80CCD1B,
    deduction80D,
    otherSectionDeductions,
    professionalTax,
    neu.totalTax,
  ])

  const taxAdvisorAdvice = useMemo(() => {
    const gross = toNumberOr0(annualGrossSalary)
    if (gross <= 0) return null
    return buildTaxAdvisorAdvice({
      annualGrossSalary: gross,
      exemptions:
        toNumberOr0(hraExemption) + toNumberOr0(ltaExemption) + toNumberOr0(mealCouponExemption),
      professionalTax: toNumberOr0(professionalTax),
      housePropertyInterest: toNumberOr0(housePropertyInterest),
      deduction80C,
      deduction80D,
      deduction80CCD1B,
      otherSectionDeductions,
      taxOld: old.totalTax || 0,
      taxNew: neu.totalTax || 0,
    })
  }, [
    annualGrossSalary,
    deduction80C,
    deduction80CCD1B,
    deduction80D,
    hraExemption,
    housePropertyInterest,
    ltaExemption,
    mealCouponExemption,
    neu.totalTax,
    old.totalTax,
    otherSectionDeductions,
    professionalTax,
  ])

  const aiTaxSaverSuggestions = useMemo(() => {
    const gross = toNumberOr0(annualGrossSalary)
    if (gross <= 0) return []

    const exemptions =
      toNumberOr0(hraExemption) + toNumberOr0(ltaExemption) + toNumberOr0(mealCouponExemption)
    const base80C = Math.min(toNumberOr0(deduction80C), CAP_80C)
    const base80D = Math.min(toNumberOr0(deduction80D), CAP_80D)
    const base80CCD1B = Math.min(toNumberOr0(deduction80CCD1B), CAP_80CCD1B)
    const otherSections = toNumberOr0(otherSectionDeductions)
    const baseOtherDeductions = base80C + base80D + base80CCD1B + otherSections

    const baselineTax = estimateAdditionalTaxSaving({
      annualGrossSalary: gross,
      exemptions,
      housePropertyInterestDeduction: toNumberOr0(housePropertyInterest),
      standardDeduction: STANDARD_DEDUCTION_OLD,
      professionalTax: toNumberOr0(professionalTax),
      otherDeductions: baseOtherDeductions,
    })

    const candidates = [
      {
        key: '80C',
        label: 'Section 80C (ELSS / PPF / EPF top-up)',
        room: Math.max(0, CAP_80C - base80C),
        getOther: (room) => baseOtherDeductions + room,
      },
      {
        key: '80CCD1B',
        label: 'Section 80CCD(1B) via NPS',
        room: Math.max(0, CAP_80CCD1B - base80CCD1B),
        getOther: (room) => baseOtherDeductions + room,
      },
      {
        key: '80D',
        label: 'Section 80D health insurance',
        room: Math.max(0, CAP_80D - base80D),
        getOther: (room) => baseOtherDeductions + room,
      },
    ]

    const scored = candidates
      .filter((c) => c.room > 0)
      .map((c) => {
        const taxAfter = computeTaxOldRegime({
          annualGrossSalary: gross,
          exemptions,
          housePropertyInterestDeduction: toNumberOr0(housePropertyInterest),
          standardDeduction: STANDARD_DEDUCTION_OLD,
          professionalTax: toNumberOr0(professionalTax),
          otherDeductions: c.getOther(c.room),
        }).totalTax

        return {
          ...c,
          suggestedInvestment: c.room,
          estimatedTaxSaving: Math.max(0, baselineTax - (taxAfter || 0)),
        }
      })
      .sort((a, b) => b.estimatedTaxSaving - a.estimatedTaxSaving)

    return scored.slice(0, 2)
  }, [
    annualGrossSalary,
    deduction80C,
    deduction80CCD1B,
    deduction80D,
    housePropertyInterest,
    hraExemption,
    ltaExemption,
    mealCouponExemption,
    otherSectionDeductions,
    professionalTax,
  ])

  return (
    <div className="taxPage">
      <div className="taxCard">
        <div className="taxHeader">
          <div className="taxTitle">
            {resultsOnlyFromChat ? 'Your tax comparison' : 'Payslip Tax AI (India)'}
          </div>
          <div className="taxSubtitle">Old vs New regime comparison</div>
        </div>

        {chatInitialValues && !resultsOnlyFromChat ? (
          <div className="taxChatHandoffBanner" role="status">
            Started from the tax assistant
            {chatInitialValues.fileLabel ? ` (payslip: ${chatInitialValues.fileLabel})` : ''}. You can change any
            field below or upload a new payslip to replace these values.
          </div>
        ) : null}

        {chatInitialValues && resultsOnlyFromChat ? (
          <div className="taxChatHandoffBanner taxChatHandoffBannerCompact" role="status">
            Comparison uses the amounts you confirmed in the tax assistant
            {chatInitialValues.fileLabel ? ` (payslip: ${chatInitialValues.fileLabel})` : ''}.
          </div>
        ) : null}

        <div className={`taxGrid ${resultsOnlyFromChat ? 'taxGridResultsOnly' : ''}`}>
          {!resultsOnlyFromChat ? (
          <div className="taxLeft">
            <Field label="Upload payslip (PDF / Image)">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => onUpload(e.target.files?.[0] || null)}
              />
              {file ? <div className="taxHint">Selected: {file.name}</div> : null}
              {isParsing ? <div className="taxHint">Extracting text…</div> : null}
              {parseError ? <div className="taxError">{parseError}</div> : null}
              {file && !parseError && !isParsing ? (
                <div className="taxHint">Tax comparison and inputs below are updated from your payslip.</div>
              ) : null}
            </Field>

            <Field label="Salary bank statement (optional, 1+ months)">
              <input
                type="file"
                multiple
                accept="application/pdf,image/*,.csv,text/csv,text/plain"
                onChange={(e) => onBankStatementsUpload(e.target.files)}
              />
              {bankFileLabel ? <div className="taxHint">Selected: {bankFileLabel}</div> : null}
              {isParsingBank ? <div className="taxHint">Reading statement(s)…</div> : null}
              {bankParseError ? <div className="taxError">{bankParseError}</div> : null}
              {bankAnalysis && !bankParseError ? (
                <div className="taxBankSummary">
                  <div className="taxBankSummaryLine">
                    Detected salary credits: <strong>{bankAnalysis.salaryCreditCount}</strong> sample(s) · median inflow{' '}
                    <strong>
                      {bankAnalysis.medianSalaryCredit != null
                        ? formatIndianRupees(bankAnalysis.medianSalaryCredit)
                        : '—'}
                    </strong>
                  </div>
                  <div className="taxBankSummaryLine">
                    Tabular rows parsed: <strong>{bankAnalysis.tabulatedTxnCount}</strong> · months aggregated:{' '}
                    <strong>{bankAnalysis.monthlyParsedMonthCount}</strong>
                    {bankAnalysis.usedTabularMonthlyAnalysis ? (
                      <>
                        {' '}
                        · median month <strong>deposits</strong>:{' '}
                        <strong>
                          {bankAnalysis.medianMonthlyDepositTotal != null
                            ? formatIndianRupees(bankAnalysis.medianMonthlyDepositTotal)
                            : '—'}
                        </strong>
                        {' · '}
                        <strong>withdrawals</strong>:{' '}
                        <strong>
                          {bankAnalysis.medianMonthlyWithdrawalTotal != null
                            ? formatIndianRupees(bankAnalysis.medianMonthlyWithdrawalTotal)
                            : '—'}
                        </strong>
                      </>
                    ) : null}
                  </div>
                  <div className="taxBankSummaryLine">
                    Credit txns (remark/CR): <strong>{bankAnalysis.creditTxnCount}</strong> · debit txns:{' '}
                    <strong>{bankAnalysis.debitTxnCount}</strong> · month-end balance lines:{' '}
                    <strong>{bankAnalysis.monthEndBalanceCount}</strong> · ~months in dates:{' '}
                    <strong>{bankAnalysis.estimatedStatementMonths}</strong> · SIP (median):{' '}
                    <strong>
                      {bankAnalysis.estimatedSipMonthly > 0
                        ? formatIndianRupees(bankAnalysis.estimatedSipMonthly)
                        : '—'}
                    </strong>
                  </div>
                  <div className="taxBankSummaryLine">
                    Dynamic plan pattern: <strong>{bankAnalysis.hasStatementPattern ? 'yes' : 'no'}</strong> ·
                    confidence: <strong>{bankAnalysis.confidence}</strong>
                  </div>
                  <div className="taxMicroHint">
                    CSV/exports: we match <strong>date</strong>, <strong>remarks</strong>, <strong>withdrawal</strong>,{' '}
                    <strong>deposit</strong>, <strong>balance</strong> headers and roll up{' '}
                    <strong>month by month</strong>. PDFs: spaced columns after a date when detected. Otherwise we use
                    narration heuristics; if nothing holds, Autopilot uses <strong>salary-band</strong> corpus.
                  </div>
                </div>
              ) : null}
            </Field>

            <div className="taxSectionTitle">Review & edit inputs</div>

            <Field label="Annual gross salary">
              <NumberBox prefix="₹" value={annualGrossSalary} onChange={setAnnualGrossSalary} />
              <div className="taxMicroHint">
                If extracted from payslip: we use <strong>Annual Taxable Salary</strong> when found; otherwise monthly
                gross × 12.
              </div>
            </Field>

            <Field label="Professional tax (annual, Section 16)">
              <NumberBox prefix="₹" value={professionalTax} onChange={setProfessionalTax} />
              <div className="taxMicroHint">
                Counts as an <strong>Old regime</strong> deduction here (not in the <strong>New regime</strong>{' '}
                estimate). If extracted from payslip, we assume monthly × 12.
              </div>
            </Field>

            <div className="taxSectionTitle">Exemptions (Old regime)</div>

            <Field label="HRA (exempt)">
              <NumberBox prefix="₹" value={hraExemption} onChange={setHraExemption} />
            </Field>

            <Field label="LTA (exempt)">
              <NumberBox prefix="₹" value={ltaExemption} onChange={setLtaExemption} />
            </Field>

            <Field label="Meal coupon (exempt)">
              <NumberBox prefix="₹" value={mealCouponExemption} onChange={setMealCouponExemption} />
              <div className="taxMicroHint">
                Applied as exemption in both regimes. If extracted from payslip, we assume monthly × 12.
              </div>
            </Field>

            <div className="taxSectionTitle">Deductions under House Property</div>

            <Field label="Home loan interest (Sec 24)">
              <NumberBox prefix="₹" value={housePropertyInterest} onChange={setHousePropertyInterest} />
              <div className="taxMicroHint">Capped at ₹2,00,000.</div>
            </Field>

            <Field label="Section 80C deduction">
              <NumberBox prefix="₹" value={deduction80C} onChange={setDeduction80C} />
              <div className="taxMicroHint">Maximum allowed: ₹1,50,000.</div>
            </Field>

            <Field label="Section 80D deduction">
              <NumberBox prefix="₹" value={deduction80D} onChange={setDeduction80D} />
              <div className="taxMicroHint">Maximum allowed: ₹50,000.</div>
            </Field>

            <Field label="Section 80CCD(1B) deduction">
              <NumberBox prefix="₹" value={deduction80CCD1B} onChange={setDeduction80CCD1B} />
              <div className="taxMicroHint">Maximum allowed: ₹50,000.</div>
            </Field>

            <Field label="Other section deductions">
              <NumberBox
                prefix="₹"
                value={otherSectionDeductions}
                onChange={setOtherSectionDeductions}
              />
            </Field>
          </div>
          ) : null}

          <div className={`taxRight ${resultsOnlyFromChat ? 'taxRightFullWidth' : ''}`}>
            <div className="taxSummaryTable" role="table" aria-label="Old vs new regime summary">
              <div className="taxSummaryHeader" role="row">
                <div role="columnheader"></div>
                <div role="columnheader">New tax regime</div>
                <div role="columnheader">Old tax regime</div>
              </div>

              <div className="taxSummaryRow" role="row">
                <div className="taxSummaryLabel" role="rowheader">Earnings</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.earnings)}</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.earnings)}</div>
              </div>

              <div className="taxSummaryRow" role="row">
                <div className="taxSummaryLabel" role="rowheader">Exemptions</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.exemptionsNew)}</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.exemptionsOld)}</div>
              </div>

              <div className="taxSummaryRow" role="row">
                <div className="taxSummaryLabel" role="rowheader">Standard deduction</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.stdNew)}</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.stdOld)}</div>
              </div>

              <div className="taxSummaryRow" role="row">
                <div className="taxSummaryLabel" role="rowheader">Professional tax (Sec 16)</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(0)}</div>
                <div className="taxSummaryValue" role="cell">
                  {formatIndianRupees(summary.professionalTaxDeductionOld)}
                </div>
              </div>

              <div className="taxSummaryRow" role="row">
                <div className="taxSummaryLabel" role="rowheader">Deductions (VI-A &amp; 24)</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.deductionsNew)}</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.deductionsOld)}</div>
              </div>

              <div className="taxSummaryRow" role="row">
                <div className="taxSummaryLabel" role="rowheader">Taxable Income</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.taxableNew)}</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.taxableOld)}</div>
              </div>

              <div className="taxSummaryRow isTotal" role="row">
                <div className="taxSummaryLabel" role="rowheader">Total Tax Liability</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.taxNew)}</div>
                <div className="taxSummaryValue" role="cell">{formatIndianRupees(summary.taxOld)}</div>
              </div>
            </div>

            <div className="taxCompare">
              <div className="taxBigDiff" style={{ marginTop: 0 }}>
                <div className="taxBigLabel">Difference</div>
                <div className={`taxBigValue ${diff.savingsIfNew >= 0 ? 'good' : 'bad'}`}>
                  {diff.savingsIfNew >= 0 ? 'You save' : 'You pay extra'}{' '}
                  {formatRupees(Math.abs(diff.savingsIfNew), { compact: true })} in New regime
                </div>
              </div>
            </div>

            {taxAdvisorAdvice ? <AiTaxAdvisorPanel advice={taxAdvisorAdvice} /> : null}

            <div className="taxBreakdown">
              <div className="taxSectionTitle">Breakdown</div>
              <div className="taxTwoCols">
                <div className="taxBox">
                  <div className="taxBoxTitle">Old regime</div>
                  <div className="taxLine">Slab tax: ₹{formatIndianRupees(old.slabTax)}</div>
                  <div className="taxLine">87A rebate: -₹{formatIndianRupees(old.rebate)}</div>
                  <div className="taxLine">Cess (4%): ₹{formatIndianRupees(old.cess)}</div>
                </div>
                <div className="taxBox">
                  <div className="taxBoxTitle">New regime</div>
                  <div className="taxLine">Slab tax: ₹{formatIndianRupees(neu.slabTax)}</div>
                  <div className="taxLine">87A rebate: -₹{formatIndianRupees(neu.rebate)}</div>
                  <div className="taxLine">Cess (4%): ₹{formatIndianRupees(neu.cess)}</div>
                </div>
              </div>

              <div className="taxDisclaimer">
                Assumptions: salary income at normal rates only; no surcharge/marginal relief; no special-rate income
                (STCG/LTCG), HRA/LTA exemptions, or perquisite nuances. Use as an estimate.
              </div>
            </div>

            <div className="taxAutopilot">
              <div className="taxAutopilotHead">
                <div className="taxSectionTitle" style={{ marginTop: 0 }}>
                  Smart Tax Autopilot
                </div>
                <button
                  type="button"
                  className="taxAutopilotBtn"
                  disabled={!showAutopilot && !autopilotReady}
                  onClick={() => {
                    if (showAutopilot) {
                      setShowAutopilot(false)
                      return
                    }
                    if (autopilotReady) setShowAutopilot(true)
                  }}
                >
                  {showAutopilot ? 'Hide Plan' : 'Generate Plan'}
                </button>
              </div>

              {!autopilotReady ? (
                <div className="taxAutopilotHint">
                  Enter your <strong>annual gross salary</strong> and/or your <strong>deductions or exemptions</strong>{' '}
                  (for example professional tax, HRA, 80C, meal coupon, or home loan interest).{' '}
                  <strong>Generate Plan</strong> uses a <strong>salary-band corpus</strong> (₹1–5 Cr by annual gross) over{' '}
                  <strong>20 years</strong> at <strong>12% p.a.</strong> by default. With a <strong>bank statement</strong>, if
                  we can parse <strong>dates, remarks, withdrawals, deposits, balances</strong> (e.g. CSV) and see a{' '}
                  <strong>month-wise pattern</strong>, the target is <strong>restructured</strong> dynamically; otherwise we
                  fall back to narration / closing-balance heuristics or the salary-band default.
                </div>
              ) : null}

              {showAutopilot && autopilotReady && !autopilotCanShowPlan ? (
                <div className="taxAutopilotCard">
                  <div className="taxError" style={{ marginTop: 0 }}>
                    Add your <strong>annual gross salary</strong> to generate an investment plan based on your estimated
                    take-home pay.
                  </div>
                </div>
              ) : null}

              {showAutopilot && autopilotCanShowPlan ? (
                <div className="taxAutopilotModalOverlay" role="dialog" aria-modal="true">
                  <div className="taxAutopilotModal">
                    <div className="taxAutopilotModalHead">
                      <div className="taxSectionTitle" style={{ marginTop: 0 }}>
                        Smart Tax Autopilot Plan
                      </div>
                      <button type="button" className="taxAutopilotClose" onClick={() => setShowAutopilot(false)}>
                        X
                      </button>
                    </div>

                    <div className="taxAutopilotCard">
                  <div className="taxLine">
                    <strong>Retirement corpus target ({autopilot.years} years @ {autopilot.expectedReturnPct}% p.a.)</strong>:{' '}
                    <strong>{formatIndianRupees(autopilot.target)}</strong>
                  </div>
                  {autopilot.planMode === 'default' ? (
                    <div className="taxMicroHint" style={{ marginTop: 4 }}>
                      {autopilot.usedSalaryBandWithBankUpload ? (
                        <>
                          <strong>Salary-band target:</strong> A statement was uploaded but we didn’t find a strong pattern
                          (<strong>dated rows with withdrawal/deposit/balance</strong>, <strong>month-wise totals</strong>,{' '}
                          <strong>remarks</strong>, or <strong>closing balances</strong>) — so the corpus stays at{' '}
                          <strong>{formatIndianRupees(autopilot.target)}</strong> from your <strong>annual gross</strong>{' '}
                          band. Bands: &lt;₹10L → ₹1 Cr, ₹10–15L → ₹2 Cr, ₹15–20L → ₹3 Cr, ₹20–25L → ₹4 Cr, ≥₹25L → ₹5 Cr.
                        </>
                      ) : (
                        <>
                          <strong>Default plan (by annual gross):</strong>{' '}
                          {formatIndianRupees(autopilot.defaultTarget)} in {autopilot.years} years at{' '}
                          {autopilot.expectedReturnPct}% p.a. Bands: &lt;₹10L → ₹1 Cr, ₹10–15L → ₹2 Cr, ₹15–20L → ₹3 Cr,
                          ₹20–25L → ₹4 Cr, ≥₹25L → ₹5 Cr. Prefer a <strong>CSV</strong> or table with <strong>transaction date</strong>,{' '}
                          <strong>remarks</strong>, <strong>withdrawal</strong>, <strong>deposit</strong>, and{' '}
                          <strong>balance</strong> for month-wise dynamic planning.
                        </>
                      )}
                    </div>
                  ) : autopilot.retirement ? (
                    <div className="taxMicroHint" style={{ marginTop: 4 }}>
                      <strong>Dynamic plan</strong> from payslip (tax) + statement patterns:{' '}
                      {[
                        autopilot.retirement.usedTabularMonthly
                          ? 'month-wise deposit/withdrawal/balance columns'
                          : null,
                        autopilot.retirement.usedRecurringEmiSignal ? 'recurring EMI-style debits' : null,
                        autopilot.retirement.usedBankSalary ? 'salary/remittance credits' : null,
                        autopilot.retirement.usedCreditDebitRemarks ? 'credit & debit remarks' : null,
                        autopilot.retirement.usedMonthEndBalances ? 'closing-balance lines' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'take-home from tax'}
                      . Monthly inflow vs spending (incl. EMIs, median debits, balance trend) sets spend assumptions; then{' '}
                      {(autopilot.retirement.inflationAnnual * 100).toFixed(0)}% inflation to horizon and ×
                      {autopilot.retirement.withdrawalMultiplier} withdrawal rule, capped ₹1 Cr–₹15 Cr.
                    </div>
                  ) : null}
                  {autopilot.hasBankStatement && autopilot.bankAnalysis ? (
                    <div className="taxBankSummary taxBankSummaryInline">
                      <div className="taxBankSummaryTitle">Extracted statement data (sample)</div>
                      {autopilot.bankAnalysis.transactionSampleRows?.length ? (
                        <>
                          <div className="taxMicroHint" style={{ marginBottom: 4 }}>
                            Rows from your file with <strong>month</strong>, <strong>remarks</strong>,{' '}
                            <strong>withdrawal</strong>, <strong>deposit</strong>, <strong>balance</strong> (first{' '}
                            {autopilot.bankAnalysis.transactionSampleRows.length} shown).
                          </div>
                          <div className="taxBankExtractScroll" role="region" aria-label="Transaction sample">
                            <div className="taxBankExtractRow taxBankExtractHead">
                              <span>Month</span>
                              <span>Remarks</span>
                              <span>Wdr</span>
                              <span>Dep</span>
                              <span>Bal</span>
                            </div>
                            {autopilot.bankAnalysis.transactionSampleRows.map((row, idx) => (
                              <div key={`${row.month}-${idx}`} className="taxBankExtractRow">
                                <span>{row.month}</span>
                                <span className="taxBankExtractCellMuted">{row.remark || '—'}</span>
                                <span>{row.withdrawal > 0 ? formatIndianRupees(row.withdrawal) : '—'}</span>
                                <span>{row.deposit > 0 ? formatIndianRupees(row.deposit) : '—'}</span>
                                <span>{row.balance != null ? formatIndianRupees(row.balance) : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="taxBankSummaryLine">
                          No tabular rows with date + remarks + amounts were extracted (try CSV export or clearer PDF text).
                        </div>
                      )}

                      {autopilot.bankAnalysis.monthlyTotalsPreview?.length ? (
                        <>
                          <div className="taxBankSummaryTitle" style={{ marginTop: 12 }}>
                            Month-wise roll-up
                          </div>
                          <div className="taxBankExtractScroll" role="region" aria-label="Monthly totals">
                            <div className="taxBankExtractRowMonthRoll taxBankExtractHead">
                              <span>Month</span>
                              <span>Deposits</span>
                              <span>Withdrawals</span>
                              <span>#</span>
                              <span>Last bal</span>
                            </div>
                            {autopilot.bankAnalysis.monthlyTotalsPreview.map((row) => (
                              <div key={row.month} className="taxBankExtractRowMonthRoll">
                                <span>{row.month}</span>
                                <span>{formatIndianRupees(row.deposits)}</span>
                                <span>{formatIndianRupees(row.withdrawals)}</span>
                                <span>{row.txnCount}</span>
                                <span>
                                  {row.lastBalance != null ? formatIndianRupees(row.lastBalance) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}

                      {(autopilot.bankAnalysis.recurringDebitPatterns?.length > 0 ||
                        autopilot.bankAnalysis.recurringCreditPatterns?.length > 0) && (
                        <>
                          <div className="taxBankSummaryTitle" style={{ marginTop: 12 }}>
                            Recurring fixed amounts (same remarks)
                          </div>
                          <div className="taxMicroHint" style={{ marginBottom: 6 }}>
                            We group rows with the same narration and flag when amounts stay nearly identical (EMI / rent /
                            SIP-like). EMI-like rows match keywords such as EMI, NACH, loan, instalment.
                          </div>
                          {autopilot.bankAnalysis.recurringDebitPatterns?.length ? (
                            <div className="taxBankSummaryLine">
                              <strong>Debits:</strong>
                              <ul className="taxPatternList">
                                {autopilot.bankAnalysis.recurringDebitPatterns.map((p, i) => (
                                  <li key={`d-${i}`}>
                                    {p.isEmiLike ? <strong>[EMI-like]</strong> : <strong>[Fixed debit]</strong>}{' '}
                                    ×{p.count} @ median {formatIndianRupees(p.medianAmount)} — {p.remarkSnippet}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {autopilot.bankAnalysis.recurringCreditPatterns?.length ? (
                            <div className="taxBankSummaryLine">
                              <strong>Credits:</strong>
                              <ul className="taxPatternList">
                                {autopilot.bankAnalysis.recurringCreditPatterns.map((p, i) => (
                                  <li key={`c-${i}`}>
                                    {p.isRentOrFixedIncome ? <strong>[Fixed credit]</strong> : <strong>[Recurring in]</strong>}{' '}
                                    ×{p.count} @ median {formatIndianRupees(p.medianAmount)} — {p.remarkSnippet}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {autopilot.bankAnalysis.estimatedMonthlyEmiTotal > 0 ? (
                            <div className="taxBankSummaryLine">
                              Estimated combined <strong>EMI-style</strong> outflow (sum of EMI-like groups):{' '}
                              <strong>{formatIndianRupees(autopilot.bankAnalysis.estimatedMonthlyEmiTotal)}</strong> / month
                            </div>
                          ) : null}
                        </>
                      )}

                      <div className="taxBankSummaryTitle" style={{ marginTop: 12 }}>
                        How we read your statement (pattern)
                      </div>
                      {autopilot.bankAnalysis.patternExplanationLines?.length ? (
                        <ul className="taxPatternList">
                          {autopilot.bankAnalysis.patternExplanationLines.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="taxBankSummaryLine">No pattern summary available.</div>
                      )}

                      <div className="taxBankSummaryTitle" style={{ marginTop: 12 }}>
                        Quick metrics
                      </div>
                      <div className="taxBankSummaryLine">
                        Median salary credit:{' '}
                        <strong>
                          {autopilot.bankAnalysis.medianSalaryCredit != null
                            ? formatIndianRupees(autopilot.bankAnalysis.medianSalaryCredit)
                            : 'not detected'}
                        </strong>
                        {' · '}
                        samples: <strong>{autopilot.bankAnalysis.salaryCreditCount}</strong>
                      </div>
                      <div className="taxBankSummaryLine">
                        Tabular rows: <strong>{autopilot.bankAnalysis.tabulatedTxnCount}</strong> · months:{' '}
                        <strong>{autopilot.bankAnalysis.monthlyParsedMonthCount}</strong> · remark credit/debit lines:{' '}
                        <strong>{autopilot.bankAnalysis.creditTxnCount}</strong> /{' '}
                        <strong>{autopilot.bankAnalysis.debitTxnCount}</strong> · closing-balance phrases:{' '}
                        <strong>{autopilot.bankAnalysis.monthEndBalanceCount}</strong>
                      </div>
                      <div className="taxBankSummaryLine">
                        Date span (~months): <strong>{autopilot.bankAnalysis.estimatedStatementMonths}</strong>
                        {' · '}
                        SIP-like (median):{' '}
                        <strong>
                          {autopilot.bankAnalysis.estimatedSipMonthly > 0
                            ? formatIndianRupees(autopilot.bankAnalysis.estimatedSipMonthly)
                            : '—'}
                        </strong>
                        {' · '}
                        confidence: <strong>{autopilot.bankAnalysis.confidence}</strong>
                      </div>
                    </div>
                  ) : null}
                  <div className="taxLine">
                    Expected long-term return (equity MF/stocks): <strong>{autopilot.expectedReturnPct}% p.a.</strong>
                  </div>
                  <div className="taxLine">
                    Tax-efficient regime right now: <strong>{autopilot.recommendedRegime}</strong>
                  </div>
                  <div className="taxLine">
                    Estimated monthly take-home (after chosen regime tax):{' '}
                    <strong>{formatIndianRupees(autopilot.netMonthlyIncome)}</strong>
                  </div>
                  <div className="taxLine">
                    Suggested investing ceiling (30% of take-home — guideline only):{' '}
                    <strong>{formatIndianRupees(autopilot.investableMonthly)}</strong>
                  </div>
                  <div className="taxLine">
                    Flat SIP needed to reach <strong>{formatIndianRupees(autopilot.target)}</strong> at{' '}
                    {autopilot.expectedReturnPct}%: <strong>{formatIndianRupees(autopilot.requiredFlatSip)}</strong>
                  </div>
                  <div className="taxMicroHint" style={{ marginTop: 2 }}>
                    The 30% line is a budget rule of thumb. The &quot;flat SIP needed&quot; is the monthly amount that
                    compounds to your full target — it can be higher than 30% of take-home.
                    {autopilot.requiredFlatSip > autopilot.investableMonthly ? (
                      <>
                        {' '}
                        Investing only the 30% ceiling each month would grow to about{' '}
                        <strong>{formatIndianRupees(autopilot.corpusIfOnlyInvestThirtyPercent)}</strong> in{' '}
                        {autopilot.years} years at {autopilot.expectedReturnPct}% (below this plan&apos;s target unless you
                        increase later or use step-up).
                      </>
                    ) : null}
                  </div>
                  <div className="taxLine">
                    Or start with <strong>{formatIndianRupees(autopilot.requiredStepUpStart)}</strong> and increase SIP
                    by <strong>10% every year</strong>.
                  </div>
                  <div className={`taxBigValue ${autopilot.isFlatAffordable ? 'good' : 'bad'}`}>
                    {autopilot.isFlatAffordable
                      ? 'Action: Flat SIP plan is within the 30% guideline.'
                      : 'Action: Flat SIP exceeds the 30% guideline — use 10% annual step-up SIP and/or raise contributions over time.'}
                  </div>
                  <div className="taxSectionTitle">Diversified fund ideas (India)</div>
                  <div className="taxFundList">
                    {SUGGESTED_FUNDS.map((fund) => (
                      <div key={fund.name} className="taxFundItem">
                        <div className="taxFundName">{fund.name}</div>
                        <div className="taxMicroHint">{fund.why}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="taxAutopilotBtn"
                    onClick={() => {
                      if (!onEditPlanInSip) return
                      onEditPlanInSip({
                        monthlySip: autopilot.requiredFlatSip,
                        years: autopilot.years,
                        expectedReturn: autopilot.expectedReturnPct,
                      })
                    }}
                  >
                    Edit in SIP Calculator
                  </button>
                  <div className="taxDisclaimer">
                    Based on long-term Indian equity market behavior and category-level diversification; not a
                    recommendation of any AMC scheme. Rebalance yearly and increase SIP when salary grows.
                  </div>
                </div>
                  </div>
                </div>
              ) : null}
            </div>

            {!resultsOnlyFromChat ? (
            <div className="taxAutopilot">
              <div className="taxAutopilotHead">
                <div className="taxSectionTitle" style={{ marginTop: 0 }}>
                  AI Tax Saver Suggestions
                </div>
              </div>

              {toNumberOr0(annualGrossSalary) <= 0 ? (
                <div className="taxAutopilotHint">
                  Enter your annual gross salary to get personalized suggestions.
                </div>
              ) : aiTaxSaverSuggestions.length === 0 ? (
                <div className="taxAutopilotHint">
                  Your entered 80C, 80D and 80CCD(1B) deductions are already at cap. No extra tax-exempt investment
                  suggestion available for this FY.
                </div>
              ) : (
                <div className="taxFundList">
                  {aiTaxSaverSuggestions.map((s) => (
                    <div key={s.key} className="taxFundItem">
                      <div className="taxFundName">{s.label}</div>
                      <div className="taxMicroHint">
                        Suggested investment this FY: <strong>{formatIndianRupees(s.suggestedInvestment)}</strong>
                      </div>
                      <div className="taxMicroHint">
                        Estimated tax saved this FY: <strong>{formatIndianRupees(s.estimatedTaxSaving)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

