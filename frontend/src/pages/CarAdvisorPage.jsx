import { useEffect, useMemo, useState } from 'react'
import { CarBodyTypeIcon } from '../components/CarBodyTypeIcons.jsx'
import { carDekhoSearchUrl, carWaleSearchUrl } from '../utils/carPortalLinks.js'
import './carAdvisor.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export default function CarAdvisorPage() {
  const [history, setHistory] = useState([])
  const [answers, setAnswers] = useState({})
  const [question, setQuestion] = useState(null)
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedMulti, setSelectedMulti] = useState([])
  const [bodySectionOpen, setBodySectionOpen] = useState(true)

  const transcript = useMemo(() => {
    return history.map((h) => ({
      q: h.questionText,
      a: Array.isArray(h.answer) ? h.answer.join(', ') : String(h.answer || 'No preference'),
    }))
  }, [history])

  const fetchNext = async (nextHistory, nextAnswers) => {
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/car-advisor/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: nextHistory, answers: nextAnswers }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not fetch AI car advisor response.')
      const payload = data?.data || {}
      if (payload.phase === 'result') {
        setQuestion(null)
        setResult({
          summary: String(payload.summary || 'Top matching cars for you'),
          cars: Array.isArray(payload.cars) ? payload.cars : [],
        })
      } else {
        setResult(null)
        const qId = String(payload.questionId || 'q')
        const qText = String(payload.questionText || 'Please choose an option')
        let qOptions = Array.isArray(payload.options) ? payload.options : []
        const isFuelQuestion = qId.toLowerCase().includes('fuel') || /fuel type|engine type/i.test(qText)
        const isTransmissionQuestion = qId.toLowerCase().includes('transmission') || /transmission/i.test(qText)
        if ((isFuelQuestion || isTransmissionQuestion) && !qOptions.some((o) => String(o).toLowerCase() === 'any')) {
          qOptions = ['Any', ...qOptions]
        }
        const uiHint = payload.uiHint === 'body_type_grid' || qId === 'body_type' ? 'body_type_grid' : null
        setQuestion({
          id: qId,
          prompt: qText,
          type: 'multi_select',
          options: qOptions,
          uiHint,
        })
        setSelectedMulti([])
        setBodySectionOpen(true)
      }
    } catch (e) {
      setError(e?.message || 'Could not fetch AI car advisor response.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNext([], {})
  }, [])

  const submitMulti = () => {
    if (!question) return
    const value = selectedMulti.slice()
    const nextHistory = [...history, { questionId: question.id, questionText: question.prompt, answer: value }]
    const nextAnswers = { ...answers, [question.id]: value }
    setHistory(nextHistory)
    setAnswers(nextAnswers)
    fetchNext(nextHistory, nextAnswers)
  }

  const goBack = () => {
    if (!history.length || isLoading) return
    const nextHistory = history.slice(0, -1)
    const nextAnswers = { ...answers }
    const removed = history[history.length - 1]
    delete nextAnswers[removed.questionId]
    setHistory(nextHistory)
    setAnswers(nextAnswers)
    fetchNext(nextHistory, nextAnswers)
  }

  const startOver = () => {
    setHistory([])
    setAnswers({})
    setQuestion(null)
    setResult(null)
    setSelectedMulti([])
    fetchNext([], {})
  }

  const sortedCars = useMemo(() => {
    if (!result?.cars?.length) return []
    return [...result.cars].sort((a, b) => {
      const aScore = Number(a.lifeFitScore ?? -Infinity)
      const bScore = Number(b.lifeFitScore ?? -Infinity)
      return bScore - aScore
    })
  }, [result?.cars])

  return (
    <div className="carAdvisorPage">
      <div
        className={`carAdvisorCard${question?.uiHint === 'body_type_grid' ? ' isWide' : ''}`}
      >
        <div className="carChatHeader">
          <div className="carChatAvatar">🤖</div>
          <div className="carChatHeadMeta">
            <div className="carChatHeadTitle">Drive AI Bot</div>
            <div className="carChatHeadSub">Online now</div>
          </div>
          <button type="button" className="carChatMenuBtn" onClick={startOver}>
            New chat
          </button>
        </div>

        {result == null ? (
          <div className="carChatBlock carChatUi">
            <div className="carChatRows">
              {transcript.map((m, idx) => (
                <div key={idx} className="carChatRow">
                  <div className="carBotBubble">{m.q}</div>
                  <div className="carUserBubble">{m.a}</div>
                </div>
              ))}

              {question ? (
                <div className="carChatRow isCurrent">
                  <div className="carBotBubble">{question.prompt}</div>
                  <div className="carOptionPane">
                    {question.uiHint === 'body_type_grid' ? (
                      <>
                        <div className="carBodySection">
                          <button
                            type="button"
                            className="carBodySectionHead"
                            onClick={() => setBodySectionOpen((o) => !o)}
                            aria-expanded={bodySectionOpen}
                          >
                            <span>Body Type</span>
                            <span className={`carBodyChevron${bodySectionOpen ? ' isOpen' : ''}`} aria-hidden>
                              ^
                            </span>
                          </button>
                          {bodySectionOpen ? (
                            <div className="carBodyGrid">
                              {question.options.map((op) => {
                                const isOn = selectedMulti.includes(op)
                                return (
                                  <button
                                    type="button"
                                    key={op}
                                    className={`carBodyCard ${isOn ? 'isSelected' : ''}`}
                                    onClick={() =>
                                      setSelectedMulti((prev) =>
                                        isOn ? prev.filter((x) => x !== op) : [...prev, op]
                                      )
                                    }
                                  >
                                    {isOn ? (
                                      <span className="carBodyCheck" aria-hidden>
                                        ✓
                                      </span>
                                    ) : null}
                                    <span className="carBodyIconWrap">
                                      <CarBodyTypeIcon bodyType={op} />
                                    </span>
                                    <span className="carBodyLabel">{op}</span>
                                  </button>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="carBtn carBtnTeal"
                          onClick={submitMulti}
                          disabled={isLoading || selectedMulti.length === 0}
                        >
                          {isLoading ? 'Thinking...' : 'Continue'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="carMakeHint">Select one or more options</p>
                        <div className="carOptionGrid carMakeChipGrid">
                          {question.options.map((op) => {
                            const isOn = selectedMulti.includes(op)
                            return (
                              <button
                                type="button"
                                key={op}
                                className={`carOptionBtn ${isOn ? 'isSelected' : ''}`}
                                onClick={() =>
                                  setSelectedMulti((prev) =>
                                    isOn ? prev.filter((x) => x !== op) : [...prev, op]
                                  )
                                }
                              >
                                {op}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          className="carBtn"
                          onClick={submitMulti}
                          disabled={isLoading || selectedMulti.length === 0}
                        >
                          {isLoading ? 'Thinking...' : 'Continue'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
              {isLoading ? <div className="carBotBubble">Thinking...</div> : null}
              {error ? <div className="carEmpty">{error}</div> : null}
            </div>

            <div className="carActions">
              {history.length > 0 ? (
                <button
                  type="button"
                  className="carBtn ghost"
                  onClick={goBack}
                  disabled={isLoading}
                >
                  Back
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="carResultBlock">
            <div className="carResultHead">{result.summary || 'Top matching cars for you'}</div>
            {!result.cars?.length ? <div className="carEmpty">No cars meet your requirement.</div> : null}
            {sortedCars.map((car) => (
              <div key={car.id} className="carItem">
                <div className="carModel">{car.model}</div>
                <div className="carMeta">
                  {[car.make, car.priceLabel, car.mileageLabel, car.engineType, car.transmission].filter(Boolean).join(' · ')}
                </div>
                {car.lifeFitScore != null ? (
                  <div className="carLifeFit">
                    <div className="carLifeFitTop">
                      <div className="carLifeFitRing" style={{ '--score': car.lifeFitScore }}>
                        <span>{car.lifeFitScore}</span>
                      </div>
                      <div className="carLifeFitDetails">
                        <div className="carLifeFitLabel">LifeFit Score</div>
                        <div className="carLifeFitText">
                          {car.lifeFitScore >= 85
                            ? 'Excellent match for your life and commute.'
                            : car.lifeFitScore >= 70
                            ? 'Strong match with a few trade-offs.'
                            : 'Good starting point; compare carefully for comfort and cost.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <ul className="carReasons">
                  {(car.reasons || []).slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  {(car.lifeFitReasons || []).slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="carViewMoreRow">
                  <span className="carViewMoreLabel">View more</span>
                  <a
                    className="carViewMoreLink"
                    href={carDekhoSearchUrl(car)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CarDekho
                  </a>
                  <span className="carViewMoreSep" aria-hidden>
                    ·
                  </span>
                  <a
                    className="carViewMoreLink"
                    href={carWaleSearchUrl(car)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CarWale
                  </a>
                  <span className="carViewMoreHint">(new tab)</span>
                </div>
              </div>
            ))}
            <button type="button" className="carBtn" onClick={startOver}>
              Start new search
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
