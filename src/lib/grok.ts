import type { DispatchMode, EvidenceQuote, GrokDispatchResult } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function normalizeQuotes(raw: unknown): EvidenceQuote[] {
  if (!Array.isArray(raw)) return []
  const out: EvidenceQuote[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const field = typeof rec.field === 'string' ? rec.field.trim() : 'evidence'
    const quote = typeof rec.quote === 'string' ? rec.quote.trim() : ''
    if (quote) out.push({ field: field || 'evidence', quote })
  }
  return out
}

export async function requestGrokDispatch(params: {
  recordId: string
  mode: DispatchMode
  customInstruction?: string
  save?: boolean
}): Promise<GrokDispatchResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or anon key is missing in this build.')
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/grok-dispatch`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      record_id: params.recordId,
      mode: params.mode,
      custom_instruction: params.customInstruction,
      save: params.save ?? true,
    }),
  })

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const errMsg =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Grok dispatch returned HTTP ${res.status}`
    throw new Error(errMsg)
  }

  if (!payload || typeof payload.message !== 'string') {
    throw new Error('Grok dispatch returned an unexpected response.')
  }

  return {
    ok: Boolean(payload.ok),
    record_id: typeof payload.record_id === 'string' ? payload.record_id : null,
    mode:
      payload.mode === 'contractor' || payload.mode === 'caller' || payload.mode === 'handover'
        ? payload.mode
        : params.mode,
    subject:
      typeof payload.subject === 'string' && payload.subject.trim()
        ? payload.subject.trim()
        : 'Morning Lane dispatch',
    recipient_role:
      typeof payload.recipient_role === 'string' && payload.recipient_role.trim()
        ? payload.recipient_role.trim()
        : params.mode,
    message: payload.message.trim(),
    checklist: Array.isArray(payload.checklist)
      ? payload.checklist.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    evidence_quotes: normalizeQuotes(payload.evidence_quotes),
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : 'grok',
    latency_ms: typeof payload.latency_ms === 'number' ? payload.latency_ms : 0,
    tokens: typeof payload.tokens === 'number' ? payload.tokens : null,
    triage_source: typeof payload.triage_source === 'string' ? payload.triage_source : 'grok',
  }
}
