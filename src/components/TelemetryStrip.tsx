import { clockTime, isRecordDone } from '../lib/format'
import type { InboxFilter, InboxRecord, Kpi, RealtimeStatus } from '../types'

type Props = {
  rows: InboxRecord[]
  kpi: Kpi
  activeFilter: InboxFilter
  onFilter: (filter: InboxFilter) => void
  realtimeStatus: RealtimeStatus
  lastSyncedAt: string | null
  freshCount: number
  onRefresh: () => void
  onOpenShortcuts: () => void
}

export default function TelemetryStrip({
  rows,
  kpi,
  activeFilter,
  onFilter,
  realtimeStatus,
  lastSyncedAt,
  freshCount,
  onRefresh,
  onOpenShortcuts,
}: Props) {
  const needsActionCount = rows.filter((r) => !isRecordDone(r)).length
  const handledCount = rows.filter((r) => isRecordDone(r)).length

  const segments: {
    id: InboxFilter
    label: string
    value: string | number
    sub: string
    tone?: 'urgent' | 'accent' | 'done'
  }[] = [
    {
      id: 'urgent',
      label: 'Urgent open',
      value: kpi.urgent_open,
      sub: 'priority queue',
      tone: kpi.urgent_open > 0 ? 'urgent' : undefined,
    },
    {
      id: 'open',
      label: 'Needs action',
      value: needsActionCount,
      sub: 'open records',
      tone: 'accent',
    },
    {
      id: 'all',
      label: 'Total calls',
      value: kpi.calls,
      sub: `${kpi.out_of_hours_pct}% after hours`,
    },
    {
      id: 'done',
      label: 'Handled',
      value: handledCount,
      sub: `${kpi.hours_saved}h saved`,
      tone: 'done',
    },
  ]

  return (
    <div className="rise-in-delay flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center">
        {segments.map((seg) => {
          const active = activeFilter === seg.id
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onFilter(active && seg.id !== 'all' ? 'all' : seg.id)}
              className={`group flex items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition ${
                active && seg.id !== 'all'
                  ? 'border-sky-300 bg-sky-50/80 ring-1 ring-sky-200'
                  : active
                    ? 'border-slate-300 bg-white shadow-[var(--shadow-card)]'
                    : 'border-slate-200 bg-white/85 shadow-[var(--shadow-card)] hover:border-slate-300 hover:bg-white'
              }`}
              title={`Filter inbox by ${seg.label.toLowerCase()}`}
            >
              <span
                className={`font-mono text-lg font-semibold tabular-nums ${
                  seg.tone === 'urgent'
                    ? 'text-red-600'
                    : seg.tone === 'accent'
                      ? 'text-sky-600'
                      : seg.tone === 'done'
                        ? 'text-emerald-600'
                        : 'text-slate-900'
                }`}
              >
                {seg.value}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-semibold text-slate-900">{seg.label}</span>
                <span className="font-mono text-[10px] text-slate-500">{seg.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-600 shadow-[var(--shadow-card)]"
          title={`Realtime: ${realtimeStatus}`}
        >
          <span
            className={`inline-block size-2 rounded-full ${
              realtimeStatus === 'live'
                ? 'live-dot bg-emerald-500'
                : realtimeStatus === 'reconnecting' || realtimeStatus === 'connecting'
                  ? 'live-dot bg-amber-500'
                  : 'bg-red-500'
            }`}
          />
          <span className="font-medium text-slate-700">
            {realtimeStatus === 'live'
              ? 'Realtime'
              : realtimeStatus === 'connecting'
                ? 'Connecting'
                : realtimeStatus === 'reconnecting'
                  ? 'Syncing'
                  : 'Offline'}
          </span>
          {freshCount > 0 && (
            <span className="font-semibold text-sky-600">· +{freshCount} new</span>
          )}
          {lastSyncedAt && (
            <span className="hidden text-slate-400 sm:inline">· {clockTime(lastSyncedAt)}</span>
          )}
        </span>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-[var(--shadow-card)] transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          title="Refresh inbox"
        >
          <svg
            className="size-3.5 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          Refresh
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-[var(--shadow-card)] transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 sm:inline-flex"
          title="Keyboard shortcuts (?)"
        >
          <span>Keys</span>
          <span className="kbd-cap">?</span>
        </button>
      </div>
    </div>
  )
}
