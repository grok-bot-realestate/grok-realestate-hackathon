import { useMemo, useRef, useState, type FormEvent } from 'react'
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
  DispatchMode,
  EvidenceQuote,
  GrokDispatchResult,
  InboxRecord,
  Priority,
} from '../types'

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

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
            className="bg-[#f4d57b]/75 px-1 py-0.5 font-medium text-[var(--ink)] underline decoration-[var(--amber)] decoration-2 underline-offset-2"
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
          <mark key={`sq-${idx}-${subIdx}`} className="bg-[var(--wash)] px-0.5 text-[var(--ink)]">
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
      <mark key={idx} className="bg-[var(--wash)] px-0.5 text-[var(--ink)]">
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

  const transcriptSectionRef = useRef<HTMLElement | null>(null)
  const turnRefs = useRef<Array<HTMLDivElement | null>>([])

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
    if (ok) setFollowUpText('')
  }

  function handleJumpToEvidence(ev: EvidenceQuote) {
    if (activeEvidence && activeEvidence.quote === ev.quote && activeEvidence.field === ev.field) {
      setActiveEvidence(null)
      return
    }
    const turnIndex = findMatchingTurnIndex(turns, ev.quote)
    setActiveEvidence({ field: ev.field, quote: ev.quote, turnIndex })
    window.requestAnimationFrame(() => {
      if (turnIndex >= 0 && turnRefs.current[turnIndex]) {
        turnRefs.current[turnIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        transcriptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
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
      <main className="flex min-h-[420px] flex-col items-center justify-center bg-white/35 px-6 py-16 text-center backdrop-blur-sm lg:h-[calc(100vh-14.5rem)]">
        <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--lane)] uppercase">
          Morning Lane · Dossier Workbench
        </p>
        <p className="font-display mt-2 text-3xl font-semibold text-[var(--ink)]">
          {loading ? 'Loading records…' : hasRows ? 'Select a record to inspect' : 'Inbox is clear'}
        </p>
        <p className="mt-2 max-w-sm text-sm text-[var(--quiet)]">
          {loading
            ? 'Fetching calls, structured records, and manager actions from Supabase.'
            : 'Choose a call from the left queue (or press j / k) to inspect its transcript, Grok evidence, and dispatch draft.'}
        </p>
      </main>
    )
  }

  const safetyTone =
    row.safety_check === 'asked, concern'
      ? 'text-[var(--urgent)] font-medium'
      : row.safety_check === 'asked, clear'
        ? 'text-[var(--lane)] font-medium'
        : 'text-[var(--ink)]'

  const provenanceLabel =
    row.triage_source === 'grok'
      ? 'Triaged by Grok'
      : row.triage_source === 'fallback'
        ? 'Fallback triage'
        : row.triage_source === 'empty'
          ? 'No caller speech'
          : 'Standard intake'

  return (
    <main className="lane-scroll flex min-w-0 flex-col bg-white/45 backdrop-blur-sm lg:h-[calc(100vh-14.5rem)] lg:min-h-[540px] lg:overflow-y-auto">
      {/* Mobile back bar */}
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={onBackMobile}
          className="font-mono text-xs font-medium text-[var(--ink)] transition hover:text-[var(--lane)]"
        >
          ← Back to Inbox
        </button>
        <span className="font-mono text-[11px] text-[var(--quiet)]">{row.id}</span>
      </div>

      {/* Interactive Action Banner */}
      <section className="bg-[var(--ink)] px-5 py-6 text-[var(--fog)] sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-white/60 uppercase">
              Morning Lane · Next Action
            </span>
            {marker && (
              <span className="border border-white/20 px-2 py-0.5 font-mono text-[10px] text-[#6ce0b8] uppercase">
                {marker}
              </span>
            )}
          </div>

          {/* Priority Switcher + Primary Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex border border-white/20 bg-white/5"
              role="group"
              aria-label="Set record priority"
            >
              {PRIORITIES.map((item) => {
                const active = row.priority === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={updatingPriority}
                    onClick={() => void handlePriority(item.id)}
                    className={`px-2.5 py-1 font-mono text-[11px] transition ${
                      active
                        ? item.id === 'urgent'
                          ? 'bg-[var(--urgent)] font-medium text-white'
                          : item.id === 'today'
                            ? 'bg-[var(--amber)] font-medium text-white'
                            : 'bg-white font-medium text-[var(--ink)]'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>

            {action && (
              <button
                type="button"
                onClick={() => void handleToggle(action.id, !action.done)}
                disabled={togglingId === action.id}
                className={`px-4 py-1.5 text-xs font-medium transition disabled:opacity-55 ${
                  done
                    ? 'border border-white/30 bg-transparent text-white hover:bg-white/10'
                    : 'bg-[var(--fog)] text-[var(--ink)] hover:bg-white'
                }`}
              >
                {togglingId === action.id
                  ? 'Saving…'
                  : action.done
                    ? 'Reopen (d)'
                    : 'Mark done (d)'}
              </button>
            )}
          </div>
        </div>

        <h2
          className={`font-display mt-3 text-2xl leading-snug font-semibold sm:text-3xl ${
            done ? 'text-white/70 line-through decoration-white/35' : 'text-white'
          }`}
        >
          {action?.action ?? 'No action logged'}
        </h2>

        <p className="mt-2 font-mono text-xs text-white/70">
          {priorityLabel(row.priority)} · {typeLabel(row.type)} · {row.issue || 'No issue noted'}
          {action?.due ? ` · due ${dateTime(action.due)}` : ''}
        </p>

        {/* Action checklist & inline follow-up */}
        <div className="mt-4 border-t border-white/12 pt-3.5">
          {row.actions.length > 0 && (
            <ul className="space-y-1.5">
              {row.actions.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-xs">
                  <label className="flex cursor-pointer items-start gap-2.5 text-white/90">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={togglingId === item.id}
                      onChange={() => void handleToggle(item.id, !item.done)}
                      className="mt-0.5 size-3.5 accent-[#6ce0b8]"
                    />
                    <span className={item.done ? 'text-white/50 line-through' : ''}>
                      {item.action}
                    </span>
                  </label>
                  {item.due && (
                    <span className="shrink-0 font-mono text-[10px] text-white/50">
                      {dateTime(item.due)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => void handleFollowUpSubmit(e)} className="mt-3 flex gap-2">
            <input
              type="text"
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              placeholder="Add follow-up action or manager note…"
              aria-label="Add follow-up action or note"
              className="min-w-0 flex-1 border border-white/20 bg-white/8 px-3 py-1.5 text-xs text-white placeholder:text-white/45 focus:border-[#6ce0b8] focus:bg-white/12 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingFollowUp || !followUpText.trim()}
              className="shrink-0 border border-white/25 bg-white/12 px-3 py-1.5 font-mono text-[11px] font-medium text-white transition hover:bg-white/22 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {addingFollowUp ? 'Adding…' : '+ Add action'}
            </button>
          </form>
        </div>
      </section>

      {/* Structured Extraction Dossier & Grok Traceability */}
      <section className="border-b border-[var(--line)] bg-white/55 px-5 py-5 sm:px-7">
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--quiet)] uppercase">
              Structured Record
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${
                row.triage_source === 'grok'
                  ? 'font-medium text-[var(--lane)]'
                  : row.triage_source === 'fallback'
                    ? 'text-[var(--amber)]'
                    : 'text-[var(--quiet)]'
              }`}
              data-testid="grok-provenance"
            >
              <span
                className={`inline-block size-1.5 rounded-[1px] ${
                  row.triage_source === 'grok'
                    ? 'bg-[var(--lane)]'
                    : row.triage_source === 'fallback'
                      ? 'bg-[var(--amber)]'
                      : 'bg-[var(--quiet)]/50'
                }`}
              />
              <span>{provenanceLabel}</span>
              {row.triage_source === 'grok' && row.grok_model && (
                <span className="font-normal text-[var(--quiet)]">· {row.grok_model}</span>
              )}
              {row.triage_source === 'grok' && row.grok_latency_ms != null && (
                <span className="font-normal text-[var(--quiet)]">
                  · {row.grok_latency_ms}ms
                </span>
              )}
            </span>
          </div>
          <span className="truncate font-mono text-[11px] text-[var(--quiet)]">{row.id}</span>
        </div>

        <dl className="grid grid-cols-1 border-t border-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
          <div className="border-b border-[var(--line)] py-3 sm:pr-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Property
            </dt>
            <dd className="mt-1 flex items-baseline justify-between gap-2 text-sm text-[var(--ink)]">
              <span className="font-medium">{row.property || 'Not given'}</span>
              {row.property && (
                <button
                  type="button"
                  onClick={() => void copyValue(row.property!, 'Copied property address')}
                  className="shrink-0 font-mono text-[10px] text-[var(--lane)] hover:text-[var(--lane-deep)]"
                >
                  Copy
                </button>
              )}
            </dd>
          </div>

          <div className="border-b border-[var(--line)] py-3 sm:px-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Caller
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">
              {row.call?.caller_initials?.trim() || 'Not recorded'}
            </dd>
          </div>

          <div className="border-b border-[var(--line)] py-3 sm:pr-4 xl:px-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Callback
            </dt>
            <dd className="mt-1 flex items-baseline justify-between gap-2 text-sm text-[var(--ink)]">
              <span>
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
                className="shrink-0 font-mono text-[10px] text-[var(--lane)] hover:text-[var(--lane-deep)]"
              >
                Copy
              </button>
            </dd>
          </div>

          <div className="border-b border-[var(--line)] py-3 sm:pl-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Type & Priority
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">
              {typeLabel(row.type)} · {priorityLabel(row.priority)}
            </dd>
          </div>

          <div className="border-b border-[var(--line)] py-3 sm:border-b-0 sm:pr-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Safety check
            </dt>
            <dd className={`mt-1 text-sm ${safetyTone}`}>{row.safety_check || 'n/a'}</dd>
          </div>

          <div className="border-b border-[var(--line)] py-3 sm:border-b-0 sm:px-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Issue
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">{row.issue || 'Not given'}</dd>
          </div>

          <div className="border-b border-[var(--line)] py-3 sm:border-b-0 sm:pr-4 xl:px-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Received
            </dt>
            <dd className="mt-1 text-sm text-[var(--ink)]">{receivedAt(row.created_at, row.call)}</dd>
          </div>

          <div className="py-3 sm:pl-4">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-[var(--quiet)] uppercase">
              Duration · Source
            </dt>
            <dd className="mt-1 font-mono text-xs text-[var(--ink)]">
              {durationLabel(row.call?.duration_s)} · {sourceLabel(row.call?.source)}
            </dd>
          </div>
        </dl>

        {/* Grok Triage Rationale + Verbatim Source Evidence */}
        {(row.grok_reasoning || combinedEvidence.length > 0) && (
          <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
            {row.grok_reasoning && (
              <div className="border-l-2 border-[var(--lane)] bg-white/75 px-3.5 py-2.5">
                <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-[var(--lane)] uppercase">
                  Grok Triage Rationale
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                  {row.grok_reasoning}
                </p>
              </div>
            )}

            {combinedEvidence.length > 0 && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-[var(--quiet)] uppercase">
                    Source Evidence ({combinedEvidence.length})
                  </p>
                  <span className="font-mono text-[10px] text-[var(--quiet)]">
                    Click any quote to jump & highlight in transcript
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
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
                        className={`group flex flex-col justify-between border px-3 py-2 text-left transition ${
                          isSelected
                            ? 'border-[var(--lane)] bg-[#e2efe7]'
                            : 'border-[var(--line)] bg-white/80 hover:border-[var(--ink)] hover:bg-white'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-[var(--lane)] uppercase">
                            {evidenceFieldLabel(ev.field)}
                            {speakerLabel ? ` · ${speakerLabel}` : ''}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--quiet)] group-hover:text-[var(--ink)]">
                            {isSelected
                              ? 'Highlighted'
                              : matchedTurnIdx >= 0
                                ? `Turn #${matchedTurnIdx + 1} →`
                                : 'Find →'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink)]">“{ev.quote}”</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Split Lower Workbench: Transcript + Live Grok Dispatch */}
      <div className="grid min-w-0 flex-1 divide-y divide-[var(--line)] xl:grid-cols-12 xl:divide-x xl:divide-y-0">
        {/* Transcript Viewer */}
        <section
          ref={transcriptSectionRef}
          className="flex min-w-0 flex-col px-5 py-5 sm:px-7 xl:col-span-7"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--quiet)] uppercase">
              Call Transcript{' '}
              {turns.length > 0
                ? `(${turns.length} ${turns.length === 1 ? 'turn' : 'turns'})`
                : ''}
            </h3>
            {transcript && (
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={transcriptQuery}
                  onChange={(e) => setTranscriptQuery(e.target.value)}
                  placeholder="Find in transcript…"
                  aria-label="Search within transcript"
                  className="w-36 border border-[var(--line-strong)] bg-white/80 px-2 py-1 text-xs text-[var(--ink)] placeholder:text-[var(--quiet)]/75 focus:border-[var(--lane)] focus:bg-white focus:outline-none sm:w-44"
                />
                <button
                  type="button"
                  onClick={() => void copyValue(transcript, 'Copied full transcript')}
                  className="border border-[var(--line-strong)] bg-white/75 px-2.5 py-1 font-mono text-[11px] text-[var(--ink)] transition hover:border-[var(--ink)] hover:bg-white"
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          {activeEvidence && (
            <div className="mb-3 flex items-center justify-between gap-2 border border-[var(--lane)]/35 bg-[#e2efe7] px-3 py-1.5 font-mono text-[11px] text-[var(--ink)]">
              <span>
                Highlighting{' '}
                <strong className="font-medium text-[var(--lane-deep)]">
                  {evidenceFieldLabel(activeEvidence.field)}
                </strong>{' '}
                evidence
                {activeEvidence.turnIndex >= 0 ? ` in turn #${activeEvidence.turnIndex + 1}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setActiveEvidence(null)}
                className="text-[10px] text-[var(--quiet)] hover:text-[var(--ink)]"
              >
                Clear
              </button>
            </div>
          )}

          {turns.length > 0 ? (
            <div className="space-y-3">
              {turns.map((turn, idx) => {
                const isActiveTurn = activeEvidence?.turnIndex === idx
                const activeQuoteForTurn =
                  activeEvidence && (activeEvidence.turnIndex === idx || activeEvidence.turnIndex < 0)
                    ? activeEvidence.quote
                    : null
                return (
                  <div
                    key={`${idx}-${turn.speaker}`}
                    ref={(el) => {
                      turnRefs.current[idx] = el
                    }}
                    className={`border-l-2 py-1 pl-3.5 transition-colors duration-300 ${
                      isActiveTurn
                        ? 'border-l-[3px] border-[var(--lane)] bg-[#dcebe2] py-2 pr-3'
                        : turn.speaker === 'assistant'
                          ? 'border-[var(--lane)]/55'
                          : turn.speaker === 'caller'
                            ? 'border-[var(--amber)]/65 bg-white/55 py-2 pr-3'
                            : 'border-[var(--line-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-[10px] font-medium tracking-[0.14em] uppercase ${
                          turn.speaker === 'assistant'
                            ? 'text-[var(--lane)]'
                            : turn.speaker === 'caller'
                              ? 'text-[var(--amber)]'
                              : 'text-[var(--quiet)]'
                        }`}
                      >
                        {turn.label}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--quiet)]/65">
                        #{idx + 1}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--ink)]">
                      {renderHighlightedText(turn.text, transcriptQuery, activeQuoteForTurn)}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--quiet)]">No transcript recorded on this call yet.</p>
          )}
        </section>

        {/* One-Click Grok Dispatch / Reply Panel */}
        <section className="flex min-w-0 flex-col bg-[var(--paper)] px-5 py-5 sm:px-6 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--quiet)] uppercase">
              Dispatch & Reply
            </h3>
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
                  className="font-mono text-[11px] text-[var(--quiet)] hover:text-[var(--ink)]"
                >
                  Template
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDraftWithGrok()}
                disabled={draftingMode !== null}
                className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1 font-mono text-[11px] font-medium text-white transition hover:bg-[var(--lane-deep)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {draftingMode === dispatchMode ? 'Drafting with Grok…' : 'Draft with Grok'}
              </button>
            </div>
          </div>

          <div className="mt-3 flex border border-[var(--line-strong)] bg-white/60">
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
                  className={`flex-1 py-1.5 font-mono text-[11px] transition ${
                    active
                      ? 'bg-[var(--ink)] font-medium text-white'
                      : 'text-[var(--quiet)] hover:text-[var(--ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {dispatchError && (
            <p className="mt-3 border border-[var(--urgent)]/30 bg-white/85 px-3 py-2 text-xs text-[var(--urgent)]">
              {dispatchError}
            </p>
          )}

          {activeDispatchResult && (
            <div className="mt-3 border border-[var(--line)] bg-white/80 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--lane)] uppercase">
                  To: {activeDispatchResult.recipient_role}
                </span>
                <span className="font-mono text-[10px] text-[var(--quiet)]">
                  {activeDispatchResult.model} · {activeDispatchResult.latency_ms}ms
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-[var(--ink)]">
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
            rows={8}
            aria-label="Editable dispatch or reply draft"
            className="mt-3 w-full flex-1 resize-y border border-[var(--line-strong)] bg-white/85 p-3 font-mono text-xs leading-5 text-[var(--ink)] focus:border-[var(--lane)] focus:bg-white focus:outline-none"
          />

          {activeDispatchResult && activeDispatchResult.checklist.length > 0 && (
            <div className="mt-3 border border-[var(--line)] bg-white/70 px-3 py-2.5">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-[var(--quiet)] uppercase">
                Safety & Dispatch Checks
              </p>
              <ul className="mt-1.5 space-y-1">
                {activeDispatchResult.checklist.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs leading-5 text-[var(--ink)]">
                    <span className="mt-1.5 inline-block size-1 shrink-0 bg-[var(--lane)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeDispatchResult && activeDispatchResult.evidence_quotes.length > 0 && (
            <div className="mt-3 border border-[var(--line)] bg-white/70 px-3 py-2.5">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-[var(--quiet)] uppercase">
                Grounded Dispatch Evidence
              </p>
              <div className="mt-1.5 space-y-1.5">
                {activeDispatchResult.evidence_quotes.map((ev, idx) => (
                  <button
                    key={`${ev.field}-${idx}`}
                    type="button"
                    onClick={() => handleJumpToEvidence(ev)}
                    className="flex w-full items-start justify-between gap-2 border border-[var(--line)] bg-white/85 px-2.5 py-1.5 text-left text-xs transition hover:border-[var(--lane)]"
                  >
                    <span className="text-[var(--ink)]">
                      <span className="font-mono text-[10px] font-medium text-[var(--lane)] uppercase">
                        {evidenceFieldLabel(ev.field)}:
                      </span>{' '}
                      “{ev.quote}”
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--quiet)]">
                      Jump →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-[var(--quiet)]">
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
              className="bg-[var(--lane)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--lane-deep)]"
            >
              Copy message
            </button>
          </div>
        </section>
      </div>

      {/* Traceability Footer */}
      <footer className="border-t border-[var(--line)] bg-[var(--paper)] px-5 py-3 font-mono text-[11px] text-[var(--quiet)] sm:px-7">
        Source: call {row.call?.id ?? row.call_id ?? 'unknown'} ·{' '}
        {dateTime(row.call?.started_at ?? row.created_at)} · {durationLabel(row.call?.duration_s)} ·
        source {sourceLabel(row.call?.source)}
      </footer>
    </main>
  )
}
