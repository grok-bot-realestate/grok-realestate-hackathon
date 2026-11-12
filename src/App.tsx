import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DemoPromptsPopover from './components/DemoPromptsPopover'
import InboxPane from './components/InboxPane'
import LiveCallDock from './components/LiveCallDock'
import RecordWorkbench from './components/RecordWorkbench'
import ShortcutsModal from './components/ShortcutsModal'
import TelemetryStrip from './components/TelemetryStrip'
import { matchesFilter, matchesSearch, primaryAction, priorityRank } from './lib/format'
import { triggerDemoCall } from './lib/demoCall'
import { useInbox } from './lib/inbox'
import { useLineCall } from './lib/lineCall'
import type { DemoScriptId, InboxFilter, Priority, SortMode, ToastItem } from './types'

export default function App() {
  const {
    phase,
    error: callError,
    ready: callReady,
    muted,
    elapsedSeconds,
    volumeLevel,
    localVolumeLevel,
    assistantSpeaking,
    captions,
    partialCaption,
    start: startCall,
    hangUp: hangUpCall,
    toggleMute,
    beginProcessing,
    finishProcessing,
  } = useLineCall()
  const {
    rows,
    kpi,
    status,
    error: inboxError,
    freshCount,
    highlight,
    realtimeStatus,
    lastSyncedAt,
    latestArrivedPhoneId,
    clearLatestArrivedPhoneId,
    reload,
    toggleActionDone,
    addFollowUpAction,
    updateRecordPriority,
    setLocalDraftReply,
  } = useInbox(phase === 'processing')

  const [filter, setFilter] = useState<InboxFilter>('all')
  const [sort, setSort] = useState<SortMode>('newest')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'inbox' | 'record'>('inbox')
  const [demoOpen, setDemoOpen] = useState(false)
  const [simulatingCall, setSimulatingCall] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const notify = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3200)
  }, [])

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) => matchesFilter(row, filter) && matchesSearch(row, search),
    )
    if (sort === 'priority') {
      return [...filtered].sort((a, b) => {
        const diff = priorityRank(a.priority) - priorityRank(b.priority)
        if (diff !== 0) return diff
        const left = a.call?.started_at ?? a.created_at
        const right = b.call?.started_at ?? b.created_at
        return right.localeCompare(left)
      })
    }
    return filtered
  }, [rows, filter, search, sort])

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && rows.some((r) => r.id === selectedId)) return selectedId
    const preferred = visible.find(
      (r) => r.triage_source !== 'empty' && r.summary !== 'Hung up at greeting',
    )
    return (preferred ?? visible[0])?.id ?? null
  }, [selectedId, rows, visible])

  // Auto-select newly arrived phone call after triage completes
  useEffect(() => {
    if (!latestArrivedPhoneId) return
    const timer = window.setTimeout(() => {
      setSelectedId(latestArrivedPhoneId)
      setMobileView('record')
      if (phase === 'processing') {
        finishProcessing()
      }
      notify('success', 'New call triaged and selected in Inbox')
      clearLatestArrivedPhoneId()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [latestArrivedPhoneId, phase, finishProcessing, clearLatestArrivedPhoneId, notify])

  const activeRow = useMemo(
    () => rows.find((row) => row.id === effectiveSelectedId) ?? null,
    [rows, effectiveSelectedId],
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setMobileView('record')
  }, [])

  const handleSimulateCall = useCallback(
    async (scriptId: DemoScriptId) => {
      if (simulatingCall || phase !== 'idle') return
      setDemoOpen(false)
      setSimulatingCall(true)
      beginProcessing()
      try {
        await triggerDemoCall(scriptId)
        await reload()
      } catch (err) {
        finishProcessing()
        notify('error', err instanceof Error ? err.message : 'Simulated call failed')
      } finally {
        setSimulatingCall(false)
      }
    },
    [simulatingCall, phase, beginProcessing, reload, finishProcessing, notify],
  )

  const handleToggleAction = useCallback(
    async (actionId: string, nextDone: boolean) => {
      const res = await toggleActionDone(actionId, nextDone)
      if (!res.ok) {
        notify('error', res.error ?? 'Failed to update action')
      } else {
        notify('success', nextDone ? 'Action marked done' : 'Action reopened')
      }
    },
    [toggleActionDone, notify],
  )

  const handleAddFollowUp = useCallback(
    async (recordId: string, text: string, priority: Priority) => {
      const res = await addFollowUpAction(recordId, text, priority)
      if (!res.ok) {
        notify('error', res.error ?? 'Failed to add follow-up')
        return false
      }
      notify('success', 'Follow-up action saved')
      return true
    },
    [addFollowUpAction, notify],
  )

  const handleUpdatePriority = useCallback(
    async (recordId: string, priority: Priority) => {
      const res = await updateRecordPriority(recordId, priority)
      if (!res.ok) {
        notify('error', res.error ?? 'Failed to update priority')
      } else {
        notify('info', `Priority updated to ${priority}`)
      }
    },
    [updateRecordPriority, notify],
  )

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const inInput =
        target != null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false)
          return
        }
        if (demoOpen) {
          setDemoOpen(false)
          return
        }
        if (inInput && target === searchInputRef.current) {
          if (search) setSearch('')
          else searchInputRef.current?.blur()
          return
        }
        if (mobileView === 'record') {
          setMobileView('inbox')
        }
        return
      }

      if (inInput) return

      if (e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      if (e.key === 'm' && phase === 'live') {
        e.preventDefault()
        toggleMute()
        return
      }

      if (e.key === 'd' && activeRow) {
        const primary = primaryAction(activeRow.actions)
        if (primary) {
          e.preventDefault()
          void handleToggleAction(primary.id, !primary.done)
        }
        return
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        if (visible.length === 0) return
        e.preventDefault()
        const idx = visible.findIndex((r) => r.id === effectiveSelectedId)
        const next = idx < 0 ? visible[0] : visible[Math.min(visible.length - 1, idx + 1)]
        if (next) setSelectedId(next.id)
        return
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        if (visible.length === 0) return
        e.preventDefault()
        const idx = visible.findIndex((r) => r.id === effectiveSelectedId)
        const prev = idx <= 0 ? visible[0] : visible[idx - 1]
        if (prev) setSelectedId(prev.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    shortcutsOpen,
    demoOpen,
    search,
    mobileView,
    phase,
    toggleMute,
    activeRow,
    visible,
    effectiveSelectedId,
    handleToggleAction,
  ])

  const onCallNow = phase === 'live' || phase === 'connecting'

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      {/* Sleek Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M7 5v14h10v-3h-7V5H7z"
                    fill="currentColor"
                  />
                  <circle cx="17" cy="7" r="2.2" fill="#38BDF8" />
                </svg>
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Line</h1>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              <span
                className={`size-1.5 rounded-full ${
                  realtimeStatus === 'live'
                    ? 'bg-emerald-500'
                    : realtimeStatus === 'offline'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                }`}
              />
              Morning Lane
            </span>

            <span className="hidden text-xs text-slate-400 md:inline">
              AI property-line inbox & live call triage
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDemoOpen((prev) => !prev)}
              aria-expanded={demoOpen}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                demoOpen
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 shadow-[var(--shadow-card)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              Demo scripts
            </button>

            {onCallNow ? (
              <button
                type="button"
                onClick={hangUpCall}
                className="call-live inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                <span className="size-2 rounded-full bg-white" />
                {phase === 'connecting' ? 'Connecting… (Cancel)' : 'Hang up call'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startCall()}
                disabled={!callReady || phase === 'processing'}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <svg
                  className="size-3.5 text-sky-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
                {phase === 'processing' ? 'Triaging call…' : 'Call the line'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 pt-5 pb-6 sm:px-6">
        {(callError || !callReady) && (
          <div className="space-y-2">
            {callError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
                {callError}
              </p>
            )}
            {!callReady && (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-xs text-slate-500">
                Voice line inactive in this build (`VITE_VAPI_PUBLIC_KEY` / `VITE_VAPI_ASSISTANT_ID` missing).
              </p>
            )}
          </div>
        )}

        <DemoPromptsPopover
          open={demoOpen}
          onClose={() => setDemoOpen(false)}
          onStartCall={() => {
            setDemoOpen(false)
            void startCall()
          }}
          onSimulateCall={(scriptId) => void handleSimulateCall(scriptId)}
          simulating={simulatingCall}
          callReady={callReady}
          isCallActive={phase !== 'idle'}
          onCopied={(msg) => notify('success', msg)}
        />

        <LiveCallDock
          phase={phase}
          muted={muted}
          elapsedSeconds={elapsedSeconds}
          volumeLevel={volumeLevel}
          localVolumeLevel={localVolumeLevel}
          assistantSpeaking={assistantSpeaking}
          captions={captions}
          partialCaption={partialCaption}
          onToggleMute={toggleMute}
          onHangUp={hangUpCall}
          onDismissProcessing={finishProcessing}
        />

        {/* Compact Telemetry & Quick-Filter Strip */}
        <TelemetryStrip
          rows={rows}
          kpi={kpi}
          activeFilter={filter}
          onFilter={(next) => {
            setFilter(next)
            setMobileView('inbox')
          }}
          realtimeStatus={realtimeStatus}
          lastSyncedAt={lastSyncedAt}
          freshCount={freshCount}
          onRefresh={() => {
            void reload()
            notify('info', 'Inbox refreshed')
          }}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />

        {/* Airy Master-Detail Split Grid */}
        <div className="grid min-w-0 flex-1 gap-6 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          <div className={`min-w-0 ${mobileView === 'record' ? 'hidden lg:block' : 'block'}`}>
            <InboxPane
              rows={rows}
              visible={visible}
              status={status}
              error={inboxError}
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              onSort={setSort}
              search={search}
              onSearch={setSearch}
              searchInputRef={searchInputRef}
              selectedId={effectiveSelectedId}
              onSelect={handleSelect}
              highlight={highlight}
              onClearFilters={() => {
                setFilter('all')
                setSearch('')
              }}
              onRetry={() => void reload()}
              callReady={callReady}
              onStartCall={() => void startCall()}
            />
          </div>

          <div className={`min-w-0 ${mobileView === 'inbox' ? 'hidden lg:block' : 'block'}`}>
            <RecordWorkbench
              key={activeRow?.id ?? 'none'}
              row={activeRow}
              loading={status === 'loading'}
              hasRows={rows.length > 0}
              onBackMobile={() => setMobileView('inbox')}
              onToggleAction={handleToggleAction}
              onAddFollowUp={handleAddFollowUp}
              onUpdatePriority={handleUpdatePriority}
              onDraftSaved={setLocalDraftReply}
              onNotify={notify}
            />
          </div>
        </div>

        {/* Subtle footer shortcut hint */}
        <footer className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-slate-400">
          <span>Morning Lane · Hackney E8 · Traceable AI call intake</span>
          <div className="hidden items-center gap-3 sm:flex">
            <span>
              <kbd className="kbd-cap">j</kbd> <kbd className="kbd-cap">k</kbd> navigate
            </span>
            <span>
              <kbd className="kbd-cap">/</kbd> search
            </span>
            <span>
              <kbd className="kbd-cap">d</kbd> toggle done
            </span>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="hover:text-slate-700"
            >
              <kbd className="kbd-cap">?</kbd> all keys
            </button>
          </div>
        </footer>
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-xs font-medium shadow-[var(--shadow-elevated)] backdrop-blur-md ${
                toast.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : toast.tone === 'success'
                    ? 'border-slate-800 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
