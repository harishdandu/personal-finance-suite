import { useEffect, useMemo, useState } from 'react'
import { formatIndianRupees } from '../utils/sipCalculator'
import {
  PROOF_CATEGORIES,
  categoryById,
  extractSmartProofSingleFile,
} from '../utils/smartProofCollector'
import './smartProofCollector.css'

const HISTORY_KEY = 'fb.proofHistory'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function loadHistory(email) {
  if (typeof window === 'undefined' || !email) return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return Array.isArray(parsed[email]) ? parsed[email] : []
  } catch {
    return []
  }
}

function saveHistory(email, entry) {
  if (typeof window === 'undefined' || !email) return
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const current = Array.isArray(parsed[email]) ? parsed[email] : []
    parsed[email] = [entry, ...current].slice(0, 12)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(parsed))
  } catch {
    // Ignore localStorage write errors
  }
}

function parseAmountInput(raw) {
  const n = Number(String(raw || '').replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export default function SmartProofCollectorPage({ user }) {
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [extraction, setExtraction] = useState(null)
  const [mapAmount, setMapAmount] = useState('')
  const [mapCategoryId, setMapCategoryId] = useState('hra')
  const [historyVersion, setHistoryVersion] = useState(0)
  const [savedRecords, setSavedRecords] = useState([])
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [openCategoryId, setOpenCategoryId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewMimeType, setPreviewMimeType] = useState('')

  const history = useMemo(() => loadHistory(user?.email), [user?.email, historyVersion])

  const deductionCats = useMemo(() => PROOF_CATEGORIES.filter((c) => c.section === 'deduction'), [])
  const reimbCats = useMemo(() => PROOF_CATEGORIES.filter((c) => c.section === 'reimbursement'), [])

  const totalsByCategory = useMemo(() => {
    const totals = Object.fromEntries(PROOF_CATEGORIES.map((c) => [c.id, 0]))
    for (const r of Array.isArray(savedRecords) ? savedRecords : []) {
      const id = String(r.categoryId || '')
      const amt = Number(r.amount || 0)
      if (!id || !Number.isFinite(amt) || amt <= 0) continue
      totals[id] = (totals[id] || 0) + Math.round(amt)
    }
    return totals
  }, [savedRecords])

  const recordsByCategory = useMemo(() => {
    const map = new Map()
    for (const r of Array.isArray(savedRecords) ? savedRecords : []) {
      const id = String(r.categoryId || '')
      if (!id) continue
      const arr = map.get(id) || []
      arr.push(r)
      map.set(id, arr)
    }
    return map
  }, [savedRecords])

  const loadSavedRecords = async () => {
    if (!user?.token) {
      setSavedRecords([])
      return
    }
    setIsLoadingSaved(true)
    try {
      const res = await fetch(`${API_BASE}/proofs`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not load saved proofs.')
      setSavedRecords(Array.isArray(data.records) ? data.records : [])
    } catch (e) {
      setError(e?.message || 'Could not load saved proofs.')
    } finally {
      setIsLoadingSaved(false)
    }
  }

  useEffect(() => {
    loadSavedRecords()
  }, [user?.token])

  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const openSavedProofFile = async (record) => {
    if (!record) return
    const fileData = String(record.fileData || '').trim()
    if (fileData) {
      try {
        const mimeType = String(record.mimeType || 'application/octet-stream')
        const binary = window.atob(fileData)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: mimeType })
        const blobUrl = window.URL.createObjectURL(blob)
        window.open(blobUrl, '_blank', 'noopener,noreferrer')
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 20000)
        return
      } catch {
        // If base64 decode fails for any reason, fallback to file API below.
      }
    }

    const recordId = record.id
    if (!user?.token || !recordId) return
    try {
      const res = await fetch(`${API_BASE}/proofs/${recordId}/file`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Could not open proof file.')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => window.URL.revokeObjectURL(url), 15000)
    } catch (e) {
      setError(e?.message || 'Could not open proof file.')
    }
  }

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const out = String(reader.result || '')
        resolve(out.replace(/^data:[^;]+;base64,/, ''))
      }
      reader.onerror = () => reject(new Error('Could not read file as base64.'))
      reader.readAsDataURL(file)
    })

  const onProofUpload = async (fileList) => {
    const file = fileList?.[0]
    setError('')
    setExtraction(null)
    setMapAmount('')
    setMapCategoryId('hra')
    if (!file) {
      setSelectedFileName('')
      setSelectedFile(null)
      setPreviewUrl('')
      setPreviewMimeType('')
      return
    }

    setSelectedFileName(file.name)
    setSelectedFile(file)
    const nextPreview = window.URL.createObjectURL(file)
    setPreviewUrl((prev) => {
      if (prev) window.URL.revokeObjectURL(prev)
      return nextPreview
    })
    setPreviewMimeType(file.type || '')
    setIsParsing(true)
    try {
      const ex = await extractSmartProofSingleFile(file)
      setExtraction(ex)
      const first = ex.candidates?.[0]
      if (first) setMapAmount(String(first.amount))
      if (ex.suggestedCategoryId) setMapCategoryId(ex.suggestedCategoryId)
      else if (first) setMapCategoryId('80c')
    } catch (e) {
      setError(e?.message || 'Could not parse proof file.')
    } finally {
      setIsParsing(false)
    }
  }

  const applyMapping = async () => {
    const amt = parseAmountInput(mapAmount)
    if (amt == null) {
      setError('Enter a valid positive amount.')
      return
    }
    const cat = categoryById(mapCategoryId)
    if (!cat) {
      setError('Choose a category.')
      return
    }
    if (!selectedFile) {
      setError('Please upload a proof file first.')
      return
    }
    if (!user?.token) {
      setError('Please login again to save mapping.')
      return
    }

    setError('')
    setIsSaving(true)
    try {
      const fileBase64 = await fileToBase64(selectedFile)

      const res = await fetch(`${API_BASE}/proofs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: String(amt),
          categoryId: mapCategoryId,
          categoryLabel: cat.label,
          fileName: selectedFile.name || selectedFileName || 'proof',
          mimeType: selectedFile.type || 'application/octet-stream',
          fileBase64,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save proof mapping.')

      saveHistory(user?.email, {
        at: new Date().toISOString(),
        fileName: extraction?.fileName || selectedFileName,
        categoryId: mapCategoryId,
        categoryLabel: cat.label,
        amount: amt,
      })
      setHistoryVersion((n) => n + 1)
      await loadSavedRecords()
      // Reset uploaded/extracted state after successful mapping.
      setSelectedFile(null)
      setSelectedFileName('')
      setExtraction(null)
      setMapAmount('')
      setMapCategoryId('hra')
      setOpenCategoryId(null)
      setPreviewUrl((prev) => {
        if (prev) window.URL.revokeObjectURL(prev)
        return ''
      })
      setPreviewMimeType('')
    } catch (e) {
      setError(e?.message || 'Could not save proof mapping.')
    } finally {
      setIsSaving(false)
    }
  }

  const capWarning = (cat, value) => {
    if (cat.cap == null || value <= cat.cap) return null
    return `Exceeds typical cap ₹${formatIndianRupees(cat.cap)} (for reference only).`
  }

  return (
    <div className="proofPage">
      <div className="proofCard">
        <div className="proofTitle">Smart Proof Collector</div>
        <div className="proofSub">
          Upload one proof at a time. We extract text and amounts; you choose how to map them to deductions or
          reimbursements.
        </div>

        <div className="proofBlock">
          <div className="proofLabel">Upload proof (single file)</div>
          <div className="proofUploadRow">
            <div className="proofUploadCol">
              <input
                type="file"
                accept="application/pdf,image/*,.csv,text/csv,text/plain"
                onChange={(e) => {
                  onProofUpload(e.target.files)
                  e.target.value = ''
                }}
              />
              {selectedFileName ? <div className="proofHint">File: {selectedFileName}</div> : null}
              {isParsing ? <div className="proofHint">Extracting text and amounts…</div> : null}
              {error ? <div className="proofError">{error}</div> : null}
            </div>
            <div className="proofPreviewCol">
              {previewUrl ? (
                previewMimeType.startsWith('image/') ? (
                  <img src={previewUrl} alt="Uploaded proof preview" className="proofPreviewImg" />
                ) : previewMimeType.includes('pdf') ? (
                  <iframe src={previewUrl} title="Proof preview" className="proofPreviewFrame" />
                ) : (
                  <div className="proofHint">Preview not available for this file type.</div>
                )
              ) : (
                <div className="proofHint">Preview appears here after upload.</div>
              )}
            </div>
          </div>
        </div>

        {extraction ? (
          <div className="proofBlock proofExtractBlock">
            <div className="proofLabel">Extracted data</div>
            <div className="proofExtractMeta">
              <span className="proofKindTag">Detected: {extraction.kind}</span>
              {extraction.suggestedCategoryId ? (
                <span className="proofSuggested">
                  Suggested category:{' '}
                  <strong>{categoryById(extraction.suggestedCategoryId)?.label || extraction.suggestedCategoryId}</strong>
                </span>
              ) : null}
            </div>
            {extraction.notes?.length ? (
              <ul className="proofNotes">
                {extraction.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
            {extraction.textSnippet ? (
              <details className="proofTextDetails">
                <summary>Text preview (first ~1200 characters)</summary>
                <pre className="proofTextPre">{extraction.textSnippet}</pre>
              </details>
            ) : null}
            {extraction.candidates?.length ? (
              <div className="proofCandidates">
                <div className="proofCandidatesLabel">Detected amounts (tap to use)</div>
                <div className="proofCandidateChips">
                  {extraction.candidates.map((c, idx) => (
                    <button
                      key={`${c.amount}-${idx}`}
                      type="button"
                      className="proofChip"
                      onClick={() => setMapAmount(String(c.amount))}
                    >
                      ₹{formatIndianRupees(c.amount)}
                      <span className="proofChipSub">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="proofHint">No amounts auto-detected. Enter the amount manually below.</div>
            )}

            <div className="proofMapRow">
              <label className="proofMapField">
                <span className="proofMapFieldLabel">Amount (₹)</span>
                <input
                  className="proofMapInput"
                  inputMode="decimal"
                  value={mapAmount}
                  onChange={(e) => setMapAmount(e.target.value)}
                  placeholder="e.g. 150000"
                />
              </label>
              <label className="proofMapField proofMapFieldGrow">
                <span className="proofMapFieldLabel">Map to category</span>
                <select
                  className="proofMapSelect"
                  value={mapCategoryId}
                  onChange={(e) => setMapCategoryId(e.target.value)}
                >
                  <optgroup label="Deductions">
                    {deductionCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                        {c.cap != null ? ` (max ₹${formatIndianRupees(c.cap)})` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Reimbursements">
                    {reimbCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <button type="button" className="proofApplyBtn" onClick={applyMapping} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Apply mapping'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="proofSectionTitle">Totals </div>
        <div className="proofTotalsGroup">
          <div className="proofTotalsSubgroup">
            <div className="proofSubgroupTitle">Deductions</div>
            <div className="proofTotals proofTotalsMany">
              {deductionCats.map((c) => {
                const v = totalsByCategory[c.id] || 0
                const warn = capWarning(c, v)
                const rows = recordsByCategory.get(c.id) || []
                return (
                  <div key={c.id} className={`proofTotalItem ${warn ? 'isCappedWarn' : ''}`}>
                    <div className="proofTotalLabel">
                      {c.label}
                      {c.cap != null ? (
                        <span className="proofCapHint"> · cap ₹{formatIndianRupees(c.cap)}</span>
                      ) : null}
                    </div>
                    <div className="proofTotalValue">₹{formatIndianRupees(v)}</div>
                    {warn ? <div className="proofCapWarn">{warn}</div> : null}
                    {rows.length ? (
                      <button
                        type="button"
                        className="proofViewMoreBtn"
                        onClick={() => setOpenCategoryId((cur) => (cur === c.id ? null : c.id))}
                      >
                        {openCategoryId === c.id ? 'Hide proofs' : `View more (${rows.length})`}
                      </button>
                    ) : (
                      <div className="proofHint">No proofs yet</div>
                    )}
                    {openCategoryId === c.id ? (
                      <div className="proofMoreWrap">
                        {rows.map((r) => (
                          <div key={r.id} className="proofSavedRow">
                            <div className="proofSavedMeta">
                              <strong>{r.fileName}</strong> · ₹{formatIndianRupees(r.amount || 0)} ·{' '}
                              {new Date(r.createdAt).toLocaleString()}
                            </div>
                            <button type="button" className="proofOpenBtn" onClick={() => openSavedProofFile(r)}>
                              Open
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="proofTotalsSubgroup">
            <div className="proofSubgroupTitle">Reimbursements</div>
            <div className="proofTotals proofTotalsMany proofTotalsReimb">
              {reimbCats.map((c) => {
                const v = totalsByCategory[c.id] || 0
                const rows = recordsByCategory.get(c.id) || []
                return (
                  <div key={c.id} className="proofTotalItem">
                    <div className="proofTotalLabel">{c.label}</div>
                    <div className="proofTotalValue">₹{formatIndianRupees(v)}</div>
                    {rows.length ? (
                      <button
                        type="button"
                        className="proofViewMoreBtn"
                        onClick={() => setOpenCategoryId((cur) => (cur === c.id ? null : c.id))}
                      >
                        {openCategoryId === c.id ? 'Hide proofs' : `View more (${rows.length})`}
                      </button>
                    ) : (
                      <div className="proofHint">No proofs yet</div>
                    )}
                    {openCategoryId === c.id ? (
                      <div className="proofMoreWrap">
                        {rows.map((r) => (
                          <div key={r.id} className="proofSavedRow">
                            <div className="proofSavedMeta">
                              <strong>{r.fileName}</strong> · ₹{formatIndianRupees(r.amount || 0)} ·{' '}
                              {new Date(r.createdAt).toLocaleString()}
                            </div>
                            <button type="button" className="proofOpenBtn" onClick={() => openSavedProofFile(r)}>
                              Open
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* <div className="proofBlock">
          <div className="proofLabel">Recent mappings ({user?.email || 'guest'})</div>
          {history.length ? (
            history.map((h, idx) => (
              <div key={`${h.at}-${idx}`} className="proofRow">
                {new Date(h.at).toLocaleString()} · {h.fileName || '—'} · ₹{formatIndianRupees(h.amount || 0)} →{' '}
                {h.categoryLabel || h.categoryId}
              </div>
            ))
          ) : (
            <div className="proofHint">No saved mappings yet for this account.</div>
          )}
        </div> */}

      </div>
    </div>
  )
}
