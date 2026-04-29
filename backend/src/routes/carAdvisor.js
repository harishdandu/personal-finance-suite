import express from 'express'
import { config } from '../config.js'

const router = express.Router()

/** Fixed option sets (AI may drift; we normalize to these). */
const CAR_ADVISOR_BODY_TYPES = [
  'SUV',
  'Sedan',
  'Hatchback',
  'Compact Sedan',
  'MUV/MPV',
  'Convertible',
  'Coupe',
  'Minivan/Van',
  'Station Wagon',
  'Pickup',
]

const CAR_ADVISOR_MILEAGE_OPTIONS = ['Up to 10', '10-15', '15-20', '20+']

const CAR_ADVISOR_SAFETY_OPTIONS = [
  'Any',
  '3★ and above (Global NCAP adult)',
  '4★ and above (Global NCAP adult)',
  '5★ (Global NCAP adult)',
]

function isBodyTypeQuestion(questionId, questionText) {
  const id = String(questionId || '').toLowerCase()
  const t = String(questionText || '')
  return id.includes('body') || /body type|body style|segment/i.test(t)
}

function isMileageRangeQuestion(questionId, questionText) {
  const id = String(questionId || '').toLowerCase()
  const t = String(questionText || '')
  return (
    id.includes('mileage') ||
    /mileage range|fuel efficiency|kmpl|km\/l|average mileage/i.test(t)
  )
}

function isSafetyQuestion(questionId, questionText) {
  const id = String(questionId || '').toLowerCase()
  const t = String(questionText || '')
  return id.includes('safety') || /safety rating|ncap|crash test/i.test(t)
}

function answerLooksLikeAny(value) {
  if (value == null) return false
  if (Array.isArray(value)) {
    if (value.length === 0) return true
    return value.every((x) => String(x).trim().toLowerCase() === 'any')
  }
  return String(value).trim().toLowerCase() === 'any'
}

/** Match fuel / transmission answers regardless of questionId suffix (e.g. fuel_type, car_fuel). */
function getAnswerByKeyHint(answers, hint) {
  const h = String(hint).toLowerCase()
  if (!answers || typeof answers !== 'object') return undefined
  for (const [k, v] of Object.entries(answers)) {
    if (String(k).toLowerCase().includes(h)) return v
  }
  return undefined
}

function bothFuelAndTransmissionAny(answers) {
  const fuel = getAnswerByKeyHint(answers, 'fuel')
  const trans = getAnswerByKeyHint(answers, 'transmission')
  if (fuel === undefined || trans === undefined) return false
  return answerLooksLikeAny(fuel) && answerLooksLikeAny(trans)
}

function ensureEvMentionInSummary(summary, answers) {
  let s = String(summary || '').trim()
  if (!bothFuelAndTransmissionAny(answers)) return s
  if (!s) return s
  if (/\belectric|evs?\b|battery\s*electric|bev/i.test(s)) return s
  return `${s.replace(/\.\s*$/, '')}, including petrol, diesel, CNG, and electric vehicles.`
}

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {}
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last < first) return null
  try {
    return JSON.parse(raw.slice(first, last + 1))
  } catch {
    return null
  }
}

function normalizeAiPayload(payload, answers = {}) {
  const phase = String(payload?.phase || '').toLowerCase()
  if (phase === 'result') {
    const cars = Array.isArray(payload?.cars) ? payload.cars : []
    const rawSummary = String(payload?.summary || 'Top matching cars for your preferences')
    const summary =
      cars.length > 0 ? ensureEvMentionInSummary(rawSummary, answers) : rawSummary
    return {
      phase: 'result',
      summary,
      cars: cars.slice(0, 8).map((c, i) => ({
        id: String(c?.id || c?.model || `car-${i + 1}`),
        model: String(c?.model || 'Unknown model'),
        make: String(c?.make || ''),
        priceLabel: String(c?.priceLabel || c?.price || ''),
        mileageLabel: String(c?.mileageLabel || c?.mileage || ''),
        engineType: String(c?.engineType || ''),
        transmission: String(c?.transmission || ''),
        reasons: Array.isArray(c?.reasons) ? c.reasons.map((r) => String(r)) : [],
        lifeFitScore:
          c?.lifeFitScore !== undefined && c?.lifeFitScore !== null
            ? Number(c.lifeFitScore)
            : undefined,
        lifeFitReasons: Array.isArray(c?.lifeFitReasons)
          ? c.lifeFitReasons.map((r) => String(r))
          : undefined,
      })),
    }
  }

  const questionId = String(payload?.questionId || payload?.id || 'q')
  const questionText = String(payload?.questionText || payload?.question || 'Please choose an option')
  let options = Array.isArray(payload?.options) ? payload.options.map((o) => String(o)) : []

  // Fixed body types (multi-select) and stable question id for UI.
  if (isBodyTypeQuestion(questionId, questionText)) {
    return {
      phase: 'question',
      questionId: 'body_type',
      questionText: 'Body Type',
      responseType: 'multi_select',
      options: [...CAR_ADVISOR_BODY_TYPES],
      uiHint: 'body_type_grid',
    }
  }

  // Fixed mileage bands (multi-select: user may pick several bands = OR).
  if (isMileageRangeQuestion(questionId, questionText)) {
    return {
      phase: 'question',
      questionId: 'mileage_range',
      questionText: 'Fuel mileage range (kmpl, ARAI/combined indicative)',
      responseType: 'multi_select',
      options: [...CAR_ADVISOR_MILEAGE_OPTIONS],
    }
  }

  // Safety rating (multi-select; if several non-Any, use strictest threshold).
  if (isSafetyQuestion(questionId, questionText)) {
    return {
      phase: 'question',
      questionId: 'safety_rating',
      questionText: 'Minimum safety rating you want',
      responseType: 'multi_select',
      options: [...CAR_ADVISOR_SAFETY_OPTIONS],
    }
  }

  // UX rule: ensure "Any" option exists for fuel type and transmission type.
  const isFuelQuestion = questionId.toLowerCase().includes('fuel') || /fuel type|engine type/i.test(questionText)
  const isTransmissionQuestion =
    questionId.toLowerCase().includes('transmission') || /transmission/i.test(questionText)
  if ((isFuelQuestion || isTransmissionQuestion) && !options.some((o) => String(o).toLowerCase() === 'any')) {
    options = ['Any', ...options]
  }

  return {
    phase: 'question',
    questionId,
    questionText,
    responseType: 'multi_select',
    options,
  }
}

router.post('/next', async (req, res) => {
  try {
    if (!config.aiApiKey) {
      return res.status(503).json({ message: 'AI is not configured. Set AI_API_KEY in backend/.env.' })
    }

    const history = Array.isArray(req.body?.history) ? req.body.history : []
    const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {}

    const systemPrompt = `You are an expert India car-buying assistant.
Return ONLY JSON and no extra text.

Pricing basis (mandatory):
- The user's **budget band always means Delhi on-road price** (on-road = ex-showroom plus RTO/charges and typical first-year insurance as commonly quoted for **Delhi**, not another city).
- When filtering or recommending cars, **only include variants whose estimated Delhi on-road price falls inside** the user's selected budget range; exclude anything above or below that band.
- In each car's **priceLabel**, prefer a clear Delhi on-road figure or range (e.g. "~₹18.5 lakh on-road, Delhi" or "₹17.9–18.4 lakh on-road, Delhi"). Do not use ex-showroom alone if it would mislead vs the user's on-road budget.

Conversation mode:
- Ask one question at a time with options, then wait for user selection.
- **Every question uses multi-select**: always return \`"responseType":"multi_select"\`. The user may pick **one or more** options per question; their answer is an **array of strings** (even if they only pick one—still use a one-element array in your understanding of history/answers).
- Build options dynamically from your own latest knowledge of Indian market cars and variants.
- Do NOT use placeholder options.
- Prefer option-based questions over free text.
- **Multi-select meaning**: Body types and car makes = **OR** (match any selected). Mileage bands = **OR** (car qualifies if it falls in any selected band). Fuel types and transmission types = **OR** unless "Any" alone means no filter. Budget bands = **OR** if multiple bands chosen. Safety: if user selects several non-"Any" thresholds, apply the **strictest** (highest minimum stars) among them; if "Any" is among selections with others, treat as no extra safety floor from "Any".

Suggested order (adapt if user already answered): budget band (Delhi on-road) → body type → car make (brands) → fuel → transmission → mileage range → safety rating → other needs.
When you ask budget, phrase the question and option labels as **Delhi on-road** price bands so the user knows what they are selecting.

When still collecting inputs, return:
{
  "phase":"question",
  "questionId":"string",
  "questionText":"string",
  "responseType":"multi_select",
  "options":["opt1","opt2"]
}

When enough data is collected, return:
{
  "phase":"result",
  "summary":"string",
  "cars":[
    {
      "id":"string",
      "model":"string",
      "make":"string",
      "priceLabel":"string",
      "mileageLabel":"string",
      "engineType":"string",
      "transmission":"string",
      "reasons":["r1","r2"]
    }
  ]
}

Rules:
- Apply strict filtering: only include cars matching all selected criteria (including body types, mileage band where applicable, safety expectation). **Budget must match Delhi on-road** (see Pricing basis above)—never satisfy budget using ex-showroom alone if Delhi on-road would exceed the band.
- When phase=result and cars are non-empty, set "summary" to ONE clear sentence. Match this structure and tone; substitute the user's real answers (never copy unrelated brands, budgets, or specs from examples):
  "Here are SUVs and coupes from Toyota, Hyundai, Tata, and Mahindra in the ₹20–35 lakh Delhi on-road range, offering roughly 15–20 kmpl, with petrol power and automatic transmission, and at least a 4★ Global NCAP (adult) safety rating."
  Another example:
  "Here are SUVs, hatchbacks, sedans, and compact sedans from Maruti Suzuki, Hyundai, Mahindra, and Tata in the ₹12–20 lakh Delhi on-road range, offering roughly 10–15 kmpl, with petrol power and a manual gearbox, and no minimum safety rating specified."
- **Fuel & transmission in the summary**: Read answers from history/answers (each may be a **string or string[]**). If the user picked specific fuel(s) and none are "Any", name them (e.g. "petrol or diesel"). Same for transmission. **Never** use vague phrases like "your chosen fuel type" when you can state the actual selection(s).
- **Both fuel and transmission are only "Any"** (answer is "Any" or \`["Any"]\` or equivalent): (a) In the summary, say explicitly that results include **petrol, diesel, CNG, and electric vehicles** (and strong hybrids where relevant)—not ICE-only. (b) In the **cars** list, **include electric models** that fit budget, body types, brands, and safety; do **not** omit EVs only because the user gave a kmpl band—ICE picks should match the mileage band, but EVs may appear with range/kWh or running-cost notes in "reasons" even though kmpl does not apply.
- **Safety in the summary**: If safety_rating is only "Any" (or \`["Any"]\`), write **"no minimum safety rating specified"**. Otherwise state the effective minimum Global NCAP adult star expectation after applying the strictest selected threshold.
- If no cars match, return phase=result with empty cars array and summary "No cars meet your requirement."
- For body type: use questionId "body_type", questionText "Body Type". Options will be normalized server-side to the standard body list—still mention body types in your reasoning.
- For mileage: use questionId "mileage_range" and ask for kmpl band; options will be normalized to exactly: Up to 10, 10-15, 15-20, 20+.
- For safety: use questionId "safety_rating" and ask minimum Global NCAP adult star expectation; options will be normalized server-side.
- Car make question: questionId should include "make" (e.g. car_make); list popular Indian-market brands as options (15–30), no duplicates.
- Fuel type question must include an "Any" option and should normally list Petrol, Diesel, CNG, Electric (and Hybrid if relevant) among choices.
- Transmission type question must include an "Any" option.
- Keep options concise, max 35 items.
- Keep cars max 8.

LifeFit Score™ integration:
- Drive AI must gather real-life context with questions for daily commute, family size, road conditions, parking constraints, fuel cost sensitivity, and long-trip frequency.
- These LifeFit questions must be asked before returning phase=result. If any LifeFit input is missing, continue asking questions and do not return results yet.
- Use consistent questionIds where possible, for example:
  * daily_commute
  * family_size
  * road_conditions
  * parking_space
  * fuel_cost_sensitivity
  * long_trip_frequency
- Offer multi-select options for each LifeFit question; do not use free-text answers.
- Score each car out of 100 using this weighted formula:
  * 30% Usage Match
  * 20% Cost Efficiency
  * 20% Comfort Fit
  * 15% Terrain Suitability
  * 15% Future Needs
- When returning phase=result, each recommended car may include numeric "lifeFitScore" and optional array "lifeFitReasons".
- The summary and reasons should explain how the car fits the user's life, including any trade-offs.
- Always return valid JSON only; do not add extra prose outside JSON.`

    const userPrompt = JSON.stringify({
      history,
      answers,
      budgetAppliesTo: 'Delhi on-road price (filter variants strictly to this)',
    })
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

    return res.json({ data: normalizeAiPayload(parsed, answers) })
  } catch {
    return res.status(500).json({ message: 'Could not process car advisor request.' })
  }
})

export default router
