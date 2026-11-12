import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { fetchCogneePrecedents, getCachedCogneePrecedents } from '../lib/cognee'
import {
  buildDispatchDraft,
  buildFlexibleQuoteRegex,
  dateTime,
  durationLabel,
  evidenceFieldLabel,
  extractCallbackPhone,
  findMatchingTurnIndex,
  hoursMarker,
  isRecordDone,
  parseTranscript,
  primaryAction,
  priorityLabel,
  receivedAt,
  sourceLabel,
  typeLabel,
} from '../lib/format'
import { requestGrokDispatch } from '../lib/grok'
import type {
  CogneeSearchResult,
  DispatchMode,
  EvidenceQuote,
  GrokDispatchResult,
  InboxRecord,
  Priority,
} from '../types'

type WorkbenchTab = 'overview' | 'transcript' | 'dispatch'

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

function priorityBadgeClass(priority: string): string {
  if (priority === 'urgent') return 'border-red-200 bg-red-50 text-red-700'
  if (priority === 'today') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

function renderHighlightedText(
  text: string,
  searchQuery: string,
  activeQuote: string | null,
) {
  const q = searchQuery.trim()
  const quoteRegex = activeQuote ? buildFlexibleQuoteRegex(activeQuote) : null

  if (quoteRegex) {
    const parts = text.split(quoteRegex)
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
        return (
          <mark
            key={`ev-${idx}`}
            className="rounded bg-amber-200/85 px-1 py-0.5 font-medium text-slate-950 ring-1 ring-amber-300"
          >
            {part}
          </mark>
        )
      }
      if (!q) return part
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const subParts = part.split(new RegExp(`(${escaped})`, 'gi'))
      return subParts.map((sub, subIdx) =>
        sub.toLowerCase() === q.toLowerCase() ? (
          <mark key={`sq-${idx}-${subIdx}`} className="rounded bg-sky-100 px-0.5 text-slate-950">
            {sub}
          </mark>
        ) : (
          sub
        ),
      )
    })
  }

  if (!q) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={idx} className="rounded bg-sky-100 px-0.5 text-slate-950">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

type ActiveEvidence = {
  field: string
  quote: string
  turnIndex: number
}

type Props = {
  row: InboxRecord | null
  loading: boolean
  hasRows: boolean
  onBackMobile: () => void
  onToggleAction: (actionId: string, nextDone: boolean) => Promise<void>
  onAddFollowUp: (recordId: string, text: string, priority: Priority) => Promise<boolean>
  onUpdatePriority: (recordId: string, priority: Priority) => Promise<void>
  onDraftSaved: (recordId: string, draftReply: string) => void
  onNotify: (tone: 'info' | 'success' | 'error', message: string) => void
}

export default function RecordWorkbench({
  row,
  loading,
  hasRows,
  onBackMobile,
  onToggleAction,
  onAddFollowUp,
  onUpdatePriority,
  onDraftSaved,
  onNotify,
}: Props) {
  const defaultMode: DispatchMode =
    row?.type === 'maintenance' ? 'contractor' : row?.type === 'viewing' ? 'caller' : 'handover'

  const [activeTab, setActiveTab] = useState<WorkbenchTab>('overview')
  const [noteOpen, setNoteOpen] = useState(false)
  const [followUpText, setFollowUpText] = useState('')
  const [addingFollowUp, setAddingFollowUp] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [updatingPriority, setUpdatingPriority] = useState(false)
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>(defaultMode)
  const [editedByMode, setEditedByMode] = useState<Partial<Record<DispatchMode, string>>>({})
  const [dispatchByMode, setDispatchByMode] = useState<
    Partial<Record<DispatchMode, GrokDispatchResult>>
  >({})
  const [draftingMode, setDraftingMode] = useState<DispatchMode | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [useSavedDraftOnDefault, setUseSavedDraftOnDefault] = useState(true)
  const [activeEvidence, setActiveEvidence] = useState<ActiveEvidence | null>(null)
  const [pendingScrollTurn, setPendingScrollTurn] = useState<number | null>(null)

  const canAutoSearchCognee = Boolean(
    row && row.triage_source !== 'empty' && row.summary !== 'Hung up at greeting',
  )
  const [cogneeState, setCogneeState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error'
    data: CogneeSearchResult | null
    error: string | null
  }>(() => {
    if (!row) return { status: 'idle', data: null, error: null }
    const cached = getCachedCogneePrecedents(row.id)
    if (cached) return { status: 'ready', data: cached, error: null }
    return {
      status: canAutoSearchCognee ? 'loading' : 'idle',
      data: null,
      error: null,
    }
  })

  useEffect(() => {
    if (!row || !canAutoSearchCognee) return
    if (getCachedCogneePrecedents(row.id)) return

    const controller = new AbortController()
    fetchCogneePrecedents({ recordId: row.id, limit: 3, signal: controller.signal })
      .then((data) => {
        setCogneeState({ status: 'ready', data, error: null })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setCogneeState({
          status: 'error',
          data: null,
          error: err instanceof Error ? err.message : 'Could not load Dwelly precedents',
        })
      })
    return () => controller.abort()
  }, [row, canAutoSearchCognee])

  async function handleLoadCognee(force = false) {
    if (!row) return
    setCogneeState((prev) => ({ status: 'loading', data: prev.data, error: null }))
    try {
      const data = await fetchCogneePrecedents({ recordId: row.id, limit: 3, force })
      setCogneeState({ status: 'ready', data, error: null })
    } catch (err) {
      setCogneeState({
        status: 'error',
        data: null,
        error: err instanceof Error ? err.message : 'Could not load Dwelly precedents',
      })
    }
  }

  const transcriptTopRef = useRef<HTMLDivElement | null>(null)
  const turnRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (activeTab !== 'transcript' || pendingScrollTurn === null) return
    const targetIdx = pendingScrollTurn
    const frame = window.requestAnimationFrame(() => {
      if (targetIdx >= 0 && turnRefs.current[targetIdx]) {
        turnRefs.current[targetIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        transcriptTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setPendingScrollTurn(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, pendingScrollTurn])

  const action = row ? primaryAction(row.actions) : null
  const done = row ? isRecordDone(row) : false
  const transcript = row?.call?.transcript?.trim() ?? ''
  const turns = useMemo(() => parseTranscript(transcript), [transcript])
  const callbackPhone = useMemo(() => extractCallbackPhone(transcript), [transcript])
  const marker = row ? hoursMarker(row.call) : null

  const combinedEvidence = useMemo(() => {
    if (!row) return [] as EvidenceQuote[]
    const list: EvidenceQuote[] = [...row.evidence_quotes]
    const actionQuote = row.actions[0]?.evidence_quote?.trim()
    if (
      actionQuote &&
      !list.some((ev) => ev.quote.toLowerCase() === actionQuote.toLowerCase())
    ) {
      list.push({ field: 'action', quote: actionQuote })
    }
    return list
  }, [row])

  const activeDispatchResult = dispatchByMode[dispatchMode] ?? null
  const manualDraft = editedByMode[dispatchMode]
  const savedReplyAvailable = Boolean(row?.draft_reply?.trim())
  const usingSavedTriageDraft =
    manualDraft === undefined &&
    activeDispatchResult === null &&
    dispatchMode === defaultMode &&
    useSavedDraftOnDefault &&
    savedReplyAvailable

  const draftText = useMemo(() => {
    if (!row) return ''
    if (manualDraft !== undefined) return manualDraft
    if (activeDispatchResult) return activeDispatchResult.message
    if (usingSavedTriageDraft && row.draft_reply) return row.draft_reply
    return buildDispatchDraft(row, dispatchMode)
  }, [row, manualDraft, activeDispatchResult, usingSavedTriageDraft, dispatchMode])

  const draftEdited = manualDraft !== undefined

  async function copyValue(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      onNotify('success', label)
    } catch {
      onNotify('error', 'Clipboard access was blocked by the browser.')
    }
  }

  async function handleToggle(actionId: string, nextDone: boolean) {
    setTogglingId(actionId)
    await onToggleAction(actionId, nextDone)
    setTogglingId(null)
  }

  async function handlePriority(nextPriority: Priority) {
    if (!row || row.priority === nextPriority) return
    setUpdatingPriority(true)
    await onUpdatePriority(row.id, nextPriority)
    setUpdatingPriority(false)
  }

  async function handleFollowUpSubmit(e: FormEvent) {
    e.preventDefault()
    if (!row || !followUpText.trim()) return
    setAddingFollowUp(true)
    const ok = await onAddFollowUp(
      row.id,
      followUpText,
      (row.priority as Priority) || 'today',
    )
    setAddingFollowUp(false)
    if (ok) {
      setFollowUpText('')
      setNoteOpen(false)
    }
  }

  function handleJumpToEvidence(ev: EvidenceQuote) {
    const turnIndex = findMatchingTurnIndex(turns, ev.quote)
    setActiveEvidence({ field: ev.field, quote: ev.quote, turnIndex })
    setActiveTab('transcript')
    setPendingScrollTurn(turnIndex)
  }

  async function handleDraftWithGrok() {
    if (!row) return
    const targetMode = dispatchMode
    setDraftingMode(targetMode)
    setDispatchError(null)
    try {
      const result = await requestGrokDispatch({
        recordId: row.id,
        mode: targetMode,
        save: true,
      })
      setDispatchByMode((prev) => ({ ...prev, [targetMode]: result }))
      setEditedByMode((prev) => {
        const next = { ...prev }
        delete next[targetMode]
        return next
      })
      onDraftSaved(row.id, result.message)
      onNotify(
        'success',
        `Drafted ${targetMode} update with Grok (${result.latency_ms}ms)`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Grok dispatch failed'
      setDispatchError(msg)
      onNotify('error', msg)
    } finally {
      setDraftingMode(null)
    }
  }

  if (!row) {
    return (
      <main className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-[var(--shadow-card)] lg:h-[calc(100vh-12.75rem)]">
        <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-[11px] font-medium text-slate-600">
          Morning Lane · Workbench
        </span>
        <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {loading ? 'Loading records…' : hasRows ? 'Select a record to inspect' : 'Inbox is clear'}
        </p>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          {loading
            ? 'Fetching calls, structured records, and manager actions from Supabase.'
            : 'Choose a call from the left queue (or press j / k) to inspect its transcript, Grok evidence, and dispatch draft.'}
        </p>
      </main>
    )
  }

  const safetyTone =
    row.safety_check === 'asked, concern'
      ? 'text-red-600 font-semibold'
      : row.safety_check === 'asked, clear'
        ? 'text-emerald-600 font-semibold'
        : 'text-slate-800'

  const provenanceLabel =
    row.triage_source === 'grok'
      ? 'Triaged by Grok'
      : row.triage_source === 'fallback'
        ? 'Fallback triage'
        : row.triage_source === 'empty'
          ? 'No caller speech'
          : 'Standard intake'

  const headerTitle = row.property?.trim() || row.summary
  const callerInitials = row.call?.caller_initials?.trim() || null

  return (
    <main className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)] lg:h-[calc(100vh-12.75rem)] lg:min-h-[560px]">
      {/* Mobile back bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={onBackMobile}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-700 hover:text-slate-950"
        >
          <span>←</span> Back to Inbox
        </button>
        <span className="max-w-[180px] truncate font-mono text-[11px] text-slate-400">{row.id}</span>
      </div>

      {/* Crisp Record Header (Always Visible) */}
      <header className="border-b border-slate-200 bg-white px-5 pt-5 pb-4 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Priority badge + selector */}
              <div className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityBadgeClass(row.priority)}`}
                >
                  {priorityLabel(row.priority)}
                </span>
                <select
                  value={row.priority}
                  disabled={updatingPriority}
                  onChange={(e) => void handlePriority(e.target.value as Priority)}
                  aria-label="Set record priority"
                  className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white focus:border-sky-500 focus:outline-none disabled:opacity-50"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      Set: {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                {typeLabel(row.type)}
              </span>

              {marker && (
                <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[10.5px] font-medium text-sky-700">
                  {marker}
                </span>
              )}

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-medium ${
                  row.triage_source === 'grok'
                    ? 'border-sky-200 bg-sky-50/70 text-sky-700'
                    : row.triage_source === 'fallback'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
                data-testid="grok-provenance"
                title={
                  row.grok_model
                    ? `${provenanceLabel} · ${row.grok_model}${row.grok_latency_ms != null ? ` (${row.grok_latency_ms}ms)` : ''}`
                    : provenanceLabel
                }
              >
                <span
                  className={`size-1.5 rounded-full ${
                    row.triage_source === 'grok'
                      ? 'bg-sky-500'
                      : row.triage_source === 'fallback'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                  }`}
                />
                {provenanceLabel}
                {row.triage_source === 'grok' && row.grok_latency_ms != null && (
                  <span className="text-sky-600/75">· {row.grok_latency_ms}ms</span>
                )}
              </span>
            </div>

            <h2 className="mt-2.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {headerTitle}
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {callerInitials && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800">
                  <svg
                    className="size-3.5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {callerInitials}
                </span>
              )}

              <button
                type="button"
                onClick={() =>
                  void copyValue(
                    callbackPhone ??
                      `${row.property || 'Property'} — Callback ${
                        row.callback_confirmed ? 'confirmed' : 'not confirmed'
                      } (${row.summary})`,
                    callbackPhone ? `Copied ${callbackPhone}` : 'Copied callback summary',
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-700 transition hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-700"
                title="Copy callback details"
              >
                <span
                  className={`size-1.5 rounded-full ${
                    row.callback_confirmed ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                <span>
                  {callbackPhone ?? (row.callback_confirmed ? 'Callback confirmed' : 'No callback')}
                </span>
                <svg
                  className="size-3 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>

              <span className="font-mono text-[11px] text-slate-400">
                {receivedAt(row.created_at, row.call)}
              </span>
            </div>
          </div>

          {action && (
            <button
              type="button"
              onClick={() => void handleToggle(action.id, !action.done)}
              disabled={togglingId === action.id}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-55 ${
                done
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70'
                  : 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
              }`}
            >
              {done && (
                <svg
                  className="size-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {togglingId === action.id
                ? 'Saving…'
                : action.done
                  ? 'Reopen (d)'
                  : 'Mark done (d)'}
            </button>
          )}
        </div>

        {/* Highlighted Next Action Callout */}
        <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/55 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] font-semibold tracking-wider text-sky-700 uppercase">
                  Next Action
                </span>
                {action?.due && (
                  <span className="font-mono text-[10.5px] text-slate-500">
                    · due {dateTime(action.due)}
                  </span>
                )}
              </div>
              <p
                className={`mt-1 text-sm font-semibold ${
                  done ? 'text-slate-500 line-through decoration-slate-400' : 'text-slate-900'
                }`}
              >
                {action?.action ?? 'No action logged'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setNoteOpen((prev) => !prev)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              {noteOpen ? 'Cancel' : '+ Add note'}
            </button>
          </div>

          {row.actions.length > 1 && (
            <ul className="mt-2.5 space-y-1.5 border-t border-sky-200/60 pt-2.5">
              {row.actions.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-xs">
                  <label className="flex cursor-pointer items-start gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={togglingId === item.id}
                      onChange={() => void handleToggle(item.id, !item.done)}
                      className="mt-0.5 size-3.5 rounded accent-sky-600"
                    />
                    <span className={item.done ? 'text-slate-400 line-through' : ''}>
                      {item.action}
                    </span>
                  </label>
                  {item.due && (
                    <span className="shrink-0 font-mono text-[10px] text-slate-400">
                      {dateTime(item.due)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {noteOpen && (
            <form onSubmit={(e) => void handleFollowUpSubmit(e)} className="mt-3 flex gap-2">
              <input
                type="text"
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
                placeholder="Add follow-up action or manager note…"
                aria-label="Add follow-up action or note"
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingFollowUp || !followUpText.trim()}
                className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {addingFollowUp ? 'Saving…' : 'Save action'}
              </button>
            </form>
          )}
        </div>
      </header>

      {/* 3 Crisp Segmented Tabs */}
      <nav
        aria-label="Record sections"
        className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/70 px-5 sm:px-7"
        role="tablist"
      >
        {(
          [
            {
              id: 'overview',
              label: 'Overview',
              badge: combinedEvidence.length > 0 ? `${combinedEvidence.length}` : null,
            },
            {
              id: 'transcript',
              label: 'Transcript',
              badge: turns.length > 0 ? `${turns.length}` : null,
            },
            {
              id: 'dispatch',
              label: 'Dispatch & Precedents',
              badge:
                cogneeState.data && cogneeState.data.results.length > 0
                  ? `${cogneeState.data.results.length}`
                  : null,
            },
          ] as { id: WorkbenchTab; label: string; badge: string | null }[]
        ).map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-xs transition sm:px-4 sm:text-[13px] ${
                active
                  ? 'border-sky-600 font-semibold text-sky-700'
                  : 'border-transparent font-medium text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums ${
                    active ? 'bg-sky-100 text-sky-700' : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Tab Body */}
      <div className="lane-scroll flex-1 overflow-y-auto bg-slate-50/35 p-5 sm:p-7">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* 2-Column Structured Details Grid */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Structured Record
                </h3>
                <span className="font-mono text-[11px] text-slate-400">{row.id}</span>
              </div>

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Property
                  </dt>
                  <dd className="mt-1 flex items-baseline justify-between gap-2 text-sm text-slate-900">
                    <span className="font-semibold">{row.property || 'Not given'}</span>
                    {row.property && (
                      <button
                        type="button"
                        onClick={() => void copyValue(row.property!, 'Copied property address')}
                        className="shrink-0 font-mono text-[11px] font-medium text-sky-600 hover:text-sky-700"
                      >
                        Copy
                      </button>
                    )}
                  </dd>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Type & Priority
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {typeLabel(row.type)} · {priorityLabel(row.priority)}
                  </dd>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Caller
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {callerInitials || 'Not recorded'}
                  </dd>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Callback
                  </dt>
                  <dd className="mt-1 flex items-baseline justify-between gap-2 text-sm text-slate-900">
                    <span className="font-medium">
                      {row.callback_confirmed ? 'Confirmed' : 'Not confirmed'}
                      {callbackPhone ? ` · ${callbackPhone}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyValue(
                          callbackPhone ??
                            `${row.property || 'Property'} — Callback ${
                              row.callback_confirmed ? 'confirmed' : 'not confirmed'
                            } (${row.summary})`,
                          callbackPhone ? `Copied ${callbackPhone}` : 'Copied callback summary',
                        )
                      }
                      className="shrink-0 font-mono text-[11px] font-medium text-sky-600 hover:text-sky-700"
                    >
                      Copy
                    </button>
                  </dd>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Safety Check
                  </dt>
                  <dd className={`mt-1 text-sm ${safetyTone}`}>{row.safety_check || 'n/a'}</dd>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Received · Duration
                  </dt>
                  <dd className="mt-1 text-sm text-slate-800">
                    {receivedAt(row.created_at, row.call)} ·{' '}
                    <span className="font-mono text-xs text-slate-500">
                      {durationLabel(row.call?.duration_s)} ({sourceLabel(row.call?.source)})
                    </span>
                  </dd>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[var(--shadow-card)] sm:col-span-2">
                  <dt className="font-mono text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Issue Summary
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-800">
                    {row.issue || row.summary || 'Not given'}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Grok Triage Rationale */}
            {row.grok_reasoning && (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-sky-500" />
                  <p className="font-mono text-[10.5px] font-semibold tracking-wider text-sky-700 uppercase">
                    Grok Triage Rationale
                  </p>
                  {row.grok_model && (
                    <span className="font-mono text-[10.5px] text-slate-400">
                      · {row.grok_model}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{row.grok_reasoning}</p>
              </section>
            )}

            {/* Source Evidence */}
            {combinedEvidence.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    Source Evidence ({combinedEvidence.length})
                  </h3>
                  <span className="text-xs text-slate-400">
                    Click any quote to jump & highlight in Transcript
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {combinedEvidence.map((ev, idx) => {
                    const matchedTurnIdx = findMatchingTurnIndex(turns, ev.quote)
                    const speakerLabel =
                      matchedTurnIdx >= 0 ? turns[matchedTurnIdx]?.label : null
                    const isSelected =
                      activeEvidence?.quote === ev.quote && activeEvidence?.field === ev.field
                    return (
                      <button
                        key={`${ev.field}-${idx}`}
                        type="button"
                        onClick={() => handleJumpToEvidence(ev)}
                        aria-pressed={isSelected}
                        className={`group flex flex-col justify-between rounded-xl border p-4 text-left shadow-[var(--shadow-card)] transition ${
                          isSelected
                            ? 'border-sky-400 bg-sky-50/70 ring-1 ring-sky-200'
                            : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/30'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-sky-700 uppercase">
                            {evidenceFieldLabel(ev.field)}
                            {speakerLabel ? ` · ${speakerLabel}` : ''}
                          </span>
                          <span className="font-mono text-[11px] font-medium text-slate-400 group-hover:text-sky-600">
                            {matchedTurnIdx >= 0 ? `Turn #${matchedTurnIdx + 1} →` : 'View →'}
                          </span>
                        </div>
                        <p className="mt-2.5 text-[13px] leading-5 text-slate-800">
                          “{ev.quote}”
                        </p>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: TRANSCRIPT */}
        {activeTab === 'transcript' && (
          <div ref={transcriptTopRef} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-mono text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Call Transcript{' '}
                  {turns.length > 0
                    ? `(${turns.length} ${turns.length === 1 ? 'turn' : 'turns'})`
                    : ''}
                </h3>
              </div>
              {transcript && (
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={transcriptQuery}
                    onChange={(e) => setTranscriptQuery(e.target.value)}
                    placeholder="Find in transcript…"
                    aria-label="Search within transcript"
                    className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none sm:w-52"
                  />
                  <button
                    type="button"
                    onClick={() => void copyValue(transcript, 'Copied full transcript')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-slate-300 hover:text-slate-900"
                  >
                    Copy Transcript
                  </button>
                </div>
              )}
            </div>

            {activeEvidence && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-slate-800">
                <span>
                  Highlighting{' '}
                  <strong className="font-semibold text-slate-950">
                    {evidenceFieldLabel(activeEvidence.field)}
                  </strong>{' '}
                  evidence
                  {activeEvidence.turnIndex >= 0
                    ? ` in turn #${activeEvidence.turnIndex + 1}`
                    : ''}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className="font-medium text-sky-700 hover:text-sky-800"
                  >
                    ← Back to Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEvidence(null)}
                    className="font-mono text-[11px] text-slate-500 hover:text-slate-900"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {turns.length > 0 ? (
              <div className="space-y-3">
                {turns.map((turn, idx) => {
                  const isActiveTurn = activeEvidence?.turnIndex === idx
                  const activeQuoteForTurn =
                    activeEvidence &&
                    (activeEvidence.turnIndex === idx || activeEvidence.turnIndex < 0)
                      ? activeEvidence.quote
                      : null
                  const isAssistant = turn.speaker === 'assistant'
                  const isCaller = turn.speaker === 'caller'
                  return (
                    <div
                      key={`${idx}-${turn.speaker}`}
                      ref={(el) => {
                        turnRefs.current[idx] = el
                      }}
                      className={`rounded-2xl border p-4 transition-colors duration-200 ${
                        isActiveTurn
                          ? 'border-amber-300 bg-amber-50/60 ring-1 ring-amber-200'
                          : isAssistant
                            ? 'border-slate-200/80 bg-slate-100/70'
                            : isCaller
                              ? 'border-slate-200 bg-white shadow-[var(--shadow-card)]'
                              : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono text-[10.5px] font-semibold tracking-wider uppercase ${
                            isAssistant
                              ? 'text-sky-600'
                              : isCaller
                                ? 'text-slate-900'
                                : 'text-slate-500'
                          }`}
                        >
                          {isAssistant ? 'Morning Lane AI' : turn.label}
                        </span>
                        <span className="font-mono text-[10.5px] text-slate-400">#{idx + 1}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-800">
                        {renderHighlightedText(turn.text, transcriptQuery, activeQuoteForTurn)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-500">No transcript recorded on this call yet.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DISPATCH & PRECEDENTS */}
        {activeTab === 'dispatch' && (
          <div className="space-y-6">
            {/* Sub-card 1: Draft with Grok */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Draft with Grok</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Generate a grounded contractor dispatch, caller SMS, or team handover.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(draftEdited || activeDispatchResult) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditedByMode((prev) => {
                          const next = { ...prev }
                          delete next[dispatchMode]
                          return next
                        })
                        setDispatchByMode((prev) => {
                          const next = { ...prev }
                          delete next[dispatchMode]
                          return next
                        })
                        if (dispatchMode === defaultMode) {
                          setUseSavedDraftOnDefault(false)
                        }
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    >
                      Template
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDraftWithGrok()}
                    disabled={draftingMode !== null}
                    className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {draftingMode === dispatchMode ? 'Drafting with Grok…' : 'Draft with Grok'}
                  </button>
                </div>
              </div>

              {/* Segmented control */}
              <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { id: 'contractor', label: 'Contractor' },
                    { id: 'caller', label: 'Caller SMS' },
                    { id: 'handover', label: 'Handover' },
                  ] as { id: DispatchMode; label: string }[]
                ).map((tab) => {
                  const active = dispatchMode === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setDispatchMode(tab.id)
                        setDispatchError(null)
                      }}
                      className={`rounded-lg py-1.5 text-xs transition ${
                        active
                          ? 'bg-white font-semibold text-slate-900 shadow-xs'
                          : 'font-medium text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {dispatchError && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {dispatchError}
                </p>
              )}

              {activeDispatchResult && (
                <div className="mt-3 rounded-xl border border-sky-200/80 bg-sky-50/50 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-semibold tracking-wider text-sky-700 uppercase">
                      To: {activeDispatchResult.recipient_role}
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-500">
                      {activeDispatchResult.model} · {activeDispatchResult.latency_ms}ms
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-900">
                    {activeDispatchResult.subject}
                  </p>
                </div>
              )}

              <textarea
                value={draftText}
                onChange={(e) => {
                  const val = e.target.value
                  setEditedByMode((prev) => ({ ...prev, [dispatchMode]: val }))
                }}
                rows={7}
                aria-label="Editable dispatch or reply draft"
                className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 font-mono text-xs leading-6 text-slate-900 transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 focus:outline-none"
              />

              {activeDispatchResult && activeDispatchResult.checklist.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
                    Safety & Dispatch Checks
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {activeDispatchResult.checklist.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                        <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-sky-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeDispatchResult && activeDispatchResult.evidence_quotes.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
                    Grounded Dispatch Evidence
                  </p>
                  <div className="mt-2 space-y-2">
                    {activeDispatchResult.evidence_quotes.map((ev, idx) => (
                      <button
                        key={`${ev.field}-${idx}`}
                        type="button"
                        onClick={() => handleJumpToEvidence(ev)}
                        className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-sky-300"
                      >
                        <span className="text-slate-800">
                          <span className="font-mono text-[10px] font-semibold text-sky-700 uppercase">
                            {evidenceFieldLabel(ev.field)}:
                          </span>{' '}
                          “{ev.quote}”
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-sky-600">
                          Jump →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-slate-400">
                  {activeDispatchResult
                    ? 'Generated live by grok-dispatch'
                    : usingSavedTriageDraft
                      ? 'Prefilled from Grok triage draft'
                      : 'Prefilled from structured record'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const payload = activeDispatchResult?.subject
                      ? `Subject: ${activeDispatchResult.subject}\n\n${draftText}`
                      : draftText
                    void copyValue(payload, 'Copied dispatch draft to clipboard')
                  }}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-700"
                >
                  Copy message
                </button>
              </div>
            </section>

            {/* Sub-card 2: Similar Dwelly Cases (Cognee) */}
            <section
              aria-label="Similar Dwelly Cases"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Similar Dwelly Cases</h3>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-700">
                    Cognee Cloud
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {cogneeState.data?.dataset ?? 'morning_lane_dwelly'}
                    {cogneeState.data?.latency_ms ? ` · ${cogneeState.data.latency_ms}ms` : ''}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void handleLoadCognee(cogneeState.status === 'ready')}
                  disabled={cogneeState.status === 'loading'}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cogneeState.status === 'loading'
                    ? 'Searching Cognee…'
                    : cogneeState.status === 'ready'
                      ? 'Refresh'
                      : 'Find Dwelly precedents'}
                </button>
              </div>

              {cogneeState.status === 'loading' && !cogneeState.data && (
                <div className="grid gap-3 md:grid-cols-3" aria-live="polite">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                    >
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                      <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-12 w-full animate-pulse rounded bg-slate-200" />
                    </div>
                  ))}
                </div>
              )}

              {cogneeState.status === 'error' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
                  <span className="text-xs text-red-700">
                    {cogneeState.error ?? 'Could not fetch Dwelly precedents.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleLoadCognee(true)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-900 hover:border-slate-300"
                  >
                    Retry
                  </button>
                </div>
              )}

              {cogneeState.status === 'idle' && (
                <p className="text-xs text-slate-500">
                  Click <span className="font-semibold text-slate-800">Find Dwelly precedents</span>{' '}
                  to query Cognee Cloud across 50 historical Dwelly cases.
                </p>
              )}

              {cogneeState.status === 'ready' &&
                cogneeState.data &&
                (cogneeState.data.results.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {cogneeState.data.results.map((item) => {
                      const matchLabel =
                        item.similarity !== null
                          ? `${Math.round(item.similarity * 100)}% match`
                          : item.score !== null
                            ? `score ${item.score.toFixed(2)}`
                            : null
                      return (
                        <article
                          key={item.id}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 transition hover:border-slate-300 hover:bg-white"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10.5px] font-semibold tracking-wider text-sky-700 uppercase">
                                {item.case_id ?? 'dwelly'}
                              </span>
                              {matchLabel && (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                                  {matchLabel}
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs font-semibold text-slate-900">
                              {item.title ?? item.property ?? 'Dwelly case precedent'}
                            </p>
                            <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-600">
                              {item.excerpt}
                            </p>
                          </div>
                          {(item.outcome || item.property || item.status) && (
                            <p className="mt-3 border-t border-slate-200/80 pt-2 font-mono text-[10px] leading-4 text-slate-500">
                              {item.outcome
                                ? `Outcome: ${item.outcome}`
                                : [item.status, item.property].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No matching Dwelly precedents returned for this record.
                  </p>
                ))}
            </section>
          </div>
        )}
      </div>

      {/* Traceability Footer */}
      <footer className="border-t border-slate-200 bg-slate-50/70 px-5 py-2.5 font-mono text-[11px] text-slate-500 sm:px-7">
        Source: call {row.call?.id ?? row.call_id ?? 'unknown'} ·{' '}
        {dateTime(row.call?.started_at ?? row.created_at)} · {durationLabel(row.call?.duration_s)} ·
        source {sourceLabel(row.call?.source)}
      </footer>
    </main>
  )
}
