import { useEffect, useRef } from 'react'
import { formatElapsed } from '../lib/format'
import type { CallPhase } from '../lib/lineCall'
import type { LiveCaption } from '../types'

type Props = {
  phase: CallPhase
  muted: boolean
  elapsedSeconds: number
  volumeLevel: number
  localVolumeLevel: number
  assistantSpeaking: boolean
  captions: LiveCaption[]
  partialCaption: { speaker: 'assistant' | 'caller'; text: string } | null
  onToggleMute: () => void
  onHangUp: () => void
  onDismissProcessing: () => void
}

const BAR_WEIGHTS = [0.35, 0.55, 0.8, 1, 0.72, 0.92, 0.65, 0.88, 0.96, 0.68, 0.5, 0.32]

export default function LiveCallDock({
  phase,
  muted,
  elapsedSeconds,
  volumeLevel,
  localVolumeLevel,
  assistantSpeaking,
  captions,
  partialCaption,
  onToggleMute,
  onHangUp,
  onDismissProcessing,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [captions, partialCaption, phase])

  if (phase === 'idle') return null

  const activeLevel = assistantSpeaking
    ? Math.max(0.18, volumeLevel)
    : muted
      ? 0.04
      : Math.max(0.08, localVolumeLevel, volumeLevel * 0.5)

  const speakerLabel =
    phase === 'connecting'
      ? 'Opening voice channel…'
      : phase === 'processing'
        ? 'Triaging transcript into Inbox…'
        : muted
          ? 'Microphone muted'
          : assistantSpeaking
            ? 'Morning Lane speaking'
            : 'Listening to caller'

  return (
    <section
      aria-live="polite"
      className="rise-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-elevated)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <span
            className={`inline-block size-2.5 shrink-0 rounded-full ${
              phase === 'live'
                ? 'live-dot bg-emerald-500'
                : phase === 'processing'
                  ? 'live-dot bg-amber-500'
                  : 'live-dot bg-sky-500'
            }`}
          />
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-medium tracking-wider text-sky-600 uppercase">
                {phase === 'connecting'
                  ? 'Connecting'
                  : phase === 'live'
                    ? 'Live · Property Line'
                    : 'Post-call Triage'}
              </span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700 tabular-nums">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{speakerLabel}</p>
          </div>
        </div>

        {/* Dynamic Audio Level Bars */}
        <div className="flex items-center gap-4">
          {phase !== 'processing' && (
            <div
              className="hidden h-7 items-center gap-1 px-2 sm:flex"
              aria-hidden="true"
              title="Live voice signal"
            >
              {BAR_WEIGHTS.map((weight, idx) => {
                const heightPct =
                  phase === 'connecting'
                    ? 22 + ((idx * 17) % 35)
                    : Math.min(100, Math.max(16, Math.round(activeLevel * weight * 115)))
                return (
                  <span
                    key={idx}
                    style={{ height: `${heightPct}%` }}
                    className={`w-1 rounded-full transition-all duration-100 ${
                      assistantSpeaking
                        ? 'bg-sky-500'
                        : muted
                          ? 'bg-slate-200'
                          : 'bg-slate-700'
                    }`}
                  />
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            {phase === 'live' && (
              <button
                type="button"
                onClick={onToggleMute}
                aria-pressed={muted}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  muted
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {muted ? 'Unmute mic (m)' : 'Mute mic (m)'}
              </button>
            )}

            {(phase === 'connecting' || phase === 'live') && (
              <button
                type="button"
                onClick={onHangUp}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Hang up
              </button>
            )}

            {phase === 'processing' && (
              <button
                type="button"
                onClick={onDismissProcessing}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Hide
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Streaming Captions / Triage progress */}
      <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3">
        {phase === 'processing' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-600">
              Saving call and running Grok triage for property, safety check, priority, and next action. The new record will select automatically once it lands.
            </p>
            <span className="shrink-0 font-mono text-[11px] font-medium text-emerald-600">
              Listening on Realtime…
            </span>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="lane-scroll max-h-36 space-y-2 overflow-y-auto pr-1 text-xs leading-5"
          >
            {captions.length === 0 && !partialCaption && (
              <p className="font-mono text-[11px] text-slate-400">
                {phase === 'connecting'
                  ? 'Requesting microphone access and joining Morning Lane assistant…'
                  : 'Live captions will stream here as soon as speech begins…'}
              </p>
            )}

            {captions.map((turn) => (
              <div key={turn.id} className="flex items-baseline gap-2.5">
                <span
                  className={`w-24 shrink-0 font-mono text-[10px] font-semibold tracking-wider uppercase ${
                    turn.speaker === 'assistant' ? 'text-sky-600' : 'text-slate-900'
                  }`}
                >
                  {turn.speaker === 'assistant' ? 'Morning Lane' : 'Caller'}
                </span>
                <span className="text-slate-700">{turn.text}</span>
              </div>
            ))}

            {partialCaption && (
              <div className="flex items-baseline gap-2.5 opacity-75">
                <span
                  className={`w-24 shrink-0 font-mono text-[10px] font-semibold tracking-wider uppercase ${
                    partialCaption.speaker === 'assistant' ? 'text-sky-600' : 'text-slate-900'
                  }`}
                >
                  {partialCaption.speaker === 'assistant' ? 'Morning Lane' : 'Caller'}
                </span>
                <span className="italic text-slate-600">{partialCaption.text}…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
