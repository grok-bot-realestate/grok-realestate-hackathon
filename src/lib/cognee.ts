import type { CogneePrecedent, CogneeSearchResult } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const precedentsCache = new Map<string, CogneeSearchResult>()

function normalizePrecedent(raw: unknown): CogneePrecedent | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const excerpt = typeof rec.excerpt === 'string' ? rec.excerpt.trim() : ''
  if (!excerpt) return null
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : crypto.randomUUID()
  return {
    id,
    case_id: typeof rec.case_id === 'string' && rec.case_id.trim() ? rec.case_id.trim() : null,
    title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : null,
    property: typeof rec.property === 'string' && rec.property.trim() ? rec.property.trim() : null,
    status: typeof rec.status === 'string' && rec.status.trim() ? rec.status.trim() : null,
    outcome: typeof rec.outcome === 'string' && rec.outcome.trim() ? rec.outcome.trim() : null,
    excerpt,
    score: typeof rec.score === 'number' && Number.isFinite(rec.score) ? rec.score : null,
    similarity:
      typeof rec.similarity === 'number' && Number.isFinite(rec.similarity) ? rec.similarity : null,
    dataset:
      typeof rec.dataset === 'string' && rec.dataset.trim()
        ? rec.dataset.trim()
        : 'morning_lane_dwelly',
  }
}

export function getCachedCogneePrecedents(recordId: string): CogneeSearchResult | null {
  return precedentsCache.get(recordId) ?? null
}

export async function fetchCogneePrecedents(params: {
  recordId: string
  limit?: number
  force?: boolean
  signal?: AbortSignal
}): Promise<CogneeSearchResult> {
  const { recordId, limit = 3, force = false, signal } = params

  if (!force) {
    const cached = precedentsCache.get(recordId)
    if (cached) return cached
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or anon key is missing in this build.')
  }

  // Request 1 extra so if the record itself is a Dwelly case, we can show distinct precedents
  const requestLimit = Math.min(5, Math.max(1, limit + 1))
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/cognee-search`
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      record_id: recordId,
      limit: requestLimit,
    }),
  })

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !payload?.ok) {
    const msg =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Cognee search returned HTTP ${res.status}`
    throw new Error(msg)
  }

  const rawList = Array.isArray(payload.results) ? payload.results : []
  const normalized = rawList
    .map(normalizePrecedent)
    .filter((item): item is CogneePrecedent => item !== null)

  const selfCaseId = recordId.startsWith('r-dwelly-') ? recordId.slice(2) : null
  const withoutSelf = selfCaseId
    ? normalized.filter((item) => item.case_id !== selfCaseId)
    : normalized
  const finalResults = (withoutSelf.length > 0 ? withoutSelf : normalized).slice(0, limit)

  const result: CogneeSearchResult = {
    ok: true,
    dataset:
      typeof payload.dataset === 'string' && payload.dataset.trim()
        ? payload.dataset.trim()
        : 'morning_lane_dwelly',
    query: typeof payload.query === 'string' ? payload.query : '',
    results: finalResults,
    latency_ms: typeof payload.latency_ms === 'number' ? payload.latency_ms : 0,
  }

  precedentsCache.set(recordId, result)
  return result
}
