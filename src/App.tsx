import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DemoPromptsPopover from './components/DemoPromptsPopover'
import InboxPane from './components/InboxPane'
import LiveCallDock from './components/LiveCallDock'
import RecordWorkbench from './components/RecordWorkbench'
import ShortcutsModal from './components/ShortcutsModal'
import TelemetryStrip from './components/TelemetryStrip'
import { matchesFilter, matchesSearch, primaryAction, priorityRank } from './lib/format'
import { useInbox } from './lib/inbox'
import { useLineCall } from './lib/lineCall'
import type { InboxFilter, Priority, SortMode, ToastItem } from './types'

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
  } = useInbox(phase === 'processing')

  const [filter, setFilter] = useState<InboxFilter>('all')
  const [sort, setSort] = useState<SortMode>('newest')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'inbox' | 'record'>('inbox')
  const [demoOpen, setDemoOpen] = useState(false)
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
    return visible[0]?.id ?? null
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
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col overflow-x-clip px-3 pb-8 pt-5 sm:px-6 sm:pt-7">
      {/* Header */}
      <header className="rise-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.22em] text-[var(--lane)] uppercase">
              Morning Lane · Hackney E8
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="font-display text-4xl leading-none font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">
                Line
              </h1>
              <span className="text-sm text-[var(--quiet)]">
                AI property-line inbox & live call triage
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDemoOpen((prev) => !prev)}
              aria-expanded={demoOpen}
              className={`border px-3.5 py-2 text-xs font-medium transition ${
                demoOpen
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                  : 'border-[var(--line-strong)] bg-white/75 text-[var(--ink)] hover:border-[var(--ink)] hover:bg-white'
              }`}
            >
              Demo scripts
            </button>

            {onCallNow ? (
              <button
                type="button"
                onClick={hangUpCall}
                className="call-live bg-[var(--urgent)] px-5 py-2 text-xs font-medium text-white transition hover:bg-[#991b13]"
              >
                {phase === 'connecting' ? 'Connecting… (Cancel)' : 'Hang up call'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startCall()}
                disabled={!callReady || phase === 'processing'}
                className="bg-[var(--lane)] px-5 py-2 text-xs font-medium text-white transition hover:bg-[var(--lane-deep)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {phase === 'processing' ? 'Triaging call…' : 'Call the line'}
              </button>
            )}
          </div>
        </div>

        {(callError || !callReady) && (
          <div className="mt-3 space-y-2">
            {callError && (
              <p className="border border-[var(--urgent)]/25 bg-white/75 px-3 py-2 text-xs text-[var(--urgent)]">
                {callError}
              </p>
            )}
            {!callReady && (
              <p className="font-mono text-xs text-[var(--quiet)]">
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
      </header>

      {/* Inline Operations Telemetry Strip */}
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

      {/* Master-Detail Split Workbench */}
      <div className="mt-4 grid min-w-0 flex-1 border border-[var(--line)] lg:grid-cols-[minmax(320px,395px)_minmax(0,1fr)]">
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
            onNotify={notify}
          />
        </div>
      </div>

      {/* Subtle footer shortcut hint */}
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[var(--quiet)]">
        <span>Morning Lane Branch · Traceable AI call intake</span>
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
            className="hover:text-[var(--ink)]"
          >
            <kbd className="kbd-cap">?</kbd> all keys
          </button>
        </div>
      </footer>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto border px-3.5 py-2 font-mono text-xs backdrop-blur-md ${
                toast.tone === 'error'
                  ? 'border-[var(--urgent)] bg-white/95 text-[var(--urgent)]'
                  : toast.tone === 'success'
                    ? 'border-[var(--lane)] bg-[var(--ink)] text-white'
                    : 'border-[var(--line-strong)] bg-white/95 text-[var(--ink)]'
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
