import { useMemo, useState, type FormEvent } from 'react'
import {
  buildDispatchDraft,
  dateTime,
  durationLabel,
  extractCallbackPhone,
  hoursMarker,
  isRecordDone,
  parseTranscript,
  primaryAction,
  priorityLabel,
  receivedAt,
  sourceLabel,
  typeLabel,
} from '../lib/format'
import type { DispatchMode, InboxRecord, Priority } from '../types'

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

function highlightMatches(text: string, query: string) {
  const q = query.trim()
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

type Props = {
  row: InboxRecord | null
  loading: boolean
  hasRows: boolean
  onBackMobile: () => void
  onToggleAction: (actionId: string, nextDone: boolean) => Promise<void>
  onAddFollowUp: (recordId: string, text: string, priority: Priority) => Promise<boolean>
  onUpdatePriority: (recordId: string, priority: Priority) => Promise<void>
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
  const [customDraft, setCustomDraft] = useState<string | null>(null)

  const draftText =
    customDraft !== null ? customDraft : row ? buildDispatchDraft(row, dispatchMode) : ''
  const draftEdited = customDraft !== null

  const action = row ? primaryAction(row.actions) : null
  const done = row ? isRecordDone(row) : false
  const transcript = row?.call?.transcript?.trim() ?? ''
  const turns = useMemo(() => parseTranscript(transcript), [transcript])
  const callbackPhone = useMemo(() => extractCallbackPhone(transcript), [transcript])
  const marker = row ? hoursMarker(row.call) : null

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
            : 'Choose a call from the left queue (or press j / k) to inspect its transcript, action checklist, and dispatch draft.'}
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

      {/* Structured Extraction Dossier */}
      <section className="border-b border-[var(--line)] bg-white/55 px-5 py-5 sm:px-7">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--quiet)] uppercase">
            Structured Record
          </h3>
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
      </section>

      {/* Split Lower Workbench: Transcript + One-Click Dispatch */}
      <div className="grid min-w-0 flex-1 divide-y divide-[var(--line)] xl:grid-cols-12 xl:divide-x xl:divide-y-0">
        {/* Transcript Viewer */}
        <section className="flex min-w-0 flex-col px-5 py-5 sm:px-7 xl:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--quiet)] uppercase">
              Call Transcript {turns.length > 0 ? `(${turns.length} ${turns.length === 1 ? 'turn' : 'turns'})` : ''}
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

          {turns.length > 0 ? (
            <div className="space-y-3">
              {turns.map((turn, idx) => (
                <div
                  key={`${idx}-${turn.speaker}`}
                  className={`border-l-2 py-1 pl-3.5 ${
                    turn.speaker === 'assistant'
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
                    {highlightMatches(turn.text, transcriptQuery)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--quiet)]">No transcript recorded on this call yet.</p>
          )}
        </section>

        {/* One-Click Dispatch / Reply Draft */}
        <section className="flex min-w-0 flex-col bg-[var(--paper)] px-5 py-5 sm:px-6 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--quiet)] uppercase">
              One-Click Dispatch Draft
            </h3>
            {draftEdited && (
              <button
                type="button"
                onClick={() => {
                  setCustomDraft(null)
                }}
                className="font-mono text-[11px] text-[var(--quiet)] hover:text-[var(--ink)]"
              >
                Reset
              </button>
            )}
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
                    setCustomDraft(null)
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

          <textarea
            value={draftText}
            onChange={(e) => {
              setCustomDraft(e.target.value)
            }}
            rows={8}
            aria-label="Editable dispatch or reply draft"
            className="mt-3 w-full flex-1 resize-y border border-[var(--line-strong)] bg-white/85 p-3 font-mono text-xs leading-5 text-[var(--ink)] focus:border-[var(--lane)] focus:bg-white focus:outline-none"
          />

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-[var(--quiet)]">
              Prefilled from structured record
            </span>
            <button
              type="button"
              onClick={() => void copyValue(draftText, 'Copied dispatch draft to clipboard')}
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
