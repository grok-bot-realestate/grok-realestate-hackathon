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
      className="rise-in mt-4 border border-[var(--ink)]/25 bg-[var(--ink)] text-[var(--fog)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3.5">
          <span
            className={`inline-block size-2.5 shrink-0 rounded-[2px] ${
              phase === 'live'
                ? 'live-dot bg-[#6ce0b8]'
                : phase === 'processing'
                  ? 'live-dot bg-[#f3c669]'
                  : 'live-dot bg-white/75'
            }`}
          />
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-medium tracking-[0.16em] text-white/70 uppercase">
                {phase === 'connecting'
                  ? 'Connecting'
                  : phase === 'live'
                    ? 'Live · Property Line'
                    : 'Post-call Triage'}
              </span>
              <span className="font-mono text-xs text-white/90 tabular-nums">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-white">{speakerLabel}</p>
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
                    className={`w-1 rounded-[1px] transition-all duration-100 ${
                      assistantSpeaking
                        ? 'bg-[#6ce0b8]'
                        : muted
                          ? 'bg-white/25'
                          : 'bg-white/80'
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
                className={`border px-3 py-1.5 font-mono text-xs font-medium transition ${
                  muted
                    ? 'border-[#f3c669]/60 bg-[#f3c669]/15 text-[#f3c669]'
                    : 'border-white/25 bg-white/5 text-white hover:bg-white/15'
                }`}
              >
                {muted ? 'Unmute mic (m)' : 'Mute mic (m)'}
              </button>
            )}

            {(phase === 'connecting' || phase === 'live') && (
              <button
                type="button"
                onClick={onHangUp}
                className="bg-[var(--urgent)] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#991b13]"
              >
                Hang up
              </button>
            )}

            {phase === 'processing' && (
              <button
                type="button"
                onClick={onDismissProcessing}
                className="border border-white/25 px-3 py-1.5 font-mono text-xs text-white/80 transition hover:border-white/50 hover:text-white"
              >
                Hide
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Streaming Captions / Triage progress */}
      <div className="border-t border-white/12 bg-black/15 px-4 py-3 sm:px-5">
        {phase === 'processing' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-white/80">
              Vapi webhook is saving the call and extracting property, safety check, priority, and next action. The new record will select automatically once it lands.
            </p>
            <span className="shrink-0 font-mono text-[11px] text-[#6ce0b8]">
              Listening on Realtime…
            </span>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="lane-scroll max-h-36 space-y-2 overflow-y-auto pr-1 text-xs leading-5"
          >
            {captions.length === 0 && !partialCaption && (
              <p className="font-mono text-[11px] text-white/55">
                {phase === 'connecting'
                  ? 'Requesting microphone access and joining Morning Lane assistant…'
                  : 'Live captions will stream here as soon as speech begins…'}
              </p>
            )}

            {captions.map((turn) => (
              <div key={turn.id} className="flex items-baseline gap-2.5">
                <span
                  className={`w-24 shrink-0 font-mono text-[10px] font-medium tracking-[0.12em] uppercase ${
                    turn.speaker === 'assistant' ? 'text-[#6ce0b8]' : 'text-[#f3c669]'
                  }`}
                >
                  {turn.speaker === 'assistant' ? 'Morning Lane' : 'Caller'}
                </span>
                <span className="text-white/92">{turn.text}</span>
              </div>
            ))}

            {partialCaption && (
              <div className="flex items-baseline gap-2.5 opacity-80">
                <span
                  className={`w-24 shrink-0 font-mono text-[10px] font-medium tracking-[0.12em] uppercase ${
                    partialCaption.speaker === 'assistant' ? 'text-[#6ce0b8]' : 'text-[#f3c669]'
                  }`}
                >
                  {partialCaption.speaker === 'assistant' ? 'Morning Lane' : 'Caller'}
                </span>
                <span className="italic text-white/80">{partialCaption.text}…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
