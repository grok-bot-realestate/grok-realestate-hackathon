export type CallSource = 'phone' | 'dwelly' | 'synthetic'
export type CaseType = 'maintenance' | 'viewing' | 'let' | 'arrears' | 'general'
export type Priority = 'urgent' | 'today' | 'week'

export type EvidenceQuote = {
  field: string
  quote: string
}

export type CallRow = {
  id: string
  source: string
  started_at: string
  duration_s: number | null
  out_of_hours: boolean
  weekday: string | null
  caller_initials: string | null
  transcript: string | null
  raw?: Record<string, unknown> | null
}

export type ActionRow = {
  id: string
  record_id: string
  action: string
  due: string | null
  done: boolean
  created_at: string
  evidence_quote?: string | null
}

export type InboxRecord = {
  id: string
  call_id: string | null
  type: string
  priority: string
  property: string | null
  issue: string | null
  callback_confirmed: boolean
  safety_check: string | null
  summary: string
  created_at: string
  triage_source: string | null
  grok_model: string | null
  grok_latency_ms: number | null
  grok_reasoning: string | null
  evidence_quotes: EvidenceQuote[]
  draft_reply: string | null
  call: CallRow | null
  actions: ActionRow[]
}

export type Kpi = {
  calls: number
  out_of_hours_pct: number
  urgent_open: number
  hours_saved: number
}

export type InboxFilter =
  | 'all'
  | 'urgent'
  | 'open'
  | 'done'
  | 'ooh'
  | 'maintenance'
  | 'viewing'
  | 'dwelly'
  | 'phone'

export type SortMode = 'newest' | 'priority'

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

export type TranscriptTurn = {
  speaker: 'assistant' | 'caller' | 'note'
  label: string
  text: string
}

export type LiveCaption = {
  id: string
  speaker: 'assistant' | 'caller'
  text: string
  timestamp: string
}

export type DispatchMode = 'contractor' | 'caller' | 'handover'

export type GrokDispatchResult = {
  ok: boolean
  record_id: string | null
  mode: DispatchMode
  subject: string
  recipient_role: string
  message: string
  checklist: string[]
  evidence_quotes: EvidenceQuote[]
  model: string
  latency_ms: number
  tokens: number | null
  triage_source: string
}

export type ToastItem = {
  id: string
  tone: 'info' | 'success' | 'error'
  message: string
}
