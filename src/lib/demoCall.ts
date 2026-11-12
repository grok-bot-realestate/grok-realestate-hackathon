import type { DemoScriptId } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export type DemoCallResponse = {
  ok: boolean
  script_id: DemoScriptId
  call_id: string
  record_id: string
  triage_source: string
  grok_model: string | null
  grok_latency_ms: number | null
}

export async function triggerDemoCall(scriptId: DemoScriptId): Promise<DemoCallResponse> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or anon key is missing in this build.')
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/demo-call`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ script_id: scriptId }),
  })

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !payload?.ok) {
    const errMsg =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Demo call returned HTTP ${res.status}`
    throw new Error(errMsg)
  }

  return {
    ok: true,
    script_id: scriptId,
    call_id: typeof payload.call_id === 'string' ? payload.call_id : '',
    record_id: typeof payload.record_id === 'string' ? payload.record_id : '',
    triage_source:
      typeof payload.triage_source === 'string' ? payload.triage_source : 'grok',
    grok_model: typeof payload.grok_model === 'string' ? payload.grok_model : null,
    grok_latency_ms:
      typeof payload.grok_latency_ms === 'number' ? payload.grok_latency_ms : null,
  }
}
