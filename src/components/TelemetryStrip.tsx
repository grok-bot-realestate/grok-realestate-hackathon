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
    tone?: 'urgent' | 'lane'
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
      tone: 'lane',
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
    },
  ]

  return (
    <div className="rise-in-delay mt-4 flex flex-col justify-between border-y border-[var(--line)] bg-[var(--paper)] backdrop-blur-sm md:flex-row md:items-stretch">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap">
        {segments.map((seg, idx) => {
          const active = activeFilter === seg.id
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onFilter(active && seg.id !== 'all' ? 'all' : seg.id)}
              className={`group flex items-baseline gap-2.5 border-b-2 px-3.5 py-2.5 text-left transition sm:border-r sm:border-r-[var(--line)] sm:px-4 ${
                idx % 2 === 0 ? 'border-r border-r-[var(--line)]' : ''
              } ${idx < 2 ? 'border-b border-b-[var(--line)] sm:border-b-2' : ''} ${
                active && seg.id !== 'all'
                  ? 'border-b-[var(--lane)] bg-white/85'
                  : active
                    ? 'border-b-[var(--ink)]/30 bg-white/70'
                    : 'border-b-transparent hover:bg-white/55'
              }`}
              title={`Filter inbox by ${seg.label.toLowerCase()}`}
            >
              <span
                className={`font-mono text-lg font-medium tabular-nums ${
                  seg.tone === 'urgent'
                    ? 'text-[var(--urgent)]'
                    : seg.tone === 'lane'
                      ? 'text-[var(--lane)]'
                      : 'text-[var(--ink)]'
                }`}
              >
                {seg.value}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-medium text-[var(--ink)]">
                  {seg.label}
                </span>
                <span className="font-mono text-[10px] text-[var(--quiet)]">{seg.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 px-3.5 py-2 font-mono text-[11px] text-[var(--quiet)] sm:px-4">
        <span className="inline-flex items-center gap-1.5" title={`Realtime: ${realtimeStatus}`}>
          <span
            className={`inline-block size-2 rounded-[2px] ${
              realtimeStatus === 'live'
                ? 'live-dot bg-[var(--lane)]'
                : realtimeStatus === 'reconnecting' || realtimeStatus === 'connecting'
                  ? 'live-dot bg-[var(--amber)]'
                  : 'bg-[var(--urgent)]'
            }`}
          />
          <span>
            {realtimeStatus === 'live'
              ? 'Realtime'
              : realtimeStatus === 'connecting'
                ? 'Connecting'
                : realtimeStatus === 'reconnecting'
                  ? 'Syncing'
                  : 'Offline'}
          </span>
          {freshCount > 0 && (
            <span className="text-[var(--lane)]">· +{freshCount} new</span>
          )}
        </span>

        {lastSyncedAt && (
          <span className="hidden text-[var(--quiet)]/80 md:inline">
            {clockTime(lastSyncedAt)}
          </span>
        )}

        <button
          type="button"
          onClick={onRefresh}
          className="border border-[var(--line-strong)] bg-white/60 px-2 py-1 text-[11px] text-[var(--ink)] transition hover:border-[var(--ink)] hover:bg-white"
          title="Refresh inbox"
        >
          Refresh
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          className="hidden items-center gap-1 border border-[var(--line-strong)] bg-white/60 px-2 py-1 text-[11px] text-[var(--quiet)] transition hover:border-[var(--ink)] hover:text-[var(--ink)] sm:inline-flex"
          title="Keyboard shortcuts (?)"
        >
          <span>Keys</span>
          <span className="kbd-cap">?</span>
        </button>
      </div>
    </div>
  )
}
