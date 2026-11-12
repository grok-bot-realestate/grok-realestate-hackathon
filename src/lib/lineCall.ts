import { useEffect, useRef, useState } from 'react'
import * as VapiNs from '@vapi-ai/web'

export type CallPhase = 'idle' | 'connecting' | 'live' | 'processing'

type LineClient = {
  start: (assistantId: string) => Promise<unknown>
  stop: () => void
  on: (event: 'call-start' | 'call-end' | 'error', listener: (...args: unknown[]) => void) => void
  removeListener: (
    event: 'call-start' | 'call-end' | 'error',
    listener: (...args: unknown[]) => void,
  ) => void
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
  const ready = Boolean(
    import.meta.env.VITE_VAPI_PUBLIC_KEY && import.meta.env.VITE_VAPI_ASSISTANT_ID,
  )

  useEffect(() => {
    return () => {
      vapiRef.current?.stop()
    }
  }, [])

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
    const onStart = () => {
      setPhase('live')
      setError(null)
    }
    const onEnd = () => setPhase('processing')
    const onFail = (err: unknown) => {
      setError(errorText(err))
      setPhase((current) => (current === 'live' ? 'processing' : 'idle'))
    }
    vapi.on('call-start', onStart)
    vapi.on('call-end', onEnd)
    vapi.on('error', onFail)
    vapiRef.current = vapi
    return vapi
  }

  async function start() {
    const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID
    if (!assistantId) {
      setError('The voice line is not configured in this build.')
      return
    }
    setError(null)
    setPhase('connecting')
    try {
      await client().start(assistantId)
    } catch (err) {
      setPhase('idle')
      setError(errorText(err))
    }
  }

  function hangUp() {
    vapiRef.current?.stop()
  }

  return { phase, error, ready, start, hangUp }
}
