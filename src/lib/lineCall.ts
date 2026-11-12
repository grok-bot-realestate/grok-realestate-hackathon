import { useCallback, useEffect, useRef, useState } from 'react'
import * as VapiNs from '@vapi-ai/web'
import type { LiveCaption } from '../types'

export type CallPhase = 'idle' | 'connecting' | 'live' | 'processing'

export type EndedCallSnapshot = {
  callId: string | null
  assistantId: string | null
  startedAt: string
  endedAt: string
  durationSeconds: number
  transcript: string
}

type VapiEventName =
  | 'call-start'
  | 'call-start-success'
  | 'call-end'
  | 'speech-start'
  | 'speech-end'
  | 'volume-level'
  | 'local-volume-level'
  | 'message'
  | 'error'

type LineClient = {
  start: (assistantId: string) => Promise<unknown>
  stop: () => Promise<void> | void
  setMuted: (mute: boolean) => void
  isMuted: () => boolean
  on: (event: VapiEventName, listener: (...args: unknown[]) => void) => void
  removeListener: (event: VapiEventName, listener: (...args: unknown[]) => void) => void
}

function scrub(message: string): string {
  const key = import.meta.env.VITE_VAPI_PUBLIC_KEY
  const clean = key ? message.split(key).join('…') : message
  return clean.length > 180 ? 'The call failed.' : clean
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return scrub(err.message)
  if (typeof err === 'string') return scrub(err)
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message) return scrub(message)
  }
  return 'The call failed.'
}

function resolveCtor(mod: unknown): new (apiToken: string) => LineClient {
  const queue: unknown[] = [mod]
  const seen = new Set<unknown>()
  while (queue.length > 0) {
    const current = queue.shift()
    if (current == null || seen.has(current)) continue
    seen.add(current)
    if (typeof current === 'function') return current as new (apiToken: string) => LineClient
    if (typeof current === 'object' && 'default' in current) {
      queue.push((current as { default: unknown }).default)
    }
  }
  throw new Error('Voice SDK failed to load.')
}

export function useLineCall() {
  const vapiRef = useRef<LineClient | null>(null)
  const [phase, setPhase] = useState<CallPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [localVolumeLevel, setLocalVolumeLevel] = useState(0)
  const [assistantSpeaking, setAssistantSpeaking] = useState(false)
  const [captions, setCaptions] = useState<LiveCaption[]>([])
  const [partialCaption, setPartialCaption] = useState<{
    speaker: 'assistant' | 'caller'
    text: string
  } | null>(null)
  const [lastEndedCall, setLastEndedCall] = useState<EndedCallSnapshot | null>(null)

  const callIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<string | null>(null)
  const elapsedRef = useRef<number>(0)
  const captionsRef = useRef<LiveCaption[]>([])
  const partialRef = useRef<{ speaker: 'assistant' | 'caller'; text: string } | null>(null)

  const ready = Boolean(
    import.meta.env.VITE_VAPI_PUBLIC_KEY && import.meta.env.VITE_VAPI_ASSISTANT_ID,
  )

  useEffect(() => {
    return () => {
      void vapiRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (phase !== 'live') return
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1
        elapsedRef.current = next
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'processing') return
    const timer = window.setTimeout(() => setPhase('idle'), 30_000)
    return () => window.clearTimeout(timer)
  }, [phase])

  function client(): LineClient {
    if (vapiRef.current) return vapiRef.current
    const key = import.meta.env.VITE_VAPI_PUBLIC_KEY
    if (!key) throw new Error('The voice line is not configured in this build.')
    const vapi = new (resolveCtor(VapiNs))(key)

    vapi.on('call-start', () => {
      startedAtRef.current = new Date().toISOString()
      elapsedRef.current = 0
      captionsRef.current = []
      partialRef.current = null
      setLastEndedCall(null)
      setPhase('live')
      setError(null)
      setMuted(false)
      setElapsedSeconds(0)
      setVolumeLevel(0)
      setLocalVolumeLevel(0)
      setAssistantSpeaking(false)
      setCaptions([])
      setPartialCaption(null)
    })

    vapi.on('call-start-success', (ev: unknown) => {
      if (ev && typeof ev === 'object' && 'callId' in ev) {
        const id = (ev as { callId?: unknown }).callId
        if (typeof id === 'string' && id.trim()) {
          callIdRef.current = id.trim()
        }
      }
    })

    vapi.on('call-end', () => {
      setPhase('processing')
      setAssistantSpeaking(false)
      setVolumeLevel(0)
      setLocalVolumeLevel(0)
      setPartialCaption(null)

      const turns = [...captionsRef.current]
      const dangling = partialRef.current
      if (dangling && dangling.text.trim()) {
        const last = turns[turns.length - 1]
        if (!last || last.speaker !== dangling.speaker || last.text !== dangling.text) {
          turns.push({
            id: `${Date.now()}-partial`,
            speaker: dangling.speaker,
            text: dangling.text.trim(),
            timestamp: new Date().toISOString(),
          })
        }
      }
      partialRef.current = null
      const transcript = turns
        .map((turn) => `${turn.speaker === 'assistant' ? 'AI' : 'Caller'}: ${turn.text}`)
        .join('\n')

      if (callIdRef.current || transcript.trim()) {
        setLastEndedCall({
          callId: callIdRef.current,
          assistantId: import.meta.env.VITE_VAPI_ASSISTANT_ID ?? null,
          startedAt: startedAtRef.current ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationSeconds: elapsedRef.current,
          transcript,
        })
      }
    })

    vapi.on('speech-start', () => {
      setAssistantSpeaking(true)
    })

    vapi.on('speech-end', () => {
      setAssistantSpeaking(false)
    })

    vapi.on('volume-level', (vol: unknown) => {
      if (typeof vol === 'number' && Number.isFinite(vol)) {
        setVolumeLevel(Math.max(0, Math.min(1, vol)))
      }
    })

    vapi.on('local-volume-level', (vol: unknown) => {
      if (typeof vol === 'number' && Number.isFinite(vol)) {
        setLocalVolumeLevel(Math.max(0, Math.min(1, vol)))
      }
    })

    vapi.on('message', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      const msg = raw as Record<string, unknown>
      if (msg.call && typeof msg.call === 'object') {
        const msgCallId = (msg.call as { id?: unknown }).id
        if (typeof msgCallId === 'string' && msgCallId.trim()) {
          callIdRef.current = msgCallId.trim()
        }
      }
      if (msg.type === 'transcript') {
        const text = typeof msg.transcript === 'string' ? msg.transcript.trim() : ''
        if (!text) return
        const speaker: 'assistant' | 'caller' = msg.role === 'user' ? 'caller' : 'assistant'
        const transcriptType = msg.transcriptType === 'final' ? 'final' : 'partial'
        if (transcriptType === 'partial') {
          const nextPartial = { speaker, text }
          partialRef.current = nextPartial
          setPartialCaption(nextPartial)
        } else {
          partialRef.current = null
          setPartialCaption(null)
          setCaptions((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.speaker === speaker && last.text === text) return prev
            const updated = [
              ...prev,
              {
                id: `${Date.now()}-${prev.length}`,
                speaker,
                text,
                timestamp: new Date().toISOString(),
              },
            ]
            captionsRef.current = updated
            return updated
          })
        }
      } else if (msg.type === 'speech-update') {
        if (msg.role === 'assistant') {
          setAssistantSpeaking(msg.status === 'started')
        }
      }
    })

    vapi.on('error', (err: unknown) => {
      setError(errorText(err))
      setAssistantSpeaking(false)
      setPhase((current) => (current === 'live' ? 'processing' : 'idle'))
    })

    vapiRef.current = vapi
    return vapi
  }

  const start = useCallback(async () => {
    const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID
    if (!assistantId) {
      setError('The voice line is not configured in this build.')
      return
    }
    callIdRef.current = null
    startedAtRef.current = new Date().toISOString()
    elapsedRef.current = 0
    captionsRef.current = []
    partialRef.current = null
    setLastEndedCall(null)
    setError(null)
    setElapsedSeconds(0)
    setCaptions([])
    setPartialCaption(null)
    setPhase('connecting')
    try {
      const started = await client().start(assistantId)
      if (started && typeof started === 'object' && 'id' in started) {
        const id = (started as { id?: unknown }).id
        if (typeof id === 'string' && id.trim()) {
          callIdRef.current = id.trim()
        }
      }
    } catch (err) {
      setPhase('idle')
      setError(errorText(err))
    }
  }, [])

  const hangUp = useCallback(() => {
    void vapiRef.current?.stop()
  }, [])

  const toggleMute = useCallback(() => {
    const vapi = vapiRef.current
    if (!vapi) return
    const next = !vapi.isMuted()
    vapi.setMuted(next)
    setMuted(next)
  }, [])

  const beginProcessing = useCallback(() => {
    setError(null)
    setPhase('processing')
  }, [])

  const finishProcessing = useCallback(() => {
    setPhase((current) => (current === 'processing' ? 'idle' : current))
  }, [])

  const clearLastEndedCall = useCallback(() => {
    setLastEndedCall(null)
  }, [])

  return {
    phase,
    error,
    ready,
    muted,
    elapsedSeconds,
    volumeLevel,
    localVolumeLevel,
    assistantSpeaking,
    captions,
    partialCaption,
    lastEndedCall,
    clearLastEndedCall,
    start,
    hangUp,
    toggleMute,
    beginProcessing,
    finishProcessing,
  }
}
