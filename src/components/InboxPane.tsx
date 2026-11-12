import type { RefObject } from 'react'
import {
  hoursMarker,
  isRecordDone,
  matchesFilter,
  priorityLabel,
  rowWhen,
  typeLabel,
} from '../lib/format'
import type { InboxFilter, InboxRecord, SortMode } from '../types'

const PRIMARY_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'dwelly', label: 'Dwelly' },
  { id: 'done', label: 'Done' },
]

const SECONDARY_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'ooh', label: 'Out of hours' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'viewing', label: 'Viewings' },
  { id: 'phone', label: 'Phone' },
]

function priorityDot(priority: string): string {
  if (priority === 'urgent') return 'bg-red-600'
  if (priority === 'today') return 'bg-amber-500'
  return 'bg-slate-400'
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
    <aside className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)] lg:h-[calc(100vh-12.75rem)] lg:min-h-[560px]">
      {/* Search, Sort & Filter Header */}
      <div className="border-b border-slate-200/80 p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search property, caller…"
              aria-label="Search inbox"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearch('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                Clear
              </button>
            ) : (
              <kbd className="kbd-cap pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
                /
              </kbd>
            )}
          </div>

          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortMode)}
            aria-label="Sort inbox"
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white focus:border-sky-500 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="priority">Priority</option>
          </select>
        </div>

        {/* Segmented Primary Filter Tabs */}
        <div
          className="mt-3 flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1"
          role="tablist"
          aria-label="Primary filters"
        >
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
                className={`flex flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs transition ${
                  active
                    ? 'bg-white font-semibold text-slate-900 shadow-xs'
                    : 'font-medium text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    active ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Secondary discipline/source pills */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1" aria-label="Category filters">
            {SECONDARY_FILTERS.map((item) => {
              const active = filter === item.id
              const count = countFor(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onFilter(active ? 'all' : item.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition ${
                    active
                      ? 'border-sky-500 bg-sky-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {item.label}{' '}
                  <span className={`font-mono text-[10px] ${active ? 'text-sky-100' : 'text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <span className="hidden shrink-0 font-mono text-[10px] text-slate-400 sm:inline">
            {visible.length} shown
          </span>
        </div>
      </div>

      {/* Queue list */}
      <div className="lane-scroll flex-1 overflow-y-auto">
        {status === 'loading' && (
          <div className="space-y-4 p-5" aria-live="polite">
            <p className="font-mono text-xs text-slate-500">Syncing Morning Lane inbox…</p>
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className="space-y-2 border-t border-slate-100 pt-3.5">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50/70 p-4">
            <p className="text-sm font-semibold text-slate-900">Could not load inbox</p>
            <p className="mt-1 text-xs text-red-700">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-xs hover:border-slate-300"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && visible.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-semibold text-slate-900">
              {rows.length === 0 ? 'Quiet on the line' : 'No matching records'}
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-xs leading-5 text-slate-500">
              {rows.length === 0
                ? 'Call the line to test a tenant inquiry. Logged calls appear here automatically.'
                : 'Adjust your search query or active filter to inspect other logged calls.'}
            </p>
            {rows.length === 0 && callReady ? (
              <button
                type="button"
                onClick={onStartCall}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Call the line
              </button>
            ) : (
              rows.length > 0 && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-slate-300 hover:text-slate-900"
                >
                  Clear filters
                </button>
              )
            )}
          </div>
        )}

        {status === 'ready' && visible.length > 0 && (
          <ul className="divide-y divide-slate-100" aria-label="Inbox records">
            {visible.map((row) => {
              const stamp = rowWhen(row.call?.started_at ?? row.created_at)
              const marker = hoursMarker(row.call)
              const active = selectedId === row.id
              const done = isRecordDone(row)
              const openCount = row.actions.filter((a) => !a.done).length
              const title = row.property?.trim() || `${typeLabel(row.type)} inquiry`

              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`group relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                      active
                        ? 'bg-sky-50/70 shadow-[inset_3px_0_0_#0284C7]'
                        : 'hover:bg-slate-50/90'
                    } ${highlight.has(row.id) ? 'row-fresh' : ''}`}
                  >
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        done ? 'bg-emerald-500' : priorityDot(row.priority)
                      }`}
                      title={done ? 'Done' : priorityLabel(row.priority)}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-[13.5px] font-semibold ${
                            done
                              ? 'text-slate-500'
                              : active
                                ? 'text-slate-950'
                                : 'text-slate-900 group-hover:text-slate-950'
                          }`}
                        >
                          {title}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                          {stamp.time} · {stamp.when}
                        </span>
                      </div>

                      <p
                        className={`mt-1 line-clamp-1 text-xs leading-5 ${
                          done
                            ? 'text-slate-400 line-through decoration-slate-300'
                            : 'text-slate-600'
                        }`}
                      >
                        {row.summary}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
                            {typeLabel(row.type)}
                          </span>
                          {row.priority === 'urgent' && !done && (
                            <span className="rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-red-700">
                              Urgent
                            </span>
                          )}
                          {row.triage_source === 'grok' && row.evidence_quotes.length > 0 && (
                            <span
                              className="rounded-md bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-700"
                              title={row.grok_model ? `Triaged by ${row.grok_model}` : 'Triaged by Grok'}
                            >
                              Grok · {row.evidence_quotes.length}
                            </span>
                          )}
                          {marker && (
                            <span className="font-mono text-[10px] text-slate-400">{marker}</span>
                          )}
                        </div>

                        <span
                          className={`shrink-0 font-mono text-[10.5px] font-medium ${
                            done
                              ? 'text-emerald-600'
                              : openCount > 0
                                ? 'text-amber-600'
                                : 'text-slate-400'
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
