import { useEffect, useRef, useState } from 'react'
import Vapi from '@vapi-ai/web'

export type CallPhase = 'idle' | 'connecting' | 'live' | 'processing'

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

export function useLineCall() {
  const vapiRef = useRef<Vapi | null>(null)
  const [phase, setPhase] = useState<CallPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(
    import.meta.env.VITE_VAPI_PUBLIC_KEY && import.meta.env.VITE_VAPI_ASSISTANT_ID,
  )

  useEffect(() => {
    const key = import.meta.env.VITE_VAPI_PUBLIC_KEY
    if (!key) return
    const vapi = new Vapi(key)
    vapiRef.current = vapi
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
    return () => {
      vapi.removeListener('call-start', onStart)
      vapi.removeListener('call-end', onEnd)
      vapi.removeListener('error', onFail)
      void vapi.stop()
      vapiRef.current = null
    }
  }, [])

  useEffect(() => {
    if (phase !== 'processing') return
    const timer = window.setTimeout(() => setPhase('idle'), 30_000)
    return () => window.clearTimeout(timer)
  }, [phase])

  async function start() {
    const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID
    const vapi = vapiRef.current
    if (!vapi || !assistantId) {
      setError('The voice line is not configured in this build.')
      return
    }
    setError(null)
    setPhase('connecting')
    try {
      await vapi.start(assistantId)
    } catch (err) {
      setPhase('idle')
      setError(errorText(err))
    }
  }

  function hangUp() {
    void vapiRef.current?.stop()
  }

  return { phase, error, ready, start, hangUp }
}
