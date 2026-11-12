import type { CallPhase } from '../lib/lineCall'
import { hoursMarker, priorityLabel, rowWhen, typeLabel } from '../lib/format'
import type { InboxFilter, InboxRecord, Kpi } from '../types'

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ooh', label: 'Out of hours' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'viewing', label: 'Viewings' },
  { id: 'dwelly', label: 'Dwelly sample' },
  { id: 'phone', label: 'Phone' },
]

function matches(row: InboxRecord, filter: InboxFilter): boolean {
  if (filter === 'ooh') return Boolean(row.call?.out_of_hours)
  if (filter === 'urgent') return row.priority === 'urgent'
  if (filter === 'maintenance') return row.type === 'maintenance'
  if (filter === 'viewing') return row.type === 'viewing'
  if (filter === 'dwelly') return row.call?.source === 'dwelly'
  if (filter === 'phone') return row.call?.source === 'phone'
  return true
}

function priorityTone(priority: string): string {
  if (priority === 'urgent') return 'bg-[var(--urgent)]'
  if (priority === 'today') return 'bg-[var(--amber)]'
  return 'bg-[var(--quiet)]'
}

function callLabel(phase: CallPhase): string {
  if (phase === 'connecting') return 'Connecting…'
  if (phase === 'live') return 'On the line · Hang up'
  if (phase === 'processing') return 'Processing…'
  return 'Call the line'
}

type Props = {
  rows: InboxRecord[]
  kpi: Kpi | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  freshCount: number
  highlight: Set<string>
  filter: InboxFilter
  onFilter: (filter: InboxFilter) => void
  onOpen: (id: string) => void
  phase: CallPhase
  callError: string | null
  callReady: boolean
  onCall: () => void
  onHangUp: () => void
}

export default function Inbox({
  rows,
  kpi,
  status,
  error,
  freshCount,
  highlight,
  filter,
  onFilter,
  onOpen,
  phase,
  callError,
  callReady,
  onCall,
  onHangUp,
}: Props) {
  const visible = rows.filter((row) => matches(row, filter))
  const onCallNow = phase === 'live' || phase === 'connecting'
  const calls = kpi?.calls ?? 0

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="rise-in border-b border-[var(--line)] pb-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.22em] text-[var(--lane)] uppercase">
              Morning Lane
            </p>
            <h1 className="font-display mt-2 text-5xl leading-none font-semibold tracking-tight text-[var(--ink)] sm:text-6xl">
              Line
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--quiet)]">
              {kpi
                ? `${calls} ${calls === 1 ? 'call' : 'calls'} logged · ${kpi.out_of_hours_pct ?? 0}% out of hours`
                : 'After-hours lettings line for the Morning Lane branch.'}
            </p>
          </div>

          <div className="rise-in-delay flex flex-col items-stretch gap-3 sm:items-end">
            <p className="flex items-center gap-2 text-sm text-[var(--quiet)]">
              <span className="live-dot inline-block size-2 rounded-[2px] bg-[var(--lane)]" />
              Live · {freshCount} new since open
            </p>
            {onCallNow ? (
              <button
                type="button"
                onClick={onHangUp}
                className={`call-live bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-[var(--fog)] transition hover:bg-[var(--lane-deep)] ${
                  phase === 'live' ? '' : ''
                }`}
              >
                {callLabel(phase)}
              </button>
            ) : (
              <button
                type="button"
                onClick={onCall}
                disabled={!callReady || phase === 'processing'}
                className="bg-[var(--lane)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--lane-deep)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {callLabel(phase)}
              </button>
            )}
          </div>
        </div>

        {(phase === 'processing' || callError || !callReady) && (
          <div className="mt-5 space-y-2">
            {phase === 'processing' && (
              <p className="border border-[var(--lane)]/25 bg-[var(--wash)]/70 px-3 py-2 text-sm text-[var(--ink)]">
                Processing the call. It should land in the inbox within half a minute.
              </p>
            )}
            {callError && (
              <p className="border border-[var(--urgent)]/25 bg-white/60 px-3 py-2 text-sm text-[var(--urgent)]">
                {callError}
              </p>
            )}
            {!callReady && (
              <p className="text-sm text-[var(--quiet)]">
                The voice line is not configured in this build (`VITE_VAPI_PUBLIC_KEY` /
                `VITE_VAPI_ASSISTANT_ID`).
              </p>
            )}
          </div>
        )}
      </header>

      <nav className="rise-in-delay mt-6 flex gap-1 overflow-x-auto border-b border-[var(--line)] pb-px" aria-label="Inbox filters">
        {FILTERS.map((item) => {
          const active = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilter(item.id)}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
                  : 'border-transparent text-[var(--quiet)] hover:text-[var(--ink)]'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {status === 'loading' && (
        <div className="mt-12 space-y-4" aria-live="polite">
          <p className="text-sm text-[var(--quiet)]">Loading the inbox…</p>
          <div className="h-px w-full origin-left animate-pulse bg-[var(--line)]" />
          <div className="h-px w-4/5 origin-left animate-pulse bg-[var(--line)]" />
          <div className="h-px w-3/5 origin-left animate-pulse bg-[var(--line)]" />
        </div>
      )}

      {status === 'error' && (
        <div className="mt-12 border border-[var(--urgent)]/20 bg-white/55 px-4 py-5">
          <p className="font-display text-xl font-semibold text-[var(--ink)]">Could not load inbox</p>
          <p className="mt-2 text-sm text-[var(--urgent)]">{error}</p>
        </div>
      )}

      {status === 'ready' && visible.length === 0 && (
        <div className="mt-14 text-center">
          <p className="font-display text-3xl font-semibold text-[var(--ink)]">
            {rows.length === 0 ? 'Quiet on the line' : 'Nothing in this view'}
          </p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--quiet)]">
            {rows.length === 0
              ? 'Call the line. Logged cases appear here with a priority, a property, and the next action.'
              : 'Try All to see every record, or clear the filter after a new call lands.'}
          </p>
          {rows.length === 0 && callReady && phase === 'idle' && (
            <button
              type="button"
              onClick={onCall}
              className="mt-6 bg-[var(--lane)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--lane-deep)]"
            >
              Call the line
            </button>
          )}
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--line)] border-b border-[var(--line)]">
          {visible.map((row) => {
            const stamp = rowWhen(row.call?.started_at ?? row.created_at)
            const marker = hoursMarker(row.call)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className={`group flex w-full items-start gap-3 px-1 py-4 text-left transition hover:bg-white/45 ${
                    highlight.has(row.id) ? 'row-fresh' : ''
                  }`}
                >
                  <span
                    className={`mt-2 size-2.5 shrink-0 rounded-[2px] ${priorityTone(row.priority)}`}
                    title={priorityLabel(row.priority)}
                  />
                  <span className="w-[4.25rem] shrink-0 text-sm text-[var(--quiet)]">
                    <span className="block font-medium text-[var(--ink)] tabular-nums">{stamp.time}</span>
                    {stamp.when}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--lane)] uppercase">
                        {typeLabel(row.type)}
                      </span>
                      {row.property && (
                        <span className="truncate text-sm text-[var(--quiet)]">{row.property}</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[15px] leading-6 text-[var(--ink)] group-hover:text-[var(--lane-deep)]">
                      {row.summary}
                    </span>
                  </span>
                  {marker && (
                    <span className="shrink-0 pt-0.5 text-sm font-medium text-[var(--lane)]">{marker}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
