import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell } from 'recharts'
import '../App.css'
import {
  calcSIPFutureValue,
  calcStepUpSIPThenStopFutureValue,
  formatIndianRupees,
  formatRupees,
} from '../utils/sipCalculator'
import { sanitizeDigits, toNumberOr0 } from '../utils/numericInput'

const COLORS = {
  principal: '#071b2a',
  interest: '#cfe4ff',
  accent: '#d11f2f',
}

function RangeSlider({ label, value, min, max, step, suffix, onChange }) {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <div className="sliderRow">
      <div className="sliderLabelTop">
        <span>{label}</span>
      </div>

      <div className="sliderMainRow">
        <div className="sliderMain">
          <input
            className="range"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ ['--percent']: `${percent}%` }}
            aria-label={label}
          />
        </div>

        <div className="sliderValue">
          <div className="valueBox">{value}</div>
          <div className="valueSuffix">{suffix}</div>
        </div>
      </div>
    </div>
  )
}

function MoneyInput({ prefix, suffix, value, onChange, disabled }) {
  return (
    <div className={`moneyInput ${disabled ? 'isDisabled' : ''}`}>
      {prefix ? <span className="moneyPrefix">{prefix}</span> : null}
      <input
        className="moneyField"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
      />
      {suffix ? <span className="moneySuffix">{suffix}</span> : null}
    </div>
  )
}

export default function SipCalculatorPage({ prefillPlan }) {
  const [monthlySipAmount, setMonthlySipAmount] = useState('25000')
  const [years, setYears] = useState(20)
  const [expectedReturn, setExpectedReturn] = useState(12) // p.a.
  const [stepUpPercentPerYear, setStepUpPercentPerYear] = useState('0') // per year
  const [isYearlySipExpanded, setIsYearlySipExpanded] = useState(false)
  const [stepUpDurationYears, setStepUpDurationYears] = useState('15')
  const [stopSipAfterStepUp, setStopSipAfterStepUp] = useState(true)

  useEffect(() => {
    if (!prefillPlan) return
    if (prefillPlan.monthlySip != null) {
      setMonthlySipAmount(String(Math.round(prefillPlan.monthlySip)))
    }
    if (prefillPlan.years != null) {
      setYears(Math.max(1, Math.min(30, Number(prefillPlan.years) || 20)))
    }
    if (prefillPlan.expectedReturn != null) {
      setExpectedReturn(Math.max(0, Math.min(20, Number(prefillPlan.expectedReturn) || 12)))
    }
  }, [prefillPlan])

  const yearlyMonthlySipAmounts = useMemo(() => {
    const stepUpYears = stopSipAfterStepUp
      ? Math.min(Math.max(0, toNumberOr0(stepUpDurationYears)), years)
      : years

    const p = Math.max(0, toNumberOr0(stepUpPercentPerYear)) / 100
    const base = toNumberOr0(monthlySipAmount)
    const multiplier = 1 + p

    return Array.from({ length: years }, (_, idx) => {
      const year = idx + 1
      const amount = year <= stepUpYears ? base * Math.pow(multiplier, idx) : 0
      return { year, amount, yearlyTotal: amount * 12 }
    })
  }, [monthlySipAmount, stepUpPercentPerYear, stepUpDurationYears, stopSipAfterStepUp, years])

  const result = useMemo(() => {
    const sipYears = stopSipAfterStepUp
      ? Math.min(Math.max(0, toNumberOr0(stepUpDurationYears)), years)
      : years

    if (stopSipAfterStepUp) {
      return calcStepUpSIPThenStopFutureValue({
        monthlyAmount: toNumberOr0(monthlySipAmount),
        totalYears: years,
        annualReturnPercent: expectedReturn,
        stepUpPercentPerYear: toNumberOr0(stepUpPercentPerYear),
        sipYears,
      })
    }

    return calcSIPFutureValue({
      monthlyAmount: toNumberOr0(monthlySipAmount),
      years,
      annualReturnPercent: expectedReturn,
      stepUpPercentPerYear: toNumberOr0(stepUpPercentPerYear),
    })
  }, [
    expectedReturn,
    monthlySipAmount,
    stepUpPercentPerYear,
    stepUpDurationYears,
    stopSipAfterStepUp,
    years,
  ])

  const totalWealth = result.futureValue
  const principal = result.principal
  const interest = result.interest

  const principalPct = totalWealth > 0 ? (principal / totalWealth) * 100 : 0
  const interestPct = totalWealth > 0 ? (interest / totalWealth) * 100 : 0

  const pieData = [
    { name: 'Principal', value: principal, color: COLORS.principal },
    { name: 'Interest', value: interest, color: COLORS.interest },
  ].filter((d) => d.value > 0)

  return (
    <div className="sipPage">
      <div className="sipCard">
        <div className="topRow">
          <div className="topLabel">SIP Investment</div>
        </div>

        <div className="contentGrid">
          <div className="leftCol">
            <div className="fieldRow">
              <div className="fieldLabel">Monthly SIP Amount</div>
              <MoneyInput
                prefix="₹"
                value={monthlySipAmount}
                onChange={setMonthlySipAmount}
                disabled={false}
              />
            </div>

            <div className="fieldRow">
              <div className="fieldLabel">Step Up SIP (% per year)</div>
              <MoneyInput
                prefix="%"
                value={stepUpPercentPerYear}
                onChange={setStepUpPercentPerYear}
                disabled={false}
              />
            </div>

            <div className="fieldRow">
              <div className="fieldLabel">Step Up Duration (years)</div>
              <MoneyInput
                suffix="Years"
                value={stepUpDurationYears}
                onChange={setStepUpDurationYears}
                disabled={!stopSipAfterStepUp}
              />
            </div>

            <div className="checkboxRow">
              <label className="checkboxLabel">
                <input
                  type="checkbox"
                  checked={stopSipAfterStepUp}
                  onChange={(e) => setStopSipAfterStepUp(e.target.checked)}
                />
                <span>Stop SIP after Step Up</span>
              </label>
            </div>

            <div className="yearlySipBlock" aria-label="Monthly SIP amount by year">
              <button
                type="button"
                className="yearlySipHeader"
                onClick={() => setIsYearlySipExpanded((v) => !v)}
                aria-expanded={isYearlySipExpanded}
              >
                <span className="yearlySipTitle">Monthly SIP Amount (Year-wise)</span>
                <span
                  className={`yearlySipChevron ${isYearlySipExpanded ? 'isOpen' : ''}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </button>

              {isYearlySipExpanded && (
                <div className="yearlySipRows">
                  {yearlyMonthlySipAmounts.map((row) => (
                    <div key={row.year} className="yearlySipRow">
                      <div className="yearlySipYear">Year {row.year}</div>
                      <div className="yearlySipAmount">
                        ₹{formatIndianRupees(row.amount)} (₹{formatIndianRupees(row.yearlyTotal)})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <RangeSlider
              label="Time Period (in Years)"
              value={years}
              min={1}
              max={30}
              step={1}
              suffix="Years"
              onChange={setYears}
            />

            <RangeSlider
              label="Expected Return (p.a)"
              value={expectedReturn}
              min={0}
              max={20}
              step={0.5}
              suffix="%"
              onChange={setExpectedReturn}
            />

            <div className="statsArea">
              <div className="statsTop">
                <div className="statBlock">
                  <div className="statLabel">Invested Amount</div>
                  <div className="statValue">
                    <span className="rupeePrefix">₹</span>
                    {formatIndianRupees(principal)}
                  </div>
                </div>
                <div className="statBlock">
                  <div className="statLabel">Estimated Returns</div>
                  <div className="statValue">{formatRupees(interest, { compact: true })}</div>
                </div>
              </div>

              <div className="statTotal">
                <div className="statLabel">Total Wealth</div>
                <div className="statTotalValue">{formatRupees(totalWealth, { compact: true })}</div>
              </div>
            </div>
          </div>

          <div className="rightCol">
            <div className="chartArea">
              <div className="donutWrap">
                <PieChart width={220} height={220}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={95}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                </PieChart>

                <div className="donutCenterOverlay">
                  <div className="overlayInterest">{interestPct.toFixed(1)}%</div>
                  <div className="overlayPrincipal">{principalPct.toFixed(1)}%</div>
                </div>
              </div>

              <div className="legend">
                <div className="legendItem">
                  <span className="legendSquare" style={{ background: COLORS.principal }} />
                  <span className="legendText">Principal Amount</span>
                </div>
                <div className="legendItem">
                  <span className="legendSquare" style={{ background: COLORS.interest }} />
                  <span className="legendText">Interest Amount</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

