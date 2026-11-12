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

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
            Line Inbox · Morning Lane branch
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {kpi
              ? `${kpi.calls ?? 0} ${(kpi.calls ?? 0) === 1 ? 'call' : 'calls'} · ${kpi.out_of_hours_pct ?? 0}% out of hours`
              : 'London lettings · after-hours line'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-[var(--muted)]">
            <span className="mr-1 inline-block size-2 rounded-full bg-[var(--accent)] align-middle" />
            Live · {freshCount} new since you opened
          </p>
          {onCallNow ? (
            <button
              type="button"
              onClick={onHangUp}
              className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white"
            >
              {phase === 'connecting' ? 'Connecting…' : 'Live · on a call'} · Hang up
            </button>
          ) : (
            <button
              type="button"
              onClick={onCall}
              disabled={!callReady || phase === 'processing'}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Call the line
            </button>
          )}
        </div>
      </header>

      {phase === 'processing' && (
        <p className="mt-4 rounded-lg bg-[#f6e4dc] px-3 py-2 text-sm text-[var(--ink)]">
          Processing the call. It should land in the inbox within half a minute.
        </p>
      )}
      {callError && (
        <p className="mt-4 rounded-lg bg-[#f6e4dc] px-3 py-2 text-sm text-[var(--accent)]">{callError}</p>
      )}
      {!callReady && (
        <p className="mt-4 text-sm text-[var(--muted)]">
          The voice line is not configured in this build.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilter(item.id)}
            className={
              filter === item.id
                ? 'rounded-full bg-[var(--ink)] px-3 py-1 text-sm text-white'
                : 'rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-[var(--ink)]'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="mt-10 text-sm text-[var(--muted)]">Loading the inbox…</p>}
      {status === 'error' && <p className="mt-10 text-sm text-[var(--accent)]">{error}</p>}

      {status === 'ready' && visible.length === 0 && (
        <div className="mt-10 rounded-xl border border-dashed border-black/15 bg-white/70 px-5 py-10 text-center">
          <p className="font-medium text-[var(--ink)]">
            {rows.length === 0 ? 'Nothing in the inbox yet.' : 'Nothing matches this filter.'}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {rows.length === 0
              ? 'Call the line. Logged cases show up here with a priority, a property, and the next action.'
              : 'Try All to see every record.'}
          </p>
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <ul className="mt-4 divide-y divide-black/10 border-y border-black/10">
          {visible.map((row) => {
            const stamp = rowWhen(row.call?.started_at ?? row.created_at)
            const marker = hoursMarker(row.call)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className={`flex w-full items-start gap-3 px-1 py-3 text-left hover:bg-white/80 ${
                    highlight.has(row.id) ? 'row-fresh' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                      row.priority === 'urgent'
                        ? 'bg-[var(--accent)]'
                        : row.priority === 'today'
                          ? 'bg-[var(--amber)]'
                          : 'bg-[var(--grey)]'
                    }`}
                    title={priorityLabel(row.priority)}
                  />
                  <span className="w-16 shrink-0 text-sm text-[var(--muted)]">
                    <span className="block font-medium text-[var(--ink)]">{stamp.time}</span>
                    {stamp.when}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tracking-wide text-[var(--ink)] uppercase">
                        {typeLabel(row.type)}
                      </span>
                      {row.property && (
                        <span className="truncate text-sm text-[var(--muted)]">{row.property}</span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--ink)]">{row.summary}</span>
                  </span>
                  {marker && (
                    <span className="shrink-0 text-sm font-medium text-[var(--accent)]">{marker}</span>
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
