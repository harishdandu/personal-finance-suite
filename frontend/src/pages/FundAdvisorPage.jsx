import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, AreaChart, Area, PieChart, Pie, Label
} from 'recharts'
import './fundAdvisor.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const CATEGORY_OPTIONS = [
  'Large Cap',
  'Mid Cap',
  'Small Cap',
  'Flexi Cap',
  'Multi Cap',
  'Multi Asset',
  'Index',
  'Equity',
  'Debt',
  'Hybrid',
  'ELSS',
]

const RISK_OPTIONS = ['Low', 'Moderate', 'Moderately High', 'High', 'Very High']

const SECTOR_OPTIONS = [
  'Banks',
  'Financial Services',
  'Energy',
  'Metals',
  'IT',
  'Healthcare',
  'FMCG',
  'Auto',
  'Infra',
  'Pharma',
]

const QUERY_SUGGESTION_GROUPS = [
  {
    triggers: ['fund', 'funds'],
    suggestions: ['Fund Category', 'Fund age', 'Fund AMC reputation', 'Fund risk level'],
  },
  {
    triggers: ['amc', 'reputation'],
    suggestions: ['AMC reputation: Any', 'AMC reputation: Good', 'AMC reputation: Better', 'AMC reputation: Top tier'],
  },
  {
    triggers: ['risk'],
    suggestions: ['Risk in Low', 'Risk in Moderate', 'Risk in Moderately High', 'Risk in High', 'Risk in Very High'],
  },
  {
    triggers: ['return', 'returns'],
    suggestions: ['Rolling returns 3Y', 'Rolling returns 5Y', 'Trailing 3Y'],
  },
  {
    triggers: ['rolling'],
    suggestions: ['Rolling returns 3Y', 'Rolling returns 5Y'],
  },
  {
    triggers: ['expense', 'ratio'],
    suggestions: ['Expense ratio <= 1%', 'Low expense ratio'],
  },
  {
    triggers: ['sector', 'sectors'],
    suggestions: ['Sector tilt towards Banks', 'Sector tilt towards Energy', 'Sector tilt towards Metals'],
  },
]

function toggle(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

function FilterDropdown({ title, options, selected, onApply }) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempSelected, setTempSelected] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [isOpen])

  const onTriggerClick = () => {
    setTempSelected([...selected])
    setIsOpen(!isOpen)
  }

  const handleApply = () => {
    onApply(tempSelected)
    setIsOpen(false)
  }

  const displayLabel = useMemo(() => {
    if (selected.length === 0) return 'Any'
    if (selected.length === 1) return selected[0]
    return `${selected[0]} + ${selected.length - 1}`
  }, [selected])

  return (
    <div className="fundFilterBlock">
      <div className="fundFilterLabel">{title}</div>
      <div className="fundDropdown" ref={ref}>
        <button
          type="button"
          className={`fundDropdownTrigger ${selected.length > 0 ? 'isActive' : ''}`}
          onClick={onTriggerClick}
        >
          <span className="fundDropdownText">{displayLabel}</span>
          <svg
            className={`fundDropdownArrow ${isOpen ? 'isOpen' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {isOpen ? (
          <div className="fundDropdownMenu">
            <div className="fundDropdownList">
              {options.map((opt) => (
                <label key={opt} className="fundDropdownItem">
                  <input
                    type="checkbox"
                    className="fundDropdownCheck"
                    checked={tempSelected.includes(opt)}
                    onChange={() => {
                      setTempSelected((prev) => toggle(prev, opt))
                    }}
                  />
                  <span className="fundDropdownItemText">{opt}</span>
                </label>
              ))}
            </div>
            <div className="fundDropdownFooter">
              <button
                type="button"
                className="fundDropdownClear"
                onClick={() => setTempSelected([])}
              >
                Clear All
              </button>
              <button type="button" className="fundDropdownApply" onClick={handleApply}>
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MetricCard({ title, value, iconType, subtext }) {
  const getIcon = () => {
    switch (iconType) {
      case 'aum':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        )
      case 'expense':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
          </svg>
        )
      case 'exitLoad':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><path d="M9 21H3v-6" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )
      default: return null
    }
  }

  return (
    <div className="fundDetailCard">
      <div className="fundDetailCardIcon">{getIcon()}</div>
      <div className="fundDetailCardContent">
        <div className="fundDetailCardTitle">{title}</div>
        <div className="fundDetailCardValue">{value}</div>
        {subtext && <div className="fundDetailCardSub">{subtext}</div>}
      </div>
    </div>
  )
}

function FundDetailsModal({ fund, onClose }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeRange, setTimeRange] = useState('3Y')

  useEffect(() => {
    if (!fund) return

    const fetchDetails = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE}/fund-advisor/details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fundName: fund.fundName,
            category: fund.category,
            amc: fund.amc,
            range: 'ALL' // Fetch everything at once
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Failed to fetch details')
        setDetails(data.data)
      } catch (err) {
        console.error('Error fetching fund details:', err)
        setError(err.message || 'Could not load fund details.')
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [fund])

  const chartData = useMemo(() => {
    if (!details?.timeseries) return []
    const all = details.timeseries.map(p => ({
      name: p.date,
      nav: Number(p.nav),
      timestamp: new Date(p.date).getTime()
    }))

    if (timeRange === 'ALL') return all

    const now = new Date().getTime()
    let cutoff = 0
    const month = 30 * 24 * 60 * 60 * 1000
    const year = 365 * 24 * 60 * 60 * 1000

    switch(timeRange) {
      case '1M': cutoff = now - month; break
      case '3M': cutoff = now - 3 * month; break
      case '6M': cutoff = now - 6 * month; break
      case '1Y': cutoff = now - year; break
      case '3Y': cutoff = now - 3 * year; break
      case '5Y': cutoff = now - 5 * year; break
      default: cutoff = 0
    }

    return all.filter(p => p.timestamp >= cutoff)
  }, [details, timeRange])

  const returnInfo = useMemo(() => {
    if (chartData.length < 2) return { value: 'N/A', label: '' }
    const first = chartData[0].nav
    const last = chartData[chartData.length - 1].nav
    
    if (timeRange === '1M' || timeRange === '3M' || timeRange === '6M') {
      const abs = ((last - first) / first) * 100
      return { value: `${abs > 0 ? '+' : ''}${abs.toFixed(2)}%`, label: `${timeRange} return` }
    } else {
      // Annualized Return (CAGR)
      const yearsMap = { '1Y': 1, '3Y': 3, '5Y': 5, 'ALL': 5 } 
      const years = yearsMap[timeRange] || 1
      const cagr = (Math.pow(last / first, 1 / years) - 1) * 100
      return { value: `${cagr > 0 ? '+' : ''}${cagr.toFixed(2)}%`, label: `${timeRange} annualised` }
    }
  }, [chartData, timeRange])

  if (!fund) return null

  const d = details || {}
  const sectorAllocationArr = Array.isArray(d.portfolio?.sectorAllocation) ? d.portfolio.sectorAllocation : []
  const sectorData = sectorAllocationArr.map(s => ({
    name: s.sector,
    val: Number(s.percentage)
  }))

  const topHoldingsArr = Array.isArray(d.portfolio?.topHoldings) ? d.portfolio.topHoldings.map(h => ({ name: h.name, percentage: h.percentage })) : []
  const m = d.metrics || {}
  const ranges = ['1M', '6M', '1Y', '3Y', '5Y', 'ALL']
  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00C49F', '#FFBB28', '#FF8042', '#a4de6c', '#d0ed57']

  return (
    <div className="fundModalOverlay" onClick={onClose}>
      <div className="fundModalContent wide" onClick={e => e.stopPropagation()}>
        <div className="fundModalHeader">
          <div>
            <h2 className="fundModalTitle">{fund.fundName || 'Fund Details'}</h2>
            <div className="fundModalSubtitle">{m.categoryDetailed || fund.category} · {fund.amc}</div>
          </div>
          <button className="fundModalClose" onClick={onClose}>&times;</button>
        </div>

        <div className="fundModalBody">
          {loading ? (
            <div className="fundModalLoading">
              <div className="fundLoader"></div>
              <p>Fetching real-time market data and analysis...</p>
            </div>
          ) : error ? (
            <div className="fundModalError">
              <p>{error}</p>
              <button className="fundBtn" onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              <div className="fundModalTopMetrics">
                <MetricCard title="Asset Under Management" value={m.aum} iconType="aum" />
                <MetricCard title="Expense Ratio" value={m.expenseRatioDetailed} iconType="expense" />
                <MetricCard title="Exit Load" value="Standard Exit Load" iconType="exitLoad" subtext={m.exitLoad} />
              </div>

              <div className="fundModalSection mainChart">
                <div className="fundChartHeader" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <div className="fundChartReturn" style={{ color: returnInfo.value.startsWith('-') ? '#ef4444' : '#10b981', fontSize: '24px' }}>
                        {returnInfo.value}
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8' }}>{returnInfo.label}</span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: (d.dailyChangePercentage || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {(d.dailyChangePercentage || 0) >= 0 ? '+' : ''}{d.dailyChangePercentage || '0.00'}% <span style={{ color: '#94a3b8', fontWeight: 600 }}>1D</span>
                    </div>
                  </div>
                  
                  {d.currentNav && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current NAV</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>₹{d.currentNav}</div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>As on {d.lastUpdated || 'Today'}</div>
                    </div>
                  )}
                </div>

                <div className="fundChartWrap tall">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorNav" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 600}} 
                          minTickGap={40} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 600}} 
                          domain={['auto', 'auto']} 
                          orientation="right"
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>₹{payload[0].value.toFixed(2)}</div>
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>{payload[0].payload.name}</div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area type="monotone" dataKey="nav" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorNav)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="fundEmptyData">Performance data not available.</div>
                  )}
                </div>

                <div className="fundRangeSelector">
                  {ranges.map(r => (
                    <button 
                      key={r} 
                      className={`fundRangeBtn ${timeRange === r ? 'active' : ''}`}
                      onClick={() => setTimeRange(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fundModalGrid">
                <div className="fundModalSection">
                  <h3 className="fundModalSecTitle">About the Fund</h3>
                  <div className="fundHoldingsTable">
                    <div className="fundHoldingRow">
                      <span className="fundMetricLabel">Fund Age</span>
                      <span className="fundMetricVal">{m.fundAge}</span>
                     </div>
                     <div className="fundHoldingRow">
                      <span className="fundMetricLabel">Risk Grade</span>
                      <span className="fundMetricVal">{m.risk}</span>
                    </div>
                    <div className="fundHoldingRow">
                      <span className="fundMetricLabel">Lock-in Period</span>
                      <span className="fundMetricVal">{m.lockIn}</span>
                    </div>
                  </div>
                </div>

                <div className="fundModalSection">
                  <h3 className="fundModalSecTitle">Equity sector allocation</h3>
                  <div className="fundSectorLayout">
                    <div className="fundSectorLegend">
                      {sectorData.slice(0, 8).map((s, i) => (
                        <div key={i} className="fundSectorLegendItem">
                          <div className="sectorIndicator" style={{ backgroundColor: colors[i % colors.length] }}></div>
                          <div className="sectorInfo">
                            <div className="sectorName">{s.name}</div>
                            <div className="sectorValue">{s.val}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="fundSectorChartWrap">
                      {sectorData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={sectorData}
                              innerRadius={65}
                              outerRadius={95}
                              paddingAngle={2}
                              dataKey="val"
                              animationBegin={0}
                              animationDuration={1000}
                            >
                              {sectorData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="none" />
                              ))}
                              <Label 
                                value={m.aum || 'N/A'} 
                                position="center" 
                                style={{ fontSize: '16px', fontWeight: 800, fill: '#0f172a' }}
                              />
                            </Pie>
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="fundEmptyData">Sector data not available.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="fundModalSection">
                <h3 className="fundModalSecTitle">Portfolio Holdings</h3>
                <div className="fundHoldingsTable">
                  {topHoldingsArr.length > 0 ? (
                    topHoldingsArr.map((h, i) => (
                      <div key={i} className="fundHoldingRow">
                        <span className="fundHoldingName">{i+1}. {h.name}</span>
                        <span className="fundHoldingPerc">{h.percentage}%</span>
                      </div>
                    ))
                  ) : (
                    <div className="fundEmptyData">Holdings data not available.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
  
  

export default function FundAdvisorPage() {
  const [query, setQuery] = useState('')
  const [queryFocused, setQueryFocused] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const queryInputRef = useRef(null)
  const [categories, setCategories] = useState([])
  const [riskLevels, setRiskLevels] = useState([])
  const [sectorTilts, setSectorTilts] = useState([])
  const [rollingReturn3YMin, setRollingReturn3YMin] = useState('')
  const [rollingReturn5YMin, setRollingReturn5YMin] = useState('')
  const [trailingReturnMin, setTrailingReturnMin] = useState('')
  const [expenseRatioMax, setExpenseRatioMax] = useState('')
  const [fundAgeMinYears, setFundAgeMinYears] = useState('')
  const [amcReputation, setAmcReputation] = useState('')
  const [result, setResult] = useState(null)
  const [selectedFund, setSelectedFund] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const generatedQuery = useMemo(() => {
    const parts = []
    if (categories.length) parts.push(`Category in ${categories.join(', ')}`)
    if (rollingReturn3YMin) parts.push(`3Y rolling return > ${rollingReturn3YMin}%`)
    if (rollingReturn5YMin) parts.push(`5Y rolling return > ${rollingReturn5YMin}%`)
    if (trailingReturnMin) parts.push(`Trailing 3Y return > ${trailingReturnMin}%`)
    if (expenseRatioMax) parts.push(`Expense ratio <= ${expenseRatioMax}%`)
    if (fundAgeMinYears) parts.push(`Fund age >= ${fundAgeMinYears} years`)
    if (sectorTilts.length) parts.push(`Sector tilt towards ${sectorTilts.join(', ')}`)
    if (riskLevels.length) parts.push(`Risk in ${riskLevels.join(', ')}`)
    if (amcReputation) parts.push(`AMC reputation: ${amcReputation}`)
    return parts.join(' AND ')
  }, [
    categories,
    rollingReturn3YMin,
    rollingReturn5YMin,
    trailingReturnMin,
    expenseRatioMax,
    fundAgeMinYears,
    sectorTilts,
    riskLevels,
    amcReputation,
  ])

  useEffect(() => {
    setQuery(generatedQuery || '')
  }, [generatedQuery])

  const querySuggestions = useMemo(() => {
    const clean = String(query || '').trim()
    if (!clean) return []
    const lastToken = clean.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '') || ''
    if (!lastToken) return []

    const seen = new Set()
    return QUERY_SUGGESTION_GROUPS.filter((group) =>
      group.triggers.some((trigger) => trigger.includes(lastToken) || lastToken.includes(trigger))
    )
      .flatMap((group) => group.suggestions)
      .filter((item) => {
        const key = item.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 6)
  }, [query])

  useEffect(() => {
    setActiveSuggestionIndex(0)
  }, [querySuggestions])

  // Close suggestions when user clicks outside the textarea/dropdown.

  // Close suggestions when user clicks outside the textarea/dropdown.
  useEffect(() => {
    if (!queryFocused) return

    const onMouseDown = (e) => {
      if (!queryInputRef.current) return
      const target = e.target
      if (queryInputRef.current.contains(target)) return
      if (target && typeof target === 'object' && 'closest' in target) {
        // Clicking inside the dropdown should not close it before the item's onClick fires.
        if (target.closest('.fundSuggestionMenu')) return
      }
      setQueryFocused(false)
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [queryFocused])

  const applySuggestion = (suggestion) => {
    const raw = String(query || '')
    const trimmedRight = raw.replace(/\s+$/, '')
    const next = trimmedRight.replace(/([A-Za-z]+)$/, suggestion)
    setQuery((next === trimmedRight ? `${trimmedRight} ${suggestion}` : next).trim() + ' ')
    setQueryFocused(false)
  }

  const onQueryKeyDown = (e) => {
    if (!querySuggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestionIndex((prev) => Math.min(prev + 1, querySuggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (e.key === 'Enter' && queryFocused) {
      e.preventDefault()
      applySuggestion(querySuggestions[activeSuggestionIndex] || querySuggestions[0])
      return
    }
    if (e.key === 'Escape') {
      setQueryFocused(false)
    }
  }

  const fundsSorted = useMemo(() => {
    const items = Array.isArray(result?.funds) ? result.funds : []
    return [...items].sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0))
  }, [result])

  const onSubmit = async (e) => {
    e.preventDefault()
    const clean = String(query || '').trim()
    const composed = clean || generatedQuery
    if (!composed) {
      setError('Please enter a query or select some filters.')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/fund-advisor/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: composed,
          filters: {
            categories,
            rollingReturn3YMin: rollingReturn3YMin === '' ? undefined : Number(rollingReturn3YMin),
            rollingReturn5YMin: rollingReturn5YMin === '' ? undefined : Number(rollingReturn5YMin),
            trailingReturnMin: trailingReturnMin === '' ? undefined : Number(trailingReturnMin),
            expenseRatioMax: expenseRatioMax === '' ? undefined : Number(expenseRatioMax),
            fundAgeMinYears: fundAgeMinYears === '' ? undefined : Number(fundAgeMinYears),
            riskLevels,
            sectorTilts,
            amcReputation,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not fetch fund advisor recommendations.')
      setResult(data?.data || { summary: '', interpretation: '', funds: [] })
    } catch (err) {
      setError(err?.message || 'Could not fetch fund advisor recommendations.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fundAdvisorPage">
      <div className="fundCard">
        <div className="fundHead">
          <div className="fundTitle">Fund Advisor AI</div>
          <div className="fundSub">
            Ask in plain English and get high-fit mutual fund ideas with match score.
          </div>
        </div>

        <form className="fundForm" onSubmit={onSubmit}>
          <div className="fundBuilderTop">
            <div className="fundBuilderQuery">
              <label className="fundLabel" htmlFor="fund-query">
                Create a Search Query
              </label>
              <div className="fundQueryBox">
                <textarea
                  id="fund-query"
                  ref={queryInputRef}
                  className="fundTextarea"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setQueryFocused(true)
                  }}
                  onKeyDown={onQueryKeyDown}
                  onFocus={() => setQueryFocused(true)}
                  placeholder="Select filters below to generate a query (or type your own)."
                  rows={4}
                />
                {queryFocused && querySuggestions.length ? (
                  <div className="fundSuggestionMenu">
                    {querySuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        type="button"
                        className={`fundSuggestionItem ${index === activeSuggestionIndex ? 'isActive' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        onClick={() => applySuggestion(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="fundFilterGrid">
            <div className="fundFilterRow">
              <FilterDropdown
                title="Fund Cap / Category"
                options={CATEGORY_OPTIONS}
                selected={categories}
                onApply={(val) => setCategories(val)}
              />

              <FilterDropdown
                title="Holding Sectors"
                options={SECTOR_OPTIONS}
                selected={sectorTilts}
                onApply={(val) => setSectorTilts(val)}
              />

              <FilterDropdown
                title="Risk"
                options={RISK_OPTIONS}
                selected={riskLevels}
                onApply={(val) => setRiskLevels(val)}
              />
            </div>

            <div className="fundFilterBlock">
              <div className="fundFilterLabel">Performance & Cost Filters</div>
              <div className="fundInputRow">
                <label className="fundMiniLabel">
                  3Y rolling {'>'} %
                  <input
                    className="fundInput"
                    value={rollingReturn3YMin}
                    onChange={(e) => setRollingReturn3YMin(e.target.value)}
                  />
                </label>
                <label className="fundMiniLabel">
                  5Y rolling {'>'} %
                  <input
                    className="fundInput"
                    value={rollingReturn5YMin}
                    onChange={(e) => setRollingReturn5YMin(e.target.value)}
                  />
                </label>
                <label className="fundMiniLabel">
                  Trailing 3Y {'>'} %
                  <input
                    className="fundInput"
                    value={trailingReturnMin}
                    onChange={(e) => setTrailingReturnMin(e.target.value)}
                  />
                </label>
                <label className="fundMiniLabel">
                  Expense {'<='} %
                  <input
                    className="fundInput"
                    value={expenseRatioMax}
                    onChange={(e) => setExpenseRatioMax(e.target.value)}
                  />
                </label>
                <label className="fundMiniLabel">
                  Fund age {'>='} years
                  <input
                    className="fundInput"
                    value={fundAgeMinYears}
                    onChange={(e) => setFundAgeMinYears(e.target.value)}
                  />
                </label>
                <label className="fundMiniLabel">
                  AMC reputation
                  <select
                    className="fundInput"
                    value={amcReputation}
                    onChange={(e) => setAmcReputation(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="good">Good</option>
                    <option value="better">Better</option>
                    <option value="top tier">Top tier</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="fundGeneratedQuery">
            <span className="fundGeneratedLabel">Generated query:</span> {generatedQuery || '—'}
          </div>

          <div className="fundActions">
            <button
              type="button"
              className="fundBtn ghost"
              onClick={() => {
                setCategories(['Mid Cap'])
                setRiskLevels([])
                setSectorTilts(['Banks', 'Energy', 'Metals'])
                  setRollingReturn3YMin('')
                  setRollingReturn5YMin('25')
                setTrailingReturnMin('')
                setExpenseRatioMax('1')
                setFundAgeMinYears('')
                setAmcReputation('better')
              }}
            >
              Use sample
            </button>
            <button type="submit" className="fundBtn" disabled={isLoading}>
              {isLoading ? 'Analyzing...' : 'Find funds'}
            </button>
          </div>
        </form>

        {error ? <div className="fundError">{error}</div> : null}

        {result ? (
          <div className="fundResult">
            <div className="fundSummary">{result.summary || 'Top matching funds'}</div>
            <div className="fundInterpretation">{result.interpretation}</div>

            {!fundsSorted.length ? <div className="fundEmpty">No good matches found.</div> : null}

            {fundsSorted.map((fund) => (
              <div key={fund.id} className="fundItem">
                <div className="fundRow">
                  <div className="fundName">{fund.fundName}</div>
                  <div className="fundScore">{Number(fund.matchScore || 0)}% match</div>
                </div>
                <div className="fundMeta">
                  {[
                    fund.category,
                    fund.amc,
                    fund.expenseRatio ? `Expense: ${fund.expenseRatio}` : '',
                    fund.rollingReturn3Y ? `3Y rolling: ${fund.rollingReturn3Y}` : '',
                    fund.rollingReturn5Y ? `5Y rolling: ${fund.rollingReturn5Y}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {fund.amcReputation ? (
                  <div className="fundChipWrap">
                    <span className="fundChip">AMC: {fund.amcReputation}</span>
                  </div>
                ) : null}
                {fund.sectors?.length ? (
                  <div className="fundChipWrap">
                    {fund.sectors.slice(0, 6).map((s) => (
                      <span key={s} className="fundChip">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
                {fund.rationale?.length ? (
                  <ul className="fundList">
                    {fund.rationale.slice(0, 2).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                
                <div className="fundItemFooter">
                  <button 
                    className="fundViewMoreBtn"
                    onClick={() => setSelectedFund(fund)}
                  >
                    View More Info
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {selectedFund && (
          <FundDetailsModal 
            fund={selectedFund} 
            onClose={() => setSelectedFund(null)} 
          />
        )}
      </div>
    </div>
  )
}
