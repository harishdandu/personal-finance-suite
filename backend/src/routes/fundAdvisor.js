import express from 'express'
import { config } from '../config.js'
import { mfService } from '../services/mfService.js'

const router = express.Router()

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch { }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last < first) return null
  try {
    return JSON.parse(raw.slice(first, last + 1))
  } catch {
    return null
  }
}

function clampScore(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function normalizeFundResult(payload) {
  const funds = Array.isArray(payload?.funds) ? payload.funds : []
  return {
    summary: String(payload?.summary || 'Top funds matched to your requirements'),
    interpretation: String(
      payload?.interpretation ||
      'Scores represent closeness to your filters and qualitative fit (sector tilt, AMC quality, costs).',
    ),
    funds: funds.slice(0, 12).map((f, i) => ({
      id: String(f?.id || f?.schemeCode || f?.fundName || `fund-${i + 1}`),
      fundName: String(f?.fundName || f?.name || 'Unknown fund'),
      category: String(f?.category || ''),
      amc: String(f?.amc || ''),
      expenseRatio: String(f?.expenseRatio || ''),
      rollingReturn3Y: String(f?.rollingReturn3Y || f?.threeYearRollingReturn || ''),
      rollingReturn5Y: String(f?.rollingReturn5Y || f?.fiveYearRollingReturn || ''),
      sectors: Array.isArray(f?.sectors) ? f.sectors.map((s) => String(s)) : [],
      amcReputation: String(f?.amcReputation || ''),
      matchScore: clampScore(f?.matchScore),
      rationale: Array.isArray(f?.rationale) ? f.rationale.map((r) => String(r)) : [],
      caveats: Array.isArray(f?.caveats) ? f.caveats.map((c) => String(c)) : [],
      sourceNote: String(f?.sourceNote || ''),
      // New Detailed Fields
      currentReturnPercentage: Number(f?.currentReturnPercentage || 0),
      timeseries: Array.isArray(f?.timeseries) ? f.timeseries.map(t => ({
        date: String(t?.date || ''),
        nav: Number(t?.nav || 0)
      })) : [],
      portfolio: {
        topHoldings: Array.isArray(f?.portfolio?.topHoldings) ? f.portfolio.topHoldings.map(h => ({
          name: String(h?.name || ''),
          percentage: Number(h?.percentage || 0)
        })) : [],
        sectorAllocation: Array.isArray(f?.portfolio?.sectorAllocation) ? f.portfolio.sectorAllocation.map(s => ({
          sector: String(s?.sector || ''),
          percentage: Number(s?.percentage || 0)
        })) : []
      },
      metrics: {
        fundAge: String(f?.metrics?.fundAge || 'N/A'),
        exitLoad: String(f?.metrics?.exitLoad || 'N/A'),
        expenseRatioDetailed: String(f?.metrics?.expenseRatioDetailed || f?.expenseRatio || 'N/A'),
        risk: String(f?.metrics?.risk || 'N/A'),
        lockIn: String(f?.metrics?.lockIn || 'None'),
        aum: String(f?.metrics?.aum || 'N/A'),
        categoryDetailed: String(f?.metrics?.categoryDetailed || f?.category || 'N/A')
      }
    })),
  }
}

function normalizeFilters(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const asNum = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const asArr = (v) =>
    Array.isArray(v)
      ? v.map((x) => String(x || '').trim()).filter(Boolean)
      : String(v || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)

  return {
    categories: asArr(o.categories),
    rollingReturn3YMin: asNum(o.rollingReturn3YMin),
    rollingReturn5YMin: asNum(o.rollingReturn5YMin),
    trailingReturnMin: asNum(o.trailingReturnMin),
    expenseRatioMax: asNum(o.expenseRatioMax),
    fundAgeMinYears: asNum(o.fundAgeMinYears),
    riskLevels: asArr(o.riskLevels),
    sectorTilts: asArr(o.sectorTilts),
    amcReputation: String(o.amcReputation || '').trim(),
  }
}

router.post('/recommend', async (req, res) => {
  try {
    if (!config.aiApiKey) {
      return res.status(503).json({ message: 'AI is not configured. Set AI_API_KEY in backend/.env.' })
    }

    const query = String(req.body?.query || '').trim()
    const filters = normalizeFilters(req.body?.filters)
    const hasStructuredFilters =
      (filters.categories?.length || 0) > 0 ||
      (filters.riskLevels?.length || 0) > 0 ||
      (filters.sectorTilts?.length || 0) > 0 ||
      filters.rollingReturn3YMin !== undefined ||
      filters.rollingReturn5YMin !== undefined ||
      filters.trailingReturnMin !== undefined ||
      filters.expenseRatioMax !== undefined ||
      filters.fundAgeMinYears !== undefined ||
      !!filters.amcReputation

    if (!query && !hasStructuredFilters) {
      return res.status(400).json({ message: 'Please provide your fund requirement in "query".' })
    }

    const systemPrompt = `You are Fund Advisor AI for Indian mutual funds.
Return ONLY valid JSON, no markdown.

User will provide natural language constraints such as:
- category/style (e.g. mid cap)
- rolling return thresholds (e.g. 3-year rolling return > 25%)
- sector tilts (e.g. banks, energy, metals)
- AMC reputation preference
- cost filters (e.g. expense ratio <= 1%)

Input may include structured filters in addition to natural-language query:
{
  "query": "string",
  "filters": {
    "categories": ["mid cap", "flexi cap"],
    "rollingReturn3YMin": number,
    "rollingReturn5YMin": number,
    "trailingReturnMin": number,
    "expenseRatioMax": number,
    "fundAgeMinYears": number,
    "riskLevels": ["moderate", "high"],
    "sectorTilts": ["banks", "energy", "metals"],
    "amcReputation": "better|good|top tier"
  }
}

Output schema:
{
  "summary":"string",
  "interpretation":"string",
  "funds":[
    {
      "id":"string",
      "fundName":"string",
      "category":"string",
      "amc":"string",
      "expenseRatio":"string",
      "rollingReturn3Y":"string",
      "rollingReturn5Y":"string",
      "sectors":["string"],
      "amcReputation":"string",
      "matchScore":0,
      "rationale":["string"],
      "caveats":["string"],
      "sourceNote":"string",
      "history": [
        {"period": "1M", "value": number},
        {"period": "3M", "value": number},
        {"period": "6M", "value": number},
        {"period": "1Y", "value": number},
        {"period": "3Y", "value": number},
        {"period": "5Y", "value": number},
        {"period": "ALL", "value": number}
      ],
      "portfolio": {
        "topHoldings": [{"name": "string", "percentage": number}],
        "sectorAllocation": [{"sector": "string", "percentage": number}]
      },
      "metrics": {
        "fundAge": "string",
        "exitLoad": "string",
        "expenseRatioDetailed": "string",
        "risk": "string",
        "lockIn": "string",
        "aum": "string"
      }
    }
  ]
}

Rules:
- Prioritize strict filter matching first.
- Compute matchScore as integer 0-100 for each fund based on user's constraints (higher = better fit).
- Explain why each fund matched using concise rationale bullets.
- If any criterion is approximate/unavailable, state it in caveats/sourceNote.
- Prefer practical, currently relevant Indian direct-growth mutual fund options when possible.
- Keep funds between 5 and 12 unless no suitable matches.
- For "history", provide realistic annualized performance percentages for the given periods.
- For "portfolio", list the top 10 companies and top 10 sectors (or as many as relevant).
- IMPORTANT fallback behavior: if strict filtering yields too few/zero matches, DO NOT return empty immediately.
  Return nearest matches instead, with:
  - lower matchScore to reflect gaps,
  - clear caveats naming unmet criteria (e.g. "3Y rolling return is 22.8% vs >25% asked"),
  - summary that explicitly says "near matches" or "best available matches".
- Only return empty funds if even near matches are unreliable or data is unavailable.`

    const userPrompt = JSON.stringify({ query, filters, hasStructuredFilters })
    const aiRes = await fetch(`${config.aiApiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    const aiData = await aiRes.json().catch(() => ({}))
    if (!aiRes.ok) {
      return res.status(502).json({ message: aiData?.error?.message || 'AI request failed.' })
    }

    const content = aiData?.choices?.[0]?.message?.content || ''
    const parsed = extractJsonObject(content)
    if (!parsed) return res.status(502).json({ message: 'AI returned invalid JSON.' })

    const result = normalizeFundResult(parsed)

    return res.json({ data: result })
  } catch {
    return res.status(500).json({ message: 'Could not process fund advisor request.' })
  }
})

router.post('/details', async (req, res) => {
  try {
    if (!config.aiApiKey) {
      return res.status(503).json({ message: 'AI is not configured.' })
    }

    const { fundName, category, amc } = req.body
    if (!fundName) {
      return res.status(400).json({ message: 'Fund name is required.' })
    }

    const now = new Date()
    const dd = String(now.getDate()).padStart(2, '0')
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yy = String(now.getFullYear()).slice(-2)
    const currentDate = `${dd}/${mm}/${yy}`

    const isUTIFlexi = fundName.toLowerCase().includes('uti flexi cap')
    const isParagParikh = fundName.toLowerCase().includes('parag parikh') && fundName.toLowerCase().includes('flexi cap')

    let hints = ''
    if (isUTIFlexi) {
      hints = `
- CURRENT REF DATA for UTI Flexi Cap (as of April 2026): 
  * AUM: ₹20,437.91 Cr.
  * Expense Ratio: 1.05% (inclusive of GST)
  * Exit Load: 1% if redeemed within 1 year; Nil after 1 year.
  * Return (3Y): ~11.35%
`
    } else if (isParagParikh) {
      hints = `
- CURRENT REF DATA for Parag Parikh Flexi Cap (as of April 2026):
  * AUM: ₹1.29 Trillion (~₹1,29,000 Cr)
  * Expense Ratio: 0.62%
  * NAV (Direct-Growth): ₹91.48
  * Exit Load: 2.00% if redeemed within 365 days; 1.00% if redeemed between 366-730 days; Nil after 730 days.
  * Fund Age: 11 years (Launched May 2013)
  * Return (3Y): ~22.8%
`
    }

    // const currentDate = "April 2026"
    const systemPrompt = `You are a financial analyst providing a deep-dive analysis of an Indian mutual fund.
Return ONLY valid JSON. Accuracy is CRITICAL.
The current date is ${currentDate}. Ensure all data and performance trends are up-to-date as of ${currentDate}.

Fund Info Requested:
Name: ${fundName}
Category: ${category || 'N/A'}
AMC: ${amc || 'N/A'}
${hints}

REQUIRED JSON SCHEMA (Values are for illustrative purposes, provide REAL estimates):
{
  "currentReturnPercentage": Number,
  "dailyChangePercentage": Number (e.g. -0.58),
  "currentNav": Number (e.g. 91.48),
  "lastUpdated": "DD MMM YYYY" (e.g. "24 Apr 2026"),
  "timeseries": [
    {"date": "DD MMM YYYY", "nav": Number},
    ... (provide 150 points evenly spaced spanning from 5 years ago until ${currentDate})
  ],
  "portfolio": {
    "topHoldings": [{"name": "Company Name", "percentage": Number}],
    "sectorAllocation": [{"sector": "Sector Name", "percentage": Number}]
  },
  "metrics": {
    "fundAge": "String",
    "exitLoad": "String",
    "expenseRatioDetailed": "String (e.g. '0.85% (Direct Plan)')",
    "risk": "String",
    "lockIn": "String",
    "aum": "String (e.g. '₹20,000 Cr.')",
    "categoryDetailed": "String"
  }
}

Rules:
- Accuracy for "timeseries" is critical. It must represent the NAV trend over time.
- Ensure the character encoding is standard UTF-8 (use 'INR' or '₹' correctly).
- The timeseries MUST contain 150 points to allow for smooth local filtering.`

    const aiRes = await fetch(`${config.aiApiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 0, // Lower temperature for accuracy
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze the fund: ${fundName}. Ensure timeseries has 150 points for local filtering.` },
        ],
      }),
    })


    const aiData = await aiRes.json().catch(() => ({}))
    if (!aiRes.ok) {
      return res.status(502).json({ message: aiData?.error?.message || 'AI details request failed.' })
    }

    const content = aiData?.choices?.[0]?.message?.content || ''
    const parsed = extractJsonObject(content)
    if (!parsed) return res.status(502).json({ message: 'AI returned invalid details JSON.' })

    return res.json({ data: parsed })
  } catch (err) {
    console.error('Details fetch error:', err)
    return res.status(500).json({ message: 'Could not fetch fund details.' })
  }
})

export default router
