import type { RefObject } from 'react'
import {
  hoursMarker,
  isRecordDone,
  matchesFilter,
  primaryAction,
  priorityLabel,
  rowWhen,
  typeLabel,
} from '../lib/format'
import type { InboxFilter, InboxRecord, SortMode } from '../types'

const PRIMARY_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
]

const SECONDARY_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'ooh', label: 'Out of hours' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'viewing', label: 'Viewings' },
  { id: 'phone', label: 'Phone' },
  { id: 'dwelly', label: 'Dwelly' },
]

function priorityTone(priority: string): string {
  if (priority === 'urgent') return 'bg-[var(--urgent)]'
  if (priority === 'today') return 'bg-[var(--amber)]'
  return 'bg-[var(--quiet)]/70'
}

type Props = {
  rows: InboxRecord[]
  visible: InboxRecord[]
  status: 'loading' | 'ready' | 'error'
  error: string | null
  filter: InboxFilter
  onFilter: (filter: InboxFilter) => void
  sort: SortMode
  onSort: (sort: SortMode) => void
  search: string
  onSearch: (value: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  selectedId: string | null
  onSelect: (id: string) => void
  highlight: Set<string>
  onClearFilters: () => void
  onRetry: () => void
  callReady: boolean
  onStartCall: () => void
}

export default function InboxPane({
  rows,
  visible,
  status,
  error,
  filter,
  onFilter,
  sort,
  onSort,
  search,
  onSearch,
  searchInputRef,
  selectedId,
  onSelect,
  highlight,
  onClearFilters,
  onRetry,
  callReady,
  onStartCall,
}: Props) {
  const countFor = (id: InboxFilter) => rows.filter((row) => matchesFilter(row, id)).length

  return (
    <aside className="flex min-w-0 flex-col border-b border-[var(--line)] bg-[var(--paper)] backdrop-blur-sm lg:h-[calc(100vh-14.5rem)] lg:min-h-[540px] lg:border-r lg:border-b-0">
      {/* Search + Sort bar */}
      <div className="border-b border-[var(--line)] p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search property, caller, issue, transcript…"
              aria-label="Search inbox"
              className="w-full border border-[var(--line-strong)] bg-white/80 py-1.5 pr-12 pl-3 text-sm text-[var(--ink)] placeholder:text-[var(--quiet)]/80 focus:border-[var(--lane)] focus:bg-white focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[11px] text-[var(--quiet)] hover:text-[var(--ink)]"
              >
                Clear
              </button>
            ) : (
              <kbd className="kbd-cap pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
                /
              </kbd>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSort(sort === 'newest' ? 'priority' : 'newest')}
            className="shrink-0 border border-[var(--line-strong)] bg-white/75 px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink)] transition hover:border-[var(--ink)] hover:bg-white"
            title="Toggle sort order"
          >
            {sort === 'newest' ? 'Sort: Newest' : 'Sort: Priority'}
          </button>
        </div>

        {/* Primary filter tabs */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-b border-[var(--line)]">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Primary filters">
            {PRIMARY_FILTERS.map((item) => {
              const active = filter === item.id
              const count = countFor(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onFilter(item.id)}
                  className={`flex shrink-0 items-baseline gap-1.5 border-b-2 px-2.5 py-1.5 text-xs transition ${
                    active
                      ? 'border-[var(--ink)] font-semibold text-[var(--ink)]'
                      : 'border-transparent text-[var(--quiet)] hover:text-[var(--ink)]'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[10px] opacity-75 tabular-nums">{count}</span>
                </button>
              )
            })}
          </div>
          <span className="hidden shrink-0 font-mono text-[10px] text-[var(--quiet)] sm:inline">
            {visible.length} shown
          </span>
        </div>

        {/* Secondary discipline/source chips */}
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Category filters">
          {SECONDARY_FILTERS.map((item) => {
            const active = filter === item.id
            const count = countFor(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onFilter(active ? 'all' : item.id)}
                className={`shrink-0 border px-2 py-0.5 font-mono text-[11px] transition ${
                  active
                    ? 'border-[var(--lane)] bg-[var(--lane)] text-white'
                    : 'border-[var(--line)] bg-white/55 text-[var(--quiet)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label} <span className="opacity-75">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Queue list */}
      <div className="lane-scroll flex-1 overflow-y-auto">
        {status === 'loading' && (
          <div className="space-y-4 p-4" aria-live="polite">
            <p className="font-mono text-xs text-[var(--quiet)]">Syncing Morning Lane inbox…</p>
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className="space-y-2 border-t border-[var(--line)] pt-3">
                <div className="h-3 w-28 animate-pulse bg-[var(--line)]" />
                <div className="h-4 w-5/6 animate-pulse bg-[var(--line)]" />
                <div className="h-3 w-2/3 animate-pulse bg-[var(--line)]" />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="m-3 border border-[var(--urgent)]/25 bg-white/75 p-4">
            <p className="font-display text-lg font-semibold text-[var(--ink)]">
              Could not load inbox
            </p>
            <p className="mt-1.5 text-xs text-[var(--urgent)]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 border border-[var(--line-strong)] bg-white px-3 py-1.5 font-mono text-xs text-[var(--ink)] hover:border-[var(--ink)]"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && visible.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="font-display text-2xl font-semibold text-[var(--ink)]">
              {rows.length === 0 ? 'Quiet on the line' : 'No matching records'}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-[var(--quiet)]">
              {rows.length === 0
                ? 'Call the line to test a tenant inquiry. Logged calls appear here automatically.'
                : 'Adjust your search query or active filter to inspect other logged calls.'}
            </p>
            {rows.length === 0 && callReady ? (
              <button
                type="button"
                onClick={onStartCall}
                className="mt-4 bg-[var(--lane)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--lane-deep)]"
              >
                Call the line
              </button>
            ) : (
              rows.length > 0 && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="mt-4 border border-[var(--line-strong)] bg-white/80 px-3.5 py-1.5 font-mono text-xs text-[var(--ink)] transition hover:border-[var(--ink)] hover:bg-white"
                >
                  Clear filters
                </button>
              )
            )}
          </div>
        )}

        {status === 'ready' && visible.length > 0 && (
          <ul className="divide-y divide-[var(--line)]" aria-label="Inbox records">
            {visible.map((row) => {
              const stamp = rowWhen(row.call?.started_at ?? row.created_at)
              const marker = hoursMarker(row.call)
              const active = selectedId === row.id
              const done = isRecordDone(row)
              const nextAction = primaryAction(row.actions)
              const openCount = row.actions.filter((a) => !a.done).length

              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`group relative flex w-full items-start gap-3 px-3.5 py-3.5 text-left transition ${
                      active
                        ? 'bg-white/95 shadow-[inset_3px_0_0_var(--lane)]'
                        : 'hover:bg-white/60'
                    } ${highlight.has(row.id) ? 'row-fresh' : ''}`}
                  >
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-[2px] ${priorityTone(row.priority)}`}
                      title={priorityLabel(row.priority)}
                    />

                    <div className="w-[3.75rem] shrink-0 font-mono text-[11px] text-[var(--quiet)]">
                      <span className="block font-medium text-[var(--ink)] tabular-nums">
                        {stamp.time}
                      </span>
                      <span>{stamp.when}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-[var(--lane)] uppercase">
                            {typeLabel(row.type)}
                          </span>
                          {row.triage_source === 'grok' && (
                            <span
                              className="shrink-0 font-mono text-[10px] text-[var(--quiet)]"
                              title={row.grok_model ? `Triaged by ${row.grok_model}` : 'Triaged by Grok'}
                            >
                              · Grok{row.evidence_quotes.length > 0 ? ` (${row.evidence_quotes.length})` : ''}
                            </span>
                          )}
                          {row.property && (
                            <span className="truncate text-xs text-[var(--quiet)]">
                              {row.property}
                            </span>
                          )}
                        </div>
                        {marker && (
                          <span className="shrink-0 font-mono text-[10px] font-medium text-[var(--lane)]">
                            {marker}
                          </span>
                        )}
                      </div>

                      <p
                        className={`mt-1 line-clamp-2 text-[14px] leading-5 ${
                          done
                            ? 'text-[var(--quiet)] line-through decoration-[var(--quiet)]/45'
                            : 'font-medium text-[var(--ink)] group-hover:text-[var(--lane-deep)]'
                        }`}
                      >
                        {row.summary}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-[var(--quiet)]">
                          {nextAction ? nextAction.action : 'No action logged'}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[10px] ${
                            done
                              ? 'text-[var(--lane)]'
                              : openCount > 0
                                ? 'text-[var(--amber)]'
                                : 'text-[var(--quiet)]'
                          }`}
                        >
                          {done ? 'Done' : openCount > 0 ? `${openCount} open` : '—'}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
